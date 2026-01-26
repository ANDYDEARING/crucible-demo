/**
 * battle/state.ts
 *
 * Pure data types for battle state - no Babylon.js dependencies.
 * These types enable headless game simulations without rendering.
 */

import type { UnitClass, Team, CombatStyle } from "../types";

// =============================================================================
// GRID & POSITION
// =============================================================================

/** A position on the battle grid */
export interface GridPosition {
  x: number;
  z: number;
}

/** Key format for Set/Map lookups: "x,z" */
export type GridKey = string;

/** Convert position to key for Set/Map */
export function toGridKey(x: number, z: number): GridKey {
  return `${x},${z}`;
}

/** Convert key back to position */
export function fromGridKey(key: GridKey): GridPosition {
  const [x, z] = key.split(",").map(Number);
  return { x, z };
}

// =============================================================================
// UNIT STATE
// =============================================================================

/**
 * Pure unit data for game logic - no visual references.
 * This is the data needed for simulations and AI.
 */
export interface UnitState {
  /** Unique identifier for the unit */
  id: string;

  /** Unit class (soldier, operator, medic) */
  unitClass: UnitClass;

  /** Which team the unit belongs to */
  team: Team;

  /** Current grid position */
  gridX: number;
  gridZ: number;

  /** Health */
  hp: number;
  maxHp: number;

  /** Combat stats */
  attack: number;
  healAmount: number;
  moveRange: number;
  attackRange: number;

  /** Combat style determines weapon type and attack rules */
  combatStyle: CombatStyle;

  /** Initiative system */
  speed: number;
  speedBonus: number;
  accumulator: number;
  loadoutIndex: number;

  /** Ability states */
  isConcealed: boolean;
  isCovering: boolean;
  coveredTiles: GridKey[];

  /** Action tracking for current turn */
  actionsUsed: number;
}

// =============================================================================
// PENDING ACTIONS
// =============================================================================

/** Types of actions that can be queued */
export type ActionType = "move" | "attack" | "ability";

/** A queued action waiting to be executed */
export interface QueuedAction {
  type: ActionType;
  targetX?: number;
  targetZ?: number;
  targetUnitId?: string;
  abilityName?: string;
}

// =============================================================================
// BATTLE STATE
// =============================================================================

/**
 * Complete battle state for game logic.
 * Contains all data needed to evaluate game rules without rendering.
 */
export interface BattleState {
  /** Grid dimensions */
  gridSize: number;

  /** Terrain positions (blocked tiles) */
  terrain: Set<GridKey>;

  /** All units in the battle */
  units: UnitState[];

  /** ID of the unit whose turn it is */
  currentUnitId: string | null;

  /** Actions remaining for current unit */
  actionsRemaining: number;

  /** Queued actions for preview/undo system */
  pendingActions: QueuedAction[];

  /** Original position before any pending moves */
  originalPosition: GridPosition | null;

  /** Whether the battle has ended */
  isGameOver: boolean;

  /** Winning team (if game over) */
  winner: Team | null;
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/** Create initial battle state */
export function createBattleState(gridSize: number): BattleState {
  return {
    gridSize,
    terrain: new Set(),
    units: [],
    currentUnitId: null,
    actionsRemaining: 0,
    pendingActions: [],
    originalPosition: null,
    isGameOver: false,
    winner: null,
  };
}

/** Get unit by ID */
export function getUnit(state: BattleState, id: string): UnitState | undefined {
  return state.units.find(u => u.id === id);
}

/** Get current unit */
export function getCurrentUnit(state: BattleState): UnitState | undefined {
  if (!state.currentUnitId) return undefined;
  return getUnit(state, state.currentUnitId);
}

/** Get all units on a team */
export function getTeamUnits(state: BattleState, team: Team): UnitState[] {
  return state.units.filter(u => u.team === team && u.hp > 0);
}

/** Get unit at position */
export function getUnitAt(state: BattleState, x: number, z: number): UnitState | undefined {
  return state.units.find(u => u.gridX === x && u.gridZ === z && u.hp > 0);
}

/** Check if position has terrain */
export function hasTerrain(state: BattleState, x: number, z: number): boolean {
  return state.terrain.has(toGridKey(x, z));
}

/** Check if position is within grid bounds */
export function isInBounds(state: BattleState, x: number, z: number): boolean {
  return x >= 0 && x < state.gridSize && z >= 0 && z < state.gridSize;
}

/** Check if position is blocked (terrain or unit) */
export function isBlocked(state: BattleState, x: number, z: number, excludeUnitId?: string): boolean {
  if (!isInBounds(state, x, z)) return true;
  if (hasTerrain(state, x, z)) return true;
  const unitAtPos = getUnitAt(state, x, z);
  if (unitAtPos && unitAtPos.id !== excludeUnitId) return true;
  return false;
}
