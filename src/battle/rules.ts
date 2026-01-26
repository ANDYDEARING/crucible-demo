/**
 * battle/rules.ts
 *
 * Pure game logic functions - no Babylon.js dependencies.
 * All functions operate on BattleState and return results without side effects.
 * This enables headless game simulations for AI and balancing.
 */

import type { BattleState, UnitState, GridPosition } from "./state";
import { toGridKey, hasTerrain, isInBounds, getUnitAt, getTeamUnits } from "./state";
import { ACCUMULATOR_THRESHOLD, MELEE_DAMAGE_MULTIPLIER, LOS_EPSILON } from "../config";

// =============================================================================
// GRID HELPERS
// =============================================================================

/** Cardinal directions for movement (N, S, E, W) */
const CARDINAL_DIRS = [
  { dx: 0, dz: 1 },
  { dx: 0, dz: -1 },
  { dx: 1, dz: 0 },
  { dx: -1, dz: 0 },
];

/** All 8 directions including diagonals */
const ALL_DIRS = [
  ...CARDINAL_DIRS,
  { dx: 1, dz: 1 },
  { dx: -1, dz: 1 },
  { dx: 1, dz: -1 },
  { dx: -1, dz: -1 },
];

/** Check if two positions are adjacent (including diagonals) */
export function isAdjacent(x1: number, z1: number, x2: number, z2: number): boolean {
  const dx = Math.abs(x2 - x1);
  const dz = Math.abs(z2 - z1);
  return dx <= 1 && dz <= 1 && !(dx === 0 && dz === 0);
}

/** Check if position is diagonal from another */
export function isDiagonal(x1: number, z1: number, x2: number, z2: number): boolean {
  return x1 !== x2 && z1 !== z2;
}

/** Get all 8 adjacent tiles (including diagonals), excluding terrain */
export function getAdjacentTiles(state: BattleState, x: number, z: number): GridPosition[] {
  const adjacent: GridPosition[] = [];

  for (const { dx, dz } of ALL_DIRS) {
    const nx = x + dx;
    const nz = z + dz;
    if (isInBounds(state, nx, nz) && !hasTerrain(state, nx, nz)) {
      adjacent.push({ x: nx, z: nz });
    }
  }

  return adjacent;
}

// =============================================================================
// LINE OF SIGHT
// =============================================================================

/**
 * Check intersection type between line segment and tile rectangle.
 * Uses Liang-Barsky algorithm for parametric line clipping.
 */
function lineRectIntersection(
  ax: number, az: number,
  bx: number, bz: number,
  tileX: number, tileZ: number
): "none" | "interior" | "corner" {
  const minX = tileX;
  const maxX = tileX + 1;
  const minZ = tileZ;
  const maxZ = tileZ + 1;

  const dx = bx - ax;
  const dz = bz - az;

  let tMin = 0;
  let tMax = 1;

  const edges = [
    { p: -dx, q: ax - minX },
    { p: dx, q: maxX - ax },
    { p: -dz, q: az - minZ },
    { p: dz, q: maxZ - az },
  ];

  for (const { p, q } of edges) {
    if (Math.abs(p) < LOS_EPSILON) {
      if (q < 0) return "none";
    } else {
      const t = q / p;
      if (p < 0) {
        tMin = Math.max(tMin, t);
      } else {
        tMax = Math.min(tMax, t);
      }
    }
  }

  if (tMin > tMax + LOS_EPSILON) {
    return "none";
  }

  const entryX = ax + tMin * dx;
  const entryZ = az + tMin * dz;
  const exitX = ax + tMax * dx;
  const exitZ = az + tMax * dz;

  const intersectionLength = Math.sqrt((exitX - entryX) ** 2 + (exitZ - entryZ) ** 2);
  if (intersectionLength < LOS_EPSILON) {
    const corners = [
      { x: minX, z: minZ },
      { x: minX, z: maxZ },
      { x: maxX, z: minZ },
      { x: maxX, z: maxZ },
    ];
    for (const corner of corners) {
      if (Math.abs(entryX - corner.x) < LOS_EPSILON && Math.abs(entryZ - corner.z) < LOS_EPSILON) {
        return "corner";
      }
    }
    return "interior";
  }

  return "interior";
}

/** Determine which side of a line a point is on (cross product) */
function sideOfLine(ax: number, az: number, bx: number, bz: number, px: number, pz: number): number {
  return (bx - ax) * (pz - az) - (bz - az) * (px - ax);
}

/**
 * Check if there's line of sight between two tiles.
 * Terrain blocks LOS. Units block interior intersections but not corners.
 */
export function hasLineOfSight(
  state: BattleState,
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  excludeUnitId?: string
): boolean {
  const ax = fromX + 0.5;
  const az = fromZ + 0.5;
  const bx = toX + 0.5;
  const bz = toZ + 0.5;

  let leftTerrainCorner = false;
  let rightTerrainCorner = false;

  const minTileX = Math.max(0, Math.min(fromX, toX) - 1);
  const maxTileX = Math.min(state.gridSize - 1, Math.max(fromX, toX) + 1);
  const minTileZ = Math.max(0, Math.min(fromZ, toZ) - 1);
  const maxTileZ = Math.min(state.gridSize - 1, Math.max(fromZ, toZ) + 1);

  for (let tileX = minTileX; tileX <= maxTileX; tileX++) {
    for (let tileZ = minTileZ; tileZ <= maxTileZ; tileZ++) {
      if ((tileX === fromX && tileZ === fromZ) || (tileX === toX && tileZ === toZ)) {
        continue;
      }

      const isTerrain = hasTerrain(state, tileX, tileZ);
      const unitAtTile = getUnitAt(state, tileX, tileZ);
      const hasUnit = unitAtTile && unitAtTile.id !== excludeUnitId;

      if (!isTerrain && !hasUnit) continue;

      const intersection = lineRectIntersection(ax, az, bx, bz, tileX, tileZ);

      if (intersection === "interior") {
        return false;
      }

      if (intersection === "corner" && isTerrain) {
        const tileCenterX = tileX + 0.5;
        const tileCenterZ = tileZ + 0.5;
        const side = sideOfLine(ax, az, bx, bz, tileCenterX, tileCenterZ);

        if (side > LOS_EPSILON) {
          leftTerrainCorner = true;
        } else if (side < -LOS_EPSILON) {
          rightTerrainCorner = true;
        } else {
          return false;
        }

        if (leftTerrainCorner && rightTerrainCorner) {
          return false;
        }
      }
    }
  }

  return true;
}

/** Get all tiles in line of sight from a position */
export function getTilesInLOS(
  state: BattleState,
  fromX: number,
  fromZ: number,
  excludeAdjacent: boolean,
  excludeUnitId?: string
): GridPosition[] {
  const result: GridPosition[] = [];

  for (let x = 0; x < state.gridSize; x++) {
    for (let z = 0; z < state.gridSize; z++) {
      if (x === fromX && z === fromZ) continue;
      if (hasTerrain(state, x, z)) continue;

      const distance = Math.abs(x - fromX) + Math.abs(z - fromZ);
      if (excludeAdjacent && distance === 1) continue;

      if (hasLineOfSight(state, fromX, fromZ, x, z, excludeUnitId)) {
        result.push({ x, z });
      }
    }
  }

  return result;
}

// =============================================================================
// MOVEMENT
// =============================================================================

/**
 * Get all tiles a unit can move to from a position.
 * Uses BFS for pathfinding. Cannot pass through enemies or terrain.
 */
export function getValidMoveTiles(
  state: BattleState,
  unit: UnitState,
  fromX?: number,
  fromZ?: number
): GridPosition[] {
  const startX = fromX ?? unit.gridX;
  const startZ = fromZ ?? unit.gridZ;

  const visited = new Set<string>();
  const reachable: GridPosition[] = [];
  const queue: [number, number, number][] = [[startX, startZ, 0]];
  visited.add(toGridKey(startX, startZ));

  while (queue.length > 0) {
    const [cx, cz, dist] = queue.shift()!;

    if (dist > 0 && dist <= unit.moveRange) {
      const occupied = getUnitAt(state, cx, cz);
      if (!occupied && !hasTerrain(state, cx, cz)) {
        reachable.push({ x: cx, z: cz });
      }
    }

    if (dist >= unit.moveRange) continue;

    for (const { dx, dz } of CARDINAL_DIRS) {
      const nx = cx + dx;
      const nz = cz + dz;
      const key = toGridKey(nx, nz);

      if (!isInBounds(state, nx, nz)) continue;
      if (visited.has(key)) continue;

      if (hasTerrain(state, nx, nz)) {
        visited.add(key);
        continue;
      }

      const unitAtTile = getUnitAt(state, nx, nz);
      if (unitAtTile && unitAtTile.team !== unit.team) {
        visited.add(key);
        continue;
      }

      visited.add(key);
      queue.push([nx, nz, dist + 1]);
    }
  }

  return reachable;
}

/**
 * Find shortest path from start to target using BFS.
 * Returns array of positions including start and end.
 */
export function getPathToTarget(
  state: BattleState,
  unit: UnitState,
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number
): GridPosition[] {
  const visited = new Set<string>();
  const parent = new Map<string, string | null>();

  const queue: [number, number][] = [[fromX, fromZ]];
  const startKey = toGridKey(fromX, fromZ);
  visited.add(startKey);
  parent.set(startKey, null);

  while (queue.length > 0) {
    const [cx, cz] = queue.shift()!;
    const currentKey = toGridKey(cx, cz);

    if (cx === toX && cz === toZ) {
      const path: GridPosition[] = [];
      let key: string | null = currentKey;
      while (key) {
        const [x, z] = key.split(",").map(Number);
        path.unshift({ x, z });
        key = parent.get(key) || null;
      }
      return path;
    }

    for (const { dx, dz } of CARDINAL_DIRS) {
      const nx = cx + dx;
      const nz = cz + dz;
      const key = toGridKey(nx, nz);

      if (!isInBounds(state, nx, nz)) continue;
      if (visited.has(key)) continue;
      if (hasTerrain(state, nx, nz)) continue;

      const unitAtTile = getUnitAt(state, nx, nz);
      if (unitAtTile && unitAtTile.team !== unit.team) continue;

      visited.add(key);
      parent.set(key, currentKey);
      queue.push([nx, nz]);
    }
  }

  return [{ x: fromX, z: fromZ }, { x: toX, z: toZ }];
}

// =============================================================================
// COMBAT - TARGETING
// =============================================================================

/**
 * Get valid attack tiles for a unit based on weapon type.
 * Melee: All 8 adjacent tiles (diagonals need LOS)
 * Ranged: All LOS tiles except adjacent
 */
export function getValidAttackTiles(
  state: BattleState,
  unit: UnitState,
  fromX?: number,
  fromZ?: number
): { x: number; z: number; hasLOS: boolean }[] {
  const x = fromX ?? unit.gridX;
  const z = fromZ ?? unit.gridZ;
  const isMelee = unit.combatStyle === "melee";

  if (isMelee) {
    const adjacent = getAdjacentTiles(state, x, z);
    return adjacent.map(tile => {
      const diag = isDiagonal(x, z, tile.x, tile.z);
      const los = diag ? hasLineOfSight(state, x, z, tile.x, tile.z, unit.id) : true;
      return { x: tile.x, z: tile.z, hasLOS: los };
    });
  } else {
    const losTiles = getTilesInLOS(state, x, z, true, unit.id);
    return losTiles.map(tile => ({ x: tile.x, z: tile.z, hasLOS: true }));
  }
}

/** Get enemies that can be attacked from a position */
export function getAttackableEnemies(
  state: BattleState,
  unit: UnitState,
  fromX?: number,
  fromZ?: number
): UnitState[] {
  const validTiles = getValidAttackTiles(state, unit, fromX, fromZ);
  const enemyTeam = unit.team === "player1" ? "player2" : "player1";

  return state.units.filter(u => {
    if (u.team !== enemyTeam || u.hp <= 0) return false;
    const tile = validTiles.find(t => t.x === u.gridX && t.z === u.gridZ);
    return tile && tile.hasLOS;
  });
}

/**
 * Get allies that can be healed from a position.
 * Heal works on self or all 8 adjacent tiles (diagonals need LOS).
 */
export function getHealableAllies(
  state: BattleState,
  unit: UnitState,
  fromX?: number,
  fromZ?: number
): UnitState[] {
  if (unit.healAmount <= 0) return [];

  const effectiveX = fromX ?? unit.gridX;
  const effectiveZ = fromZ ?? unit.gridZ;

  return state.units.filter(u => {
    if (u.team !== unit.team) return false;
    if (u.hp >= u.maxHp) return false;

    // Self-heal always allowed
    if (u.gridX === effectiveX && u.gridZ === effectiveZ) {
      return true;
    }

    // Check if adjacent
    if (!isAdjacent(effectiveX, effectiveZ, u.gridX, u.gridZ)) {
      return false;
    }

    // Diagonals need LOS
    const diag = isDiagonal(effectiveX, effectiveZ, u.gridX, u.gridZ);
    return diag ? hasLineOfSight(state, effectiveX, effectiveZ, u.gridX, u.gridZ, unit.id) : true;
  });
}

// =============================================================================
// COMBAT - DAMAGE CALCULATION
// =============================================================================

/** Calculate damage for an attack */
export function calculateDamage(attacker: UnitState, _defender: UnitState): number {
  const isMelee = attacker.combatStyle === "melee";
  return isMelee ? attacker.attack * MELEE_DAMAGE_MULTIPLIER : attacker.attack;
}

/** Apply damage to a unit, returns true if unit dies */
export function applyDamage(unit: UnitState, damage: number): boolean {
  unit.hp = Math.max(0, unit.hp - damage);
  return unit.hp <= 0;
}

/** Apply healing to a unit */
export function applyHealing(healer: UnitState, target: UnitState): number {
  const healedAmount = Math.min(healer.healAmount, target.maxHp - target.hp);
  target.hp += healedAmount;
  return healedAmount;
}

// =============================================================================
// TURN SYSTEM
// =============================================================================

/** Get effective speed including bonuses */
export function getEffectiveSpeed(unit: UnitState): number {
  return unit.speed + unit.speedBonus;
}

/**
 * Get next unit to act based on accumulator system.
 * Units accumulate speed each round until reaching threshold.
 */
export function getNextUnitByAccumulator(state: BattleState): UnitState | null {
  const aliveUnits = state.units.filter(u => u.hp > 0);
  if (aliveUnits.length === 0) return null;

  // Find unit with highest accumulator >= threshold
  let readyUnits = aliveUnits.filter(u => u.accumulator >= ACCUMULATOR_THRESHOLD);

  while (readyUnits.length === 0) {
    // Tick all units
    for (const unit of aliveUnits) {
      unit.accumulator += getEffectiveSpeed(unit);
    }
    readyUnits = aliveUnits.filter(u => u.accumulator >= ACCUMULATOR_THRESHOLD);
  }

  // Sort by accumulator (desc), then speed (desc), then loadout index (asc)
  readyUnits.sort((a, b) => {
    if (b.accumulator !== a.accumulator) return b.accumulator - a.accumulator;
    const speedA = getEffectiveSpeed(a);
    const speedB = getEffectiveSpeed(b);
    if (speedB !== speedA) return speedB - speedA;
    return a.loadoutIndex - b.loadoutIndex;
  });

  return readyUnits[0];
}

// =============================================================================
// WIN CONDITION
// =============================================================================

/** Check if a team has won (all enemies dead) */
export function checkWinCondition(state: BattleState): { isOver: boolean; winner: "player1" | "player2" | null } {
  const player1Alive = getTeamUnits(state, "player1").length > 0;
  const player2Alive = getTeamUnits(state, "player2").length > 0;

  if (!player1Alive && !player2Alive) {
    return { isOver: true, winner: null }; // Draw
  }
  if (!player1Alive) {
    return { isOver: true, winner: "player2" };
  }
  if (!player2Alive) {
    return { isOver: true, winner: "player1" };
  }

  return { isOver: false, winner: null };
}

// =============================================================================
// COVER SYSTEM
// =============================================================================

/**
 * Get tiles a unit would cover based on weapon type.
 * Melee: All 8 adjacent tiles (diagonals need LOS)
 * Ranged: All LOS tiles (not adjacent)
 */
export function getCoverTiles(
  state: BattleState,
  unit: UnitState,
  fromX?: number,
  fromZ?: number
): GridPosition[] {
  const x = fromX ?? unit.gridX;
  const z = fromZ ?? unit.gridZ;
  const isMelee = unit.combatStyle === "melee";

  if (isMelee) {
    const adjacent = getAdjacentTiles(state, x, z);
    return adjacent.filter(tile => {
      const diag = isDiagonal(x, z, tile.x, tile.z);
      return !diag || hasLineOfSight(state, x, z, tile.x, tile.z, unit.id);
    });
  } else {
    return getTilesInLOS(state, x, z, true, unit.id);
  }
}

/** Check if a tile is covered by an enemy unit */
export function getEnemyCoveringTile(
  state: BattleState,
  x: number,
  z: number,
  forUnit: UnitState
): UnitState | null {
  for (const unit of state.units) {
    if (unit.team === forUnit.team || unit.hp <= 0 || !unit.isCovering) continue;
    if (unit.coveredTiles.includes(toGridKey(x, z))) {
      return unit;
    }
  }
  return null;
}
