/**
 * battle/index.ts
 *
 * Battle system exports - pure game logic without Babylon.js dependencies.
 * Use these modules for headless simulations, AI, and game balancing.
 */

// State types and helpers
export {
  type GridPosition,
  type GridKey,
  type UnitState,
  type QueuedAction,
  type ActionType,
  type BattleState,
  toGridKey,
  fromGridKey,
  createBattleState,
  getUnit,
  getCurrentUnit,
  getTeamUnits,
  getUnitAt,
  hasTerrain,
  isInBounds,
  isBlocked,
} from "./state";

// Game rules
export {
  // Grid helpers
  isAdjacent,
  isDiagonal,
  getAdjacentTiles,

  // Line of sight
  hasLineOfSight,
  getTilesInLOS,

  // Movement
  getValidMoveTiles,
  getPathToTarget,

  // Combat - targeting
  getValidAttackTiles,
  getAttackableEnemies,
  getHealableAllies,

  // Combat - damage
  calculateDamage,
  applyDamage,
  applyHealing,

  // Turn system
  getEffectiveSpeed,
  getNextUnitByAccumulator,

  // Win condition
  checkWinCondition,

  // Cover system
  getCoverTiles,
  getEnemyCoveringTile,
} from "./rules";
