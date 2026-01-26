/**
 * battle/controllers.ts
 *
 * Controller abstraction for different input sources.
 * Enables PvE (Human vs AI), PvP (Human vs Network), and simulations (AI vs AI).
 */

import type { BattleCommand } from "./commands";
import type { BattleState, UnitState } from "./state";
import {
  getValidMoveTiles,
  getAttackableEnemies,
  getHealableAllies,
} from "./rules";

// =============================================================================
// CONTROLLER INTERFACE
// =============================================================================

/**
 * Callback to issue a command from a controller.
 * Returns true if the command was accepted.
 */
export type IssueCommandFn = (command: BattleCommand) => boolean;

/**
 * Callback to execute all queued commands and end the turn.
 */
export type ExecuteTurnFn = () => void;

/**
 * Context provided to controllers for decision making.
 */
export interface ControllerContext {
  /** Current battle state (read-only snapshot) */
  state: BattleState;

  /** The unit whose turn it is */
  unit: UnitState;

  /** Issue a command (move, attack, etc.) */
  issueCommand: IssueCommandFn;

  /** Execute queued commands and end turn */
  executeTurn: ExecuteTurnFn;

  /** Undo the last queued command */
  undoLastCommand: () => void;

  /** Get number of actions remaining */
  actionsRemaining: number;
}

/**
 * Controller interface - handles input for one team.
 * Different implementations enable human play, AI, and network play.
 */
export interface Controller {
  /** Controller type identifier */
  readonly type: "human" | "ai" | "network";

  /**
   * Called when a unit controlled by this controller starts its turn.
   * The controller should issue commands via context.issueCommand()
   * and call context.executeTurn() when ready.
   */
  onTurnStart(context: ControllerContext): void;

  /**
   * Called when the turn ends (after execution completes).
   */
  onTurnEnd?(): void;

  /**
   * Called when the game ends.
   */
  onGameEnd?(winner: "player1" | "player2" | null): void;

  /**
   * Cleanup resources.
   */
  dispose?(): void;
}

// =============================================================================
// HUMAN CONTROLLER
// =============================================================================

/**
 * Human controller - delegates to UI for input.
 * The actual input handling remains in BattleScene; this controller
 * just signals that the turn is ready for human input.
 */
export class HumanController implements Controller {
  readonly type = "human" as const;

  private currentContext: ControllerContext | null = null;

  onTurnStart(context: ControllerContext): void {
    this.currentContext = context;
    // Human controller doesn't auto-act; UI handles input
    // The context is stored so external UI can call issueCommand/executeTurn
  }

  onTurnEnd(): void {
    this.currentContext = null;
  }

  /** Get current context (for UI to issue commands) */
  getContext(): ControllerContext | null {
    return this.currentContext;
  }

  /** Check if it's this controller's turn */
  isMyTurn(): boolean {
    return this.currentContext !== null;
  }
}

// =============================================================================
// AI CONTROLLER
// =============================================================================

/** AI difficulty affects decision quality */
export type AIDifficulty = "easy" | "medium" | "hard";

/**
 * AI controller - makes decisions automatically.
 * Uses game rules to evaluate options and pick actions.
 */
export class AIController implements Controller {
  readonly type = "ai" as const;

  private difficulty: AIDifficulty;
  private thinkingDelay: number;

  constructor(difficulty: AIDifficulty = "medium", thinkingDelayMs: number = 500) {
    this.difficulty = difficulty;
    this.thinkingDelay = thinkingDelayMs;
  }

  onTurnStart(context: ControllerContext): void {
    // Add delay to make AI feel more natural
    setTimeout(() => {
      this.think(context);
    }, this.thinkingDelay);
  }

  private think(context: ControllerContext): void {
    const { state, unit } = context;

    // Simple AI logic - can be expanded based on difficulty
    let actionsUsed = 0;
    const maxActions = context.actionsRemaining;

    // Priority: Attack > Heal > Ability > Move
    while (actionsUsed < maxActions) {
      const action = this.chooseBestAction(state, unit, actionsUsed);

      if (!action) {
        // No good action found, end turn
        break;
      }

      const accepted = context.issueCommand(action);
      if (accepted) {
        actionsUsed++;

        // Update unit position for next iteration if it was a move
        if (action.type === "move") {
          unit.gridX = action.targetX;
          unit.gridZ = action.targetZ;
        }
      } else {
        // Command rejected, try something else or end turn
        break;
      }
    }

    // Execute all queued actions
    setTimeout(() => {
      context.executeTurn();
    }, this.thinkingDelay / 2);
  }

  private chooseBestAction(
    state: BattleState,
    unit: UnitState,
    actionsUsed: number
  ): BattleCommand | null {
    const enemies = getAttackableEnemies(state, unit);
    const healTargets = getHealableAllies(state, unit);
    const moveTiles = getValidMoveTiles(state, unit);
    const enemyTeam = unit.team === "player1" ? "player2" : "player1";
    const allEnemies = state.units.filter(u => u.team === enemyTeam && u.hp > 0);
    const allAllies = state.units.filter(u => u.team === unit.team && u.hp > 0 && u.id !== unit.id);
    const isMelee = unit.combatStyle === "melee";
    const isMedic = unit.unitClass === "medic";

    // === MEDIC SPECIAL BEHAVIOR ===
    if (isMedic) {
      // Medics prioritize safety and healing

      // If can kill an enemy in one hit, take the shot
      const oneHitKills = enemies.filter(e => e.hp <= unit.attack);
      if (oneHitKills.length > 0) {
        const target = this.selectAttackTarget(oneHitKills);
        return { type: "attack", targetUnitId: target.id };
      }

      // If allies need healing, heal them
      if (healTargets.length > 0) {
        const target = this.selectHealTarget(healTargets);
        return { type: "heal", targetUnitId: target.id };
      }

      // If no allies left, fight
      if (allAllies.length === 0 && enemies.length > 0) {
        const target = this.selectAttackTarget(enemies);
        return { type: "attack", targetUnitId: target.id };
      }

      // Otherwise stay put (don't advance toward enemies)
      return null;
    }

    // === COMBAT UNITS (Soldier/Operator) ===

    // If we can attack, do it
    if (enemies.length > 0) {
      const target = this.selectAttackTarget(enemies);
      return { type: "attack", targetUnitId: target.id };
    }

    // Melee units: move to close distance if no enemies in range
    if (isMelee && moveTiles.length > 0 && allEnemies.length > 0) {
      const bestMove = this.selectMoveTowardEnemy(unit, moveTiles, allEnemies, true);
      if (bestMove) {
        return { type: "move", targetX: bestMove.x, targetZ: bestMove.z };
      }
    }

    // Ranged units: move to get better position/LOS
    if (!isMelee && moveTiles.length > 0 && allEnemies.length > 0 && actionsUsed === 0) {
      // Only move on first action to avoid wasting both actions on movement
      const bestMove = this.selectMoveForRanged(state, unit, moveTiles, allEnemies);
      if (bestMove) {
        return { type: "move", targetX: bestMove.x, targetZ: bestMove.z };
      }
    }

    // Use ability if nothing else to do
    if (unit.unitClass === "operator" && !unit.isConcealed) {
      return { type: "conceal" };
    }
    if (unit.unitClass === "soldier" && !unit.isCovering) {
      return { type: "cover" };
    }

    return null;
  }

  private selectAttackTarget(enemies: UnitState[]): UnitState {
    // Easy: random, Medium: lowest HP, Hard: best tactical choice
    if (this.difficulty === "easy") {
      return enemies[Math.floor(Math.random() * enemies.length)];
    }

    // Target lowest HP enemy (finish them off)
    return enemies.reduce((best, e) => (e.hp < best.hp ? e : best), enemies[0]);
  }

  private selectHealTarget(allies: UnitState[]): UnitState {
    // Heal the ally with lowest HP percentage
    return allies.reduce((best, a) => {
      const bestPercent = best.hp / best.maxHp;
      const aPercent = a.hp / a.maxHp;
      return aPercent < bestPercent ? a : best;
    }, allies[0]);
  }

  private selectMoveTowardEnemy(
    unit: UnitState,
    moveTiles: { x: number; z: number }[],
    enemies: UnitState[],
    alwaysMove: boolean = false
  ): { x: number; z: number } | null {
    // Find move that gets closest to any enemy
    let bestMove: { x: number; z: number } | null = null;
    let bestDistance = Infinity;

    for (const tile of moveTiles) {
      for (const enemy of enemies) {
        const distance = Math.abs(tile.x - enemy.gridX) + Math.abs(tile.z - enemy.gridZ);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestMove = tile;
        }
      }
    }

    // Check current minimum distance to any enemy
    const currentMinDistance = enemies.reduce((min, e) => {
      const d = Math.abs(unit.gridX - e.gridX) + Math.abs(unit.gridZ - e.gridZ);
      return Math.min(min, d);
    }, Infinity);

    // For melee units (alwaysMove=true), always move if it helps
    // For ranged units, only move if it significantly improves position
    if (!alwaysMove && bestDistance >= currentMinDistance) {
      return null; // Moving doesn't help
    }

    // Don't return a move if it doesn't improve distance
    if (bestDistance >= currentMinDistance) {
      return null;
    }

    return bestMove;
  }

  private selectMoveForRanged(
    state: BattleState,
    unit: UnitState,
    moveTiles: { x: number; z: number }[],
    _enemies: UnitState[]
  ): { x: number; z: number } | null {
    // For ranged units, find a tile that gives us attackable enemies
    // Prefer tiles where we can hit enemies we couldn't hit before

    let bestMove: { x: number; z: number } | null = null;
    let bestScore = 0;

    for (const tile of moveTiles) {
      // Simulate being at this tile and check what we can attack
      const simulatedUnit = { ...unit, gridX: tile.x, gridZ: tile.z };
      const attackableFromTile = getAttackableEnemies(state, simulatedUnit);

      // Score based on number of targets and their HP (prefer finishing low HP)
      let score = attackableFromTile.length;
      for (const target of attackableFromTile) {
        if (target.hp <= unit.attack) {
          score += 2; // Bonus for potential kills
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestMove = tile;
      }
    }

    // Only move if we can attack from the new position
    return bestScore > 0 ? bestMove : null;
  }
}

// =============================================================================
// NETWORK CONTROLLER
// =============================================================================

/**
 * Callback to send commands to remote player.
 */
export type SendCommandFn = (command: BattleCommand) => void;

/**
 * Network controller - receives commands from a remote player.
 * Used for online PvP.
 */
export class NetworkController implements Controller {
  readonly type = "network" as const;

  private currentContext: ControllerContext | null = null;
  private onSendCommand: SendCommandFn | null = null;

  /**
   * Set callback for sending commands to remote player.
   * This is called when it's the remote player's turn.
   */
  setSendCallback(callback: SendCommandFn): void {
    this.onSendCommand = callback;
  }

  onTurnStart(context: ControllerContext): void {
    this.currentContext = context;
    // Network controller waits for commands from remote
    // Commands come in via receiveCommand()
  }

  onTurnEnd(): void {
    this.currentContext = null;
  }

  /**
   * Receive a command from the remote player.
   * Called by network layer when a command arrives.
   */
  receiveCommand(command: BattleCommand): boolean {
    if (!this.currentContext) {
      console.warn("Received command but it's not this controller's turn");
      return false;
    }
    return this.currentContext.issueCommand(command);
  }

  /**
   * Signal from remote that turn should execute.
   */
  receiveExecute(): void {
    if (this.currentContext) {
      this.currentContext.executeTurn();
    }
  }

  /**
   * Send a command to remote player (when we're the local player).
   * Used in the other direction for syncing.
   */
  sendCommand(command: BattleCommand): void {
    this.onSendCommand?.(command);
  }
}

// =============================================================================
// CONTROLLER MANAGER
// =============================================================================

/**
 * Manages controllers for both teams.
 * Routes turn notifications to the appropriate controller.
 */
export class ControllerManager {
  private player1Controller: Controller;
  private player2Controller: Controller;

  constructor(player1: Controller, player2: Controller) {
    this.player1Controller = player1;
    this.player2Controller = player2;
  }

  /** Get controller for a team */
  getController(team: "player1" | "player2"): Controller {
    return team === "player1" ? this.player1Controller : this.player2Controller;
  }

  /** Set controller for a team */
  setController(team: "player1" | "player2", controller: Controller): void {
    if (team === "player1") {
      this.player1Controller = controller;
    } else {
      this.player2Controller = controller;
    }
  }

  /** Notify appropriate controller that a turn is starting */
  notifyTurnStart(team: "player1" | "player2", context: ControllerContext): void {
    const controller = this.getController(team);
    controller.onTurnStart(context);
  }

  /** Notify controller that turn ended */
  notifyTurnEnd(team: "player1" | "player2"): void {
    const controller = this.getController(team);
    controller.onTurnEnd?.();
  }

  /** Notify controllers that game ended */
  notifyGameEnd(winner: "player1" | "player2" | null): void {
    this.player1Controller.onGameEnd?.(winner);
    this.player2Controller.onGameEnd?.(winner);
  }

  /** Cleanup both controllers */
  dispose(): void {
    this.player1Controller.dispose?.();
    this.player2Controller.dispose?.();
  }

  /** Check if a team is controlled by AI */
  isAI(team: "player1" | "player2"): boolean {
    return this.getController(team).type === "ai";
  }

  /** Check if a team is controlled by human */
  isHuman(team: "player1" | "player2"): boolean {
    return this.getController(team).type === "human";
  }
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/** Create controllers for local PvP (both human) */
export function createLocalPvPControllers(): ControllerManager {
  return new ControllerManager(
    new HumanController(),
    new HumanController()
  );
}

/** Create controllers for PvE (human vs AI) */
export function createPvEControllers(
  humanTeam: "player1" | "player2" = "player1",
  aiDifficulty: AIDifficulty = "medium"
): ControllerManager {
  const human = new HumanController();
  const ai = new AIController(aiDifficulty);

  return humanTeam === "player1"
    ? new ControllerManager(human, ai)
    : new ControllerManager(ai, human);
}

/** Create controllers for AI vs AI (simulations) */
export function createSimulationControllers(
  difficulty1: AIDifficulty = "medium",
  difficulty2: AIDifficulty = "medium",
  thinkingDelay: number = 100
): ControllerManager {
  return new ControllerManager(
    new AIController(difficulty1, thinkingDelay),
    new AIController(difficulty2, thinkingDelay)
  );
}
