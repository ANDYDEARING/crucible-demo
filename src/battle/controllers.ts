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
  checkWinCondition,
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

    // Check if game is already over
    const gameStatus = checkWinCondition(state);
    if (gameStatus.isOver) {
      return; // Don't act if game is over
    }

    let actionsUsed = 0;
    const maxActions = context.actionsRemaining;

    // Plan all actions for this turn
    while (actionsUsed < maxActions) {
      const action = this.chooseBestAction(state, unit, actionsUsed, maxActions);

      if (!action) {
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
        // Track conceal state
        if (action.type === "conceal") {
          unit.isConcealed = true;
        }
      } else {
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
    actionsUsed: number,
    maxActions: number
  ): BattleCommand | null {
    const enemies = getAttackableEnemies(state, unit);
    const moveTiles = getValidMoveTiles(state, unit);
    const enemyTeam = unit.team === "player1" ? "player2" : "player1";
    const allEnemies = state.units.filter(u => u.team === enemyTeam && u.hp > 0);
    const isMelee = unit.combatStyle === "melee";
    const actionsLeft = maxActions - actionsUsed;

    // === GENERAL OVERRIDE: Can we kill an enemy within our remaining actions? ===
    const killOpportunity = this.findKillOpportunity(state, unit, actionsLeft, enemies, moveTiles, allEnemies);
    if (killOpportunity) {
      return killOpportunity;
    }

    // === GENERAL OVERRIDE: Ranged unit with no targets - back up to get a shot ===
    // This applies to ALL ranged units (including medics) when enemies are adjacent
    if (!isMelee && enemies.length === 0 && allEnemies.length > 0 && moveTiles.length > 0) {
      const backupMove = this.findBackupPositionForRanged(state, unit, moveTiles, allEnemies);
      if (backupMove) {
        return { type: "move", targetX: backupMove.x, targetZ: backupMove.z };
      }
    }

    // === CLASS-SPECIFIC BEHAVIOR ===
    switch (unit.unitClass) {
      case "operator":
        return this.operatorBehavior(state, unit, actionsUsed, enemies, moveTiles, allEnemies, isMelee);

      case "soldier":
        return this.soldierBehavior(state, unit, actionsUsed, enemies, moveTiles, allEnemies, isMelee);

      case "medic":
        return this.medicBehavior(state, unit, actionsUsed, actionsLeft, enemies, moveTiles, allEnemies);

      default:
        return null;
    }
  }

  private findKillOpportunity(
    state: BattleState,
    unit: UnitState,
    actionsLeft: number,
    currentEnemies: UnitState[],
    moveTiles: { x: number; z: number }[],
    _allEnemies: UnitState[]
  ): BattleCommand | null {
    const isMelee = unit.combatStyle === "melee";
    const damage = isMelee ? unit.attack * 2 : unit.attack; // Melee does 2x damage

    // Can kill from current position?
    for (const enemy of currentEnemies) {
      if (enemy.hp <= damage) {
        return { type: "attack", targetUnitId: enemy.id };
      }
      // Can kill with 2 attacks?
      if (actionsLeft >= 2 && enemy.hp <= damage * 2) {
        return { type: "attack", targetUnitId: enemy.id };
      }
    }

    // Can move and kill?
    if (actionsLeft >= 2 && moveTiles.length > 0) {
      for (const tile of moveTiles) {
        const simulatedUnit = { ...unit, gridX: tile.x, gridZ: tile.z };
        const enemiesFromTile = getAttackableEnemies(state, simulatedUnit);
        for (const enemy of enemiesFromTile) {
          if (enemy.hp <= damage) {
            return { type: "move", targetX: tile.x, targetZ: tile.z };
          }
        }
      }
    }

    return null;
  }

  private operatorBehavior(
    state: BattleState,
    unit: UnitState,
    _actionsUsed: number,
    enemies: UnitState[],
    moveTiles: { x: number; z: number }[],
    allEnemies: UnitState[],
    isMelee: boolean
  ): BattleCommand | null {
    // Operator: Get conceal before doing anything else
    if (!unit.isConcealed) {
      return { type: "conceal" };
    }

    // Already concealed, proceed with combat
    if (isMelee) {
      // Melee Operative: try to get in melee range, if there, strike
      if (enemies.length > 0) {
        const target = this.selectAttackTarget(enemies);
        return { type: "attack", targetUnitId: target.id };
      }
      // Move toward enemies
      if (moveTiles.length > 0 && allEnemies.length > 0) {
        const bestMove = this.selectMoveTowardEnemy(unit, moveTiles, allEnemies, true);
        if (bestMove) {
          return { type: "move", targetX: bestMove.x, targetZ: bestMove.z };
        }
      }
    } else {
      // Ranged Operative: shoot twice if possible, or move+shoot, or move+move
      if (enemies.length > 0) {
        const target = this.selectAttackTarget(enemies);
        return { type: "attack", targetUnitId: target.id };
      }
      // No targets - move to get targets
      if (moveTiles.length > 0 && allEnemies.length > 0) {
        const bestMove = this.selectMoveForRanged(state, unit, moveTiles, allEnemies);
        if (bestMove) {
          return { type: "move", targetX: bestMove.x, targetZ: bestMove.z };
        }
        // No shot possible even after move - just move closer
        const closeMove = this.selectMoveTowardEnemy(unit, moveTiles, allEnemies, true);
        if (closeMove) {
          return { type: "move", targetX: closeMove.x, targetZ: closeMove.z };
        }
      }
    }

    return null;
  }

  private soldierBehavior(
    state: BattleState,
    unit: UnitState,
    actionsUsed: number,
    enemies: UnitState[],
    moveTiles: { x: number; z: number }[],
    allEnemies: UnitState[],
    isMelee: boolean
  ): BattleCommand | null {
    // Soldier: attack if possible
    if (enemies.length > 0) {
      const target = this.selectAttackTarget(enemies);
      return { type: "attack", targetUnitId: target.id };
    }

    // No targets - try to move
    if (moveTiles.length > 0 && allEnemies.length > 0) {
      if (isMelee) {
        const bestMove = this.selectMoveTowardEnemy(unit, moveTiles, allEnemies, true);
        if (bestMove) {
          // Check if we'll have targets after moving
          const simulatedUnit = { ...unit, gridX: bestMove.x, gridZ: bestMove.z };
          const enemiesAfterMove = getAttackableEnemies(state, simulatedUnit);
          if (enemiesAfterMove.length > 0 || actionsUsed === 0) {
            return { type: "move", targetX: bestMove.x, targetZ: bestMove.z };
          }
        }
      } else {
        const bestMove = this.selectMoveForRanged(state, unit, moveTiles, allEnemies);
        if (bestMove) {
          return { type: "move", targetX: bestMove.x, targetZ: bestMove.z };
        }
      }
    }

    // No target available after first move - use cover
    if (actionsUsed > 0 && !unit.isCovering) {
      return { type: "cover" };
    }

    // First action with no good moves - just cover
    if (!unit.isCovering) {
      return { type: "cover" };
    }

    return null;
  }

  private medicBehavior(
    state: BattleState,
    unit: UnitState,
    _actionsUsed: number,
    actionsLeft: number,
    enemies: UnitState[],
    moveTiles: { x: number; z: number }[],
    allEnemies: UnitState[]
  ): BattleCommand | null {
    const healTargets = getHealableAllies(state, unit);
    const allAllies = state.units.filter(u => u.team === unit.team && u.hp > 0);

    // Check for very injured ally who could benefit from double heal (and we're adjacent)
    if (actionsLeft >= 2 && healTargets.length > 0) {
      const veryInjured = healTargets.find(ally => {
        const missingHp = ally.maxHp - ally.hp;
        return missingHp >= unit.healAmount * 1.5; // Can benefit from 2 heals
      });
      if (veryInjured) {
        return { type: "heal", targetUnitId: veryInjured.id };
      }
    }

    // Check for injured ally we can heal now
    if (healTargets.length > 0) {
      const target = this.selectHealTarget(healTargets);
      return { type: "heal", targetUnitId: target.id };
    }

    // Check for injured ally we could reach by moving
    if (moveTiles.length > 0) {
      const injuredAllies = allAllies.filter(a => a.hp < a.maxHp && a.id !== unit.id);
      if (injuredAllies.length > 0) {
        const moveToHeal = this.selectMoveTowardAlly(unit, moveTiles, injuredAllies);
        if (moveToHeal) {
          return { type: "move", targetX: moveToHeal.x, targetZ: moveToHeal.z };
        }
      }
    }

    // No healing needed - attack if possible
    if (enemies.length > 0) {
      const target = this.selectAttackTarget(enemies);
      return { type: "attack", targetUnitId: target.id };
    }

    // No allies left except self - fight
    if (allAllies.length <= 1 && moveTiles.length > 0 && allEnemies.length > 0) {
      const bestMove = this.selectMoveForRanged(state, unit, moveTiles, allEnemies);
      if (bestMove) {
        return { type: "move", targetX: bestMove.x, targetZ: bestMove.z };
      }
    }

    // Nothing to do - move to position behind allies relative to enemies
    if (moveTiles.length > 0 && allAllies.length > 1 && allEnemies.length > 0) {
      const safePosition = this.selectSafePositionBehindAllies(unit, moveTiles, allAllies, allEnemies);
      if (safePosition) {
        return { type: "move", targetX: safePosition.x, targetZ: safePosition.z };
      }
    }

    return null;
  }

  private selectSafePositionBehindAllies(
    unit: UnitState,
    moveTiles: { x: number; z: number }[],
    allies: UnitState[],
    enemies: UnitState[]
  ): { x: number; z: number } | null {
    // Calculate average enemy position
    const enemyCenter = {
      x: enemies.reduce((sum, e) => sum + e.gridX, 0) / enemies.length,
      z: enemies.reduce((sum, e) => sum + e.gridZ, 0) / enemies.length,
    };

    // Calculate average ally position (excluding self)
    const otherAllies = allies.filter(a => a.id !== unit.id);
    if (otherAllies.length === 0) return null;

    const allyCenter = {
      x: otherAllies.reduce((sum, a) => sum + a.gridX, 0) / otherAllies.length,
      z: otherAllies.reduce((sum, a) => sum + a.gridZ, 0) / otherAllies.length,
    };

    let bestMove: { x: number; z: number } | null = null;
    let bestScore = -Infinity;

    for (const tile of moveTiles) {
      // Score based on:
      // 1. Being close to allies (positive)
      // 2. Being far from enemies (positive)
      // 3. Being "behind" allies relative to enemies (positive)

      const distToAllies = Math.abs(tile.x - allyCenter.x) + Math.abs(tile.z - allyCenter.z);
      const distToEnemies = Math.abs(tile.x - enemyCenter.x) + Math.abs(tile.z - enemyCenter.z);

      // Vector from enemy center to ally center (the "front line" direction)
      const frontX = allyCenter.x - enemyCenter.x;
      const frontZ = allyCenter.z - enemyCenter.z;

      // Vector from ally center to this tile
      const tileX = tile.x - allyCenter.x;
      const tileZ = tile.z - allyCenter.z;

      // Dot product - positive means "behind" allies (away from enemies)
      const behindScore = (tileX * frontX + tileZ * frontZ);

      // Combined score: close to allies, far from enemies, behind the front line
      const score = -distToAllies * 2 + distToEnemies + behindScore * 3;

      if (score > bestScore) {
        bestScore = score;
        bestMove = tile;
      }
    }

    // Only move if it's actually an improvement
    const currentDistToAllies = Math.abs(unit.gridX - allyCenter.x) + Math.abs(unit.gridZ - allyCenter.z);
    const currentDistToEnemies = Math.abs(unit.gridX - enemyCenter.x) + Math.abs(unit.gridZ - enemyCenter.z);
    const currentScore = -currentDistToAllies * 2 + currentDistToEnemies;

    if (bestScore <= currentScore) {
      return null;
    }

    return bestMove;
  }

  private selectMoveTowardAlly(
    unit: UnitState,
    moveTiles: { x: number; z: number }[],
    allies: UnitState[]
  ): { x: number; z: number } | null {
    let bestMove: { x: number; z: number } | null = null;
    let bestDistance = Infinity;

    for (const tile of moveTiles) {
      for (const ally of allies) {
        const distance = Math.abs(tile.x - ally.gridX) + Math.abs(tile.z - ally.gridZ);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestMove = tile;
        }
      }
    }

    const currentMinDistance = allies.reduce((min, a) => {
      const d = Math.abs(unit.gridX - a.gridX) + Math.abs(unit.gridZ - a.gridZ);
      return Math.min(min, d);
    }, Infinity);

    if (bestDistance >= currentMinDistance) {
      return null;
    }

    return bestMove;
  }

  private findBackupPositionForRanged(
    state: BattleState,
    unit: UnitState,
    moveTiles: { x: number; z: number }[],
    _enemies: UnitState[]
  ): { x: number; z: number } | null {
    // Ranged units can't hit adjacent tiles, so if enemies are too close,
    // find a position to back up to where we can get a shot

    let bestMove: { x: number; z: number } | null = null;
    let bestScore = 0;

    for (const tile of moveTiles) {
      // Check what we can attack from this position
      const simulatedUnit = { ...unit, gridX: tile.x, gridZ: tile.z };
      const attackableFromTile = getAttackableEnemies(state, simulatedUnit);

      if (attackableFromTile.length > 0) {
        // Score based on number of targets and preferring closer positions
        const distFromCurrent = Math.abs(tile.x - unit.gridX) + Math.abs(tile.z - unit.gridZ);
        const score = attackableFromTile.length * 10 - distFromCurrent;

        if (score > bestScore) {
          bestScore = score;
          bestMove = tile;
        }
      }
    }

    return bestMove;
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
