import {
  Engine,
  Scene,
  ArcRotateCamera,
  Vector3,
  HemisphericLight,
  DirectionalLight,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Mesh,
  PointerEventTypes,
  SceneLoader,
  AbstractMesh,
  PBRMaterial,
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF";
import { AdvancedDynamicTexture, TextBlock, Button, Rectangle, StackPanel, Grid, Control } from "@babylonjs/gui";
import {
  type Loadout,
  type UnitSelection,
  type UnitCustomization,
  type UnitClass,
  type Team,
  type ActionMode,
  type TurnState,
  type Unit,
  getClassData,
} from "../types";

// Import centralized config - colors and palettes
import {
  SKIN_TONES,
  HAIR_COLORS,
  EYE_COLORS,
  SCENE_BACKGROUNDS,
  TILE_COLOR_LIGHT,
  TILE_COLOR_DARK,
  TERRAIN_COLOR,
  HIGHLIGHT_SELECTED,
  HIGHLIGHT_VALID_MOVE,
  HIGHLIGHT_ATTACKABLE,
  HIGHLIGHT_HEALABLE,
  HIGHLIGHT_BLOCKED,
  HP_BAR_GREEN,
  HP_BAR_ORANGE,
  HP_BAR_RED,
  HP_BAR_BACKGROUND,
  HP_BAR_BORDER,
  INTENT_COLOR_ATTACK,
  INTENT_COLOR_HEAL,
  INTENT_COLOR_BUFF,
  DEFAULT_TEAM_COLORS,
  SHADOW_BASE_ALPHA,
  SHADOW_UNIT_ALPHA,
  INTENT_INDICATOR_ALPHA,
  COVER_ACTIVE_ALPHA,
  COVER_PREVIEW_ALPHA,
  CONCEAL_ALPHA,
  CONCEAL_EMISSIVE_SCALE,
} from "../config";

// Import centralized config - constants
import {
  GRID_SIZE,
  TILE_SIZE,
  TILE_GAP,
  TERRAIN_COUNT,
  PLAYER1_SPAWN_POSITIONS,
  PLAYER2_SPAWN_POSITIONS,
  BATTLE_CAMERA_ALPHA,
  BATTLE_CAMERA_BETA,
  BATTLE_CAMERA_RADIUS,
  BATTLE_CAMERA_LOWER_BETA_LIMIT,
  BATTLE_CAMERA_UPPER_BETA_LIMIT,
  BATTLE_CAMERA_LOWER_RADIUS_LIMIT,
  BATTLE_CAMERA_UPPER_RADIUS_LIMIT,
  MOVEMENT_DURATION_PER_TILE,
  ATTACK_IMPACT_DELAY_MS,
  ACTIONS_PER_TURN,
  ACCUMULATOR_THRESHOLD,
  SPEED_BONUS_PER_UNUSED_ACTION,
  MELEE_DAMAGE_MULTIPLIER,
  HP_LOW_THRESHOLD,
  HP_MEDIUM_THRESHOLD,
  BATTLE_MODEL_SCALE,
  BATTLE_MODEL_Y_POSITION,
  HP_BAR_ANCHOR_HEIGHT,
  HEAD_VARIANT_COUNT,
} from "../config";

// Import audio config
import { MUSIC, SFX, AUDIO_VOLUMES, LOOP_BUFFER_TIME } from "../config";

// Import utility functions
import { hexToColor3, createMusicPlayer, playSfx, rgbToColor3 } from "../utils";

// Pure game logic is available in /src/battle/ for headless simulations.
// This file (BattleScene.ts) handles visual rendering and uses inline logic
// that mirrors the pure versions. Future refactor: delegate to battle module.
// See: /src/battle/state.ts (UnitState, BattleState)
//      /src/battle/rules.ts (movement, LOS, combat, turns)

export function createBattleScene(engine: Engine, _canvas: HTMLCanvasElement, loadout: Loadout | null): Scene {
  const scene = new Scene(engine);
  // Use centralized scene background color
  const bg = SCENE_BACKGROUNDS.battle;
  scene.clearColor.set(bg.r, bg.g, bg.b, bg.a);

  // Battle music - Placeholder
  // Background music - using centralized audio config
  const music = createMusicPlayer(MUSIC.battle, AUDIO_VOLUMES.music, true, LOOP_BUFFER_TIME);
  music.play();

  scene.onDisposeObservable.add(() => {
    music.pause();
    music.src = "";
  });

  // Sound effects
  // Sound effects - using centralized audio paths and volumes
  const sfx = {
    hitLight: new Audio(SFX.hitLight),
    hitMedium: new Audio(SFX.hitMedium),
    hitHeavy: new Audio(SFX.hitHeavy),
    heal: new Audio(SFX.heal),
  };
  // Set volume for all sound effects
  Object.values(sfx).forEach(sound => sound.volume = AUDIO_VOLUMES.sfx);
  // Note: playSfx is now imported from utils

  // Camera - using centralized constants for isometric tactical view
  const camera = new ArcRotateCamera(
    "camera",
    BATTLE_CAMERA_ALPHA,
    BATTLE_CAMERA_BETA,
    BATTLE_CAMERA_RADIUS,
    new Vector3(0, 0, 0),
    scene
  );
  camera.attachControl(true);
  camera.lowerBetaLimit = BATTLE_CAMERA_LOWER_BETA_LIMIT;
  camera.upperBetaLimit = BATTLE_CAMERA_UPPER_BETA_LIMIT;
  camera.lowerRadiusLimit = BATTLE_CAMERA_LOWER_RADIUS_LIMIT;
  camera.upperRadiusLimit = BATTLE_CAMERA_UPPER_RADIUS_LIMIT;

  new HemisphericLight("ambientLight", new Vector3(0, 1, 0), scene);
  const dirLight = new DirectionalLight("dirLight", new Vector3(-1, -2, -1), scene);
  dirLight.intensity = 0.5;

  // Tile materials
  // Tile materials - using centralized color config
  const tileMaterialLight = new StandardMaterial("tileLightMat", scene);
  tileMaterialLight.diffuseColor = rgbToColor3(TILE_COLOR_LIGHT);

  const tileMaterialDark = new StandardMaterial("tileDarkMat", scene);
  tileMaterialDark.diffuseColor = rgbToColor3(TILE_COLOR_DARK);

  // Highlight materials - using centralized color config
  const selectedMaterial = new StandardMaterial("selectedMat", scene);
  selectedMaterial.diffuseColor = rgbToColor3(HIGHLIGHT_SELECTED);

  const validMoveMaterial = new StandardMaterial("validMoveMat", scene);
  validMoveMaterial.diffuseColor = rgbToColor3(HIGHLIGHT_VALID_MOVE);

  const attackableMaterial = new StandardMaterial("attackableMat", scene);
  attackableMaterial.diffuseColor = rgbToColor3(HIGHLIGHT_ATTACKABLE);

  const healableMaterial = new StandardMaterial("healableMat", scene);
  healableMaterial.diffuseColor = rgbToColor3(HIGHLIGHT_HEALABLE);

  const unitMaterials: Record<UnitClass, StandardMaterial> = {
    soldier: createUnitMaterial("soldier", new Color3(0.3, 0.3, 0.8), scene),
    operator: createUnitMaterial("operator", new Color3(0.8, 0.2, 0.2), scene),
    medic: createUnitMaterial("medic", new Color3(0.2, 0.8, 0.3), scene),
  };

  // Create grid
  const tiles: Mesh[][] = [];
  const gridOffset = (GRID_SIZE * TILE_SIZE) / 2 - TILE_SIZE / 2;

  for (let x = 0; x < GRID_SIZE; x++) {
    tiles[x] = [];
    for (let z = 0; z < GRID_SIZE; z++) {
      const tile = MeshBuilder.CreateBox(
        `tile_${x}_${z}`,
        { width: TILE_SIZE - TILE_GAP, height: 0.1, depth: TILE_SIZE - TILE_GAP },
        scene
      );
      tile.position = new Vector3(
        x * TILE_SIZE - gridOffset,
        0,
        z * TILE_SIZE - gridOffset
      );
      tile.material = (x + z) % 2 === 0 ? tileMaterialLight : tileMaterialDark;
      tile.metadata = { type: "tile", gridX: x, gridZ: z };
      tiles[x][z] = tile;
    }
  }

  // ============================================
  // TERRAIN GENERATION
  // ============================================

  // Store terrain positions for collision checking
  const terrainTiles: Set<string> = new Set();

  // ============================================
  // TERRAIN GENERATION - Constructive Algorithm
  // ============================================
  // Instead of generate-and-validate, we:
  // 1. Build a guaranteed main corridor along an edge (not middle)
  // 2. Connect each spawn point to the corridor via cardinal paths
  // 3. Mark all path tiles as "protected"
  // 4. Place terrain only in unprotected tiles (middle of map)
  // This always succeeds and is deterministic with a seed.

  // Combine spawn positions for terrain generation (using config constants)
  const spawnPositions = [...PLAYER1_SPAWN_POSITIONS, ...PLAYER2_SPAWN_POSITIONS];

  /**
   * Generate an edge-hugging corridor from bottom to top.
   * Routes along left or right edge with some variance, leaving middle open.
   */
  function generateEdgeCorridor(): { x: number; z: number }[] {
    const path: { x: number; z: number }[] = [];

    // Pick which edge to favor (left or right)
    const favorLeft = Math.random() < 0.5;

    // Start position: on or near the chosen edge
    let x = favorLeft
      ? Math.floor(Math.random() * 2)  // 0 or 1
      : GRID_SIZE - 1 - Math.floor(Math.random() * 2);  // 6 or 7

    // Walk from z=0 to z=GRID_SIZE-1
    for (let z = 0; z < GRID_SIZE; z++) {
      path.push({ x, z });

      // Occasionally drift laterally (but stay near edge)
      if (z < GRID_SIZE - 1 && Math.random() < 0.3) {
        // Drift toward or away from edge
        const driftTowardEdge = Math.random() < 0.6;  // Bias toward edge
        if (driftTowardEdge) {
          // Move toward edge
          if (favorLeft && x > 0) x--;
          else if (!favorLeft && x < GRID_SIZE - 1) x++;
        } else {
          // Move away from edge (but not too far - stay in outer third)
          const maxDrift = Math.floor(GRID_SIZE / 3);
          if (favorLeft && x < maxDrift) x++;
          else if (!favorLeft && x > GRID_SIZE - 1 - maxDrift) x--;
        }
      }
    }

    return path;
  }

  /**
   * Find shortest cardinal path from start to any tile in the target set using BFS.
   * Only uses cardinal directions (no diagonals) since units can't move diagonally.
   */
  function findCardinalPathToSet(
    startX: number,
    startZ: number,
    targetSet: Set<string>
  ): { x: number; z: number }[] {
    const startKey = `${startX},${startZ}`;

    // BFS to find shortest cardinal path to any target tile
    const visited = new Set<string>();
    const parent = new Map<string, string | null>();
    const queue: [number, number][] = [[startX, startZ]];
    visited.add(startKey);
    parent.set(startKey, null);

    while (queue.length > 0) {
      const [cx, cz] = queue.shift()!;
      const currentKey = `${cx},${cz}`;

      // Check if we reached a target tile (but not the start itself)
      if (targetSet.has(currentKey) && currentKey !== startKey) {
        // Reconstruct path from start to this target
        const path: { x: number; z: number }[] = [];
        let key: string | null = currentKey;
        while (key) {
          const [px, pz] = key.split(",").map(Number);
          path.unshift({ x: px, z: pz });
          key = parent.get(key) || null;
        }
        return path;
      }

      // Explore cardinal neighbors only (no diagonals!)
      const cardinalDirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
      for (const [dx, dz] of cardinalDirs) {
        const nx = cx + dx;
        const nz = cz + dz;
        const key = `${nx},${nz}`;

        // Stay in bounds
        if (nx < 0 || nx >= GRID_SIZE || nz < 0 || nz >= GRID_SIZE) continue;
        // Don't revisit
        if (visited.has(key)) continue;

        visited.add(key);
        parent.set(key, currentKey);
        queue.push([nx, nz]);
      }
    }

    // No path found (shouldn't happen on open grid) - return just start
    console.warn(`No cardinal path found from (${startX},${startZ}) to corridor`);
    return [{ x: startX, z: startZ }];
  }

  /**
   * Constructive terrain generation algorithm.
   * Guarantees valid terrain on first try - no retries needed.
   */
  function generateTerrainPositions(): { x: number; z: number }[] {
    const protectedTiles = new Set<string>();

    // Step 1: Create main corridor along an edge (leaves middle open for terrain)
    const mainCorridor = generateEdgeCorridor();

    // Add main corridor to protected set
    for (const tile of mainCorridor) {
      protectedTiles.add(`${tile.x},${tile.z}`);
    }

    // Step 2: Connect each spawn to the corridor via cardinal path
    // IMPORTANT: Don't add spawns to protected BEFORE finding paths,
    // otherwise findCardinalPathToSet returns immediately
    for (const spawn of spawnPositions) {
      // Find cardinal path from spawn to nearest protected tile
      const pathToCorridor = findCardinalPathToSet(
        spawn.x, spawn.z,
        protectedTiles
      );

      // Add entire path (including spawn) to protected tiles
      for (const tile of pathToCorridor) {
        protectedTiles.add(`${tile.x},${tile.z}`);
      }

      // Also protect the spawn itself (in case path didn't include it)
      protectedTiles.add(`${spawn.x},${spawn.z}`);
    }

    // Step 3: Verify each spawn has at least one cardinal exit
    // (Should always be true now, but safety check)
    for (const spawn of spawnPositions) {
      const cardinalNeighbors = [
        { x: spawn.x - 1, z: spawn.z },
        { x: spawn.x + 1, z: spawn.z },
        { x: spawn.x, z: spawn.z - 1 },
        { x: spawn.x, z: spawn.z + 1 },
      ].filter(n => n.x >= 0 && n.x < GRID_SIZE && n.z >= 0 && n.z < GRID_SIZE);

      const hasCardinalExit = cardinalNeighbors.some(n =>
        protectedTiles.has(`${n.x},${n.z}`)
      );

      if (!hasCardinalExit && cardinalNeighbors.length > 0) {
        // Protect a random cardinal neighbor
        const randomNeighbor = cardinalNeighbors[
          Math.floor(Math.random() * cardinalNeighbors.length)
        ];
        protectedTiles.add(`${randomNeighbor.x},${randomNeighbor.z}`);
      }
    }

    // Step 4: Collect eligible tiles for terrain (not protected)
    const eligibleTiles: { x: number; z: number }[] = [];
    for (let x = 0; x < GRID_SIZE; x++) {
      for (let z = 0; z < GRID_SIZE; z++) {
        if (!protectedTiles.has(`${x},${z}`)) {
          eligibleTiles.push({ x, z });
        }
      }
    }

    // Step 5: Shuffle and select terrain tiles
    for (let i = eligibleTiles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [eligibleTiles[i], eligibleTiles[j]] = [eligibleTiles[j], eligibleTiles[i]];
    }

    const terrainCount = Math.min(TERRAIN_COUNT, eligibleTiles.length);
    const positions = eligibleTiles.slice(0, terrainCount);

    // Add to terrain tiles set for collision detection
    for (const pos of positions) {
      terrainTiles.add(`${pos.x},${pos.z}`);
    }

    return positions;
  }

  const terrainPositions = generateTerrainPositions();

  // Create terrain cube meshes
  // Terrain material - using centralized color config
  const terrainMaterial = new StandardMaterial("terrainMat", scene);
  terrainMaterial.diffuseColor = rgbToColor3(TERRAIN_COLOR);
  terrainMaterial.specularColor = new Color3(0.1, 0.1, 0.1);

  const tileTopY = 0.05;  // Top surface of tiles (tiles are height 0.1 centered at Y=0)
  const terrainHeight = TILE_SIZE - TILE_GAP;

  for (const { x, z } of terrainPositions) {
    const cube = MeshBuilder.CreateBox(`terrain_${x}_${z}`, {
      width: TILE_SIZE - TILE_GAP,
      height: terrainHeight,
      depth: TILE_SIZE - TILE_GAP,
    }, scene);
    cube.position = new Vector3(
      x * TILE_SIZE - gridOffset,
      tileTopY + terrainHeight / 2,  // Sit on top of tile
      z * TILE_SIZE - gridOffset
    );
    cube.material = terrainMaterial;
    cube.metadata = { type: "terrain", gridX: x, gridZ: z };
  }

  // Helper to check if a tile has terrain
  function hasTerrain(x: number, z: number): boolean {
    return terrainTiles.has(`${x},${z}`);
  }

  // ============================================
  // STATE EXTRACTION (for simulations/AI)
  // ============================================
  // These functions extract pure game state for use with /src/battle/ rules.
  // This enables headless simulations without Babylon.js dependencies.

  /**
   * Extract pure UnitState from a visual Unit.
   * Used for simulations, AI, and state synchronization.
   */
  function extractUnitState(unit: Unit, index: number): import("../battle").UnitState {
    return {
      id: `${unit.team}-${index}`,
      unitClass: unit.unitClass,
      team: unit.team,
      gridX: unit.gridX,
      gridZ: unit.gridZ,
      hp: unit.hp,
      maxHp: unit.maxHp,
      attack: unit.attack,
      healAmount: unit.healAmount,
      moveRange: unit.moveRange,
      attackRange: unit.attackRange,
      combatStyle: unit.customization?.combatStyle ?? "ranged",
      speed: unit.speed,
      speedBonus: unit.speedBonus,
      accumulator: unit.accumulator,
      loadoutIndex: unit.loadoutIndex,
      isConcealed: unit.isConcealed,
      isCovering: unit.isCovering,
      coveredTiles: [], // TODO: track covered tiles in Unit
      actionsUsed: turnState?.unit === unit ? (ACTIONS_PER_TURN - turnState.actionsRemaining) : 0,
    };
  }

  /**
   * Extract complete BattleState from current game.
   * Used for simulations, AI decision making, and state sync.
   */
  function extractBattleState(): import("../battle").BattleState {
    const currentUnit = turnState?.unit;
    return {
      gridSize: GRID_SIZE,
      terrain: new Set(terrainTiles),
      units: units.map((u, i) => extractUnitState(u, i)),
      currentUnitId: currentUnit ? `${currentUnit.team}-${units.indexOf(currentUnit)}` : null,
      actionsRemaining: turnState?.actionsRemaining ?? 0,
      pendingActions: turnState?.pendingActions.map(a => ({
        type: a.type,
        targetX: a.targetX,
        targetZ: a.targetZ,
        targetUnitId: a.targetUnit ? `${a.targetUnit.team}-${units.indexOf(a.targetUnit)}` : undefined,
        abilityName: a.abilityName,
      })) ?? [],
      originalPosition: turnState?.originalPosition ?? null,
      isGameOver: false, // TODO: track game over state
      winner: null,
    };
  }

  // Export state extraction for external use (AI, simulations)
  void extractBattleState; // Prevent unused warning

  // GUI
  const gui = AdvancedDynamicTexture.CreateFullscreenUI("UI");

  // Units
  const units: Unit[] = [];

  // Current turn state for preview/undo system
  let turnState: TurnState | null = null;
  let currentActionMode: ActionMode = "none";

  // Callback for when a unit's turn starts (set later by command menu)
  let onTurnStartCallback: ((unit: Unit) => void) | null = null;

  // ============================================
  // ANIMATION HELPERS
  // ============================================

  function playAnimation(unit: Unit, animName: string, loop: boolean, onComplete?: () => void): void {
    if (!unit.animationGroups) {
      // No animation groups - call onComplete immediately
      console.warn(`No animation groups for ${unit.unitClass}`);
      if (onComplete) onComplete();
      return;
    }

    // Stop all current animations
    unit.animationGroups.forEach(ag => ag.stop());

    const anim = unit.animationGroups.find(ag => ag.name === animName);
    if (anim) {
      anim.start(loop);
      if (onComplete && !loop) {
        anim.onAnimationEndObservable.addOnce(() => onComplete());
      }
    } else {
      // Animation not found - call onComplete immediately so game doesn't hang
      console.warn(`Animation "${animName}" not found for ${unit.unitClass}. Available: ${unit.animationGroups.map(ag => ag.name).join(", ")}`);
      if (onComplete) onComplete();
    }
  }

  function playIdleAnimation(unit: Unit): void {
    const isMelee = unit.customization?.combatStyle === "melee";
    playAnimation(unit, isMelee ? "Idle_Sword" : "Idle_Gun", true);
  }

  // ============================================
  // FACING SYSTEM
  // ============================================

  // Initialize facing config for a unit
  function initFacing(unit: Unit): void {
    const isFlipped = unit.customization?.handedness === "right";
    unit.facing = {
      currentAngle: 0,
      baseOffset: 0,
      isFlipped: isFlipped
    };
  }

  // Apply the current facing angle to the unit's model
  function applyFacing(unit: Unit): void {
    if (!unit.modelRoot) return;
    unit.modelRoot.rotationQuaternion = null;
    unit.modelRoot.rotation.y = unit.facing.currentAngle + unit.facing.baseOffset;
  }

  // Face a specific grid position
  function faceTarget(unit: Unit, targetX: number, targetZ: number, fromX?: number, fromZ?: number): void {
    const startX = fromX ?? unit.gridX;
    const startZ = fromZ ?? unit.gridZ;
    const dx = targetX - startX;
    const dz = targetZ - startZ;
    if (dx === 0 && dz === 0) return;
    unit.facing.currentAngle = Math.atan2(dx, dz);
    applyFacing(unit);
  }

  // Face the closest living enemy
  function faceClosestEnemy(unit: Unit): void {
    const enemies = units.filter(u => u.team !== unit.team && u.hp > 0);
    if (enemies.length === 0) return;

    let closest = enemies[0];
    let closestDist = Math.abs(closest.gridX - unit.gridX) + Math.abs(closest.gridZ - unit.gridZ);

    for (const enemy of enemies) {
      const dist = Math.abs(enemy.gridX - unit.gridX) + Math.abs(enemy.gridZ - unit.gridZ);
      if (dist < closestDist) {
        closest = enemy;
        closestDist = dist;
      }
    }

    faceTarget(unit, closest.gridX, closest.gridZ);
  }

  // Face the average position of all enemies (for initial spawn)
  function faceAverageEnemyPosition(unit: Unit): void {
    const enemies = units.filter(u => u.team !== unit.team);
    if (enemies.length === 0) return;

    const avgX = enemies.reduce((sum, e) => sum + e.gridX, 0) / enemies.length;
    const avgZ = enemies.reduce((sum, e) => sum + e.gridZ, 0) / enemies.length;

    faceTarget(unit, avgX, avgZ);
  }

  // Legacy alias for compatibility
  function setUnitFacing(unit: Unit, targetX: number, targetZ: number, fromX?: number, fromZ?: number): void {
    faceTarget(unit, targetX, targetZ, fromX, fromZ);
  }

  // ============================================
  // LINE OF SIGHT SYSTEM
  // ============================================
  // Mathematical line-rectangle intersection approach:
  // - Line from center of fromTile to center of toTile
  // - If line passes through interior of any blocking tile → blocked
  // - If line only grazes corners, track which side of the line blockers are on
  // - If corners are touched on BOTH sides (left and right) → blocked

  // Epsilon for floating point comparisons
  const LOS_EPSILON = 0.0001;

  // Check if a line segment intersects a tile's interior (not just corner)
  // Returns: "none" | "interior" | "corner"
  function lineRectIntersection(
    ax: number, az: number,  // Line start (tile centers)
    bx: number, bz: number,  // Line end (tile centers)
    tileX: number, tileZ: number  // Tile grid coordinates
  ): "none" | "interior" | "corner" {
    // Tile bounds (each tile is 1x1, from [tileX, tileX+1] x [tileZ, tileZ+1])
    const minX = tileX;
    const maxX = tileX + 1;
    const minZ = tileZ;
    const maxZ = tileZ + 1;

    // Line direction
    const dx = bx - ax;
    const dz = bz - az;

    // Parametric line clipping (Liang-Barsky algorithm)
    let tMin = 0;
    let tMax = 1;

    // Check each edge
    const edges = [
      { p: -dx, q: ax - minX },  // Left edge
      { p: dx, q: maxX - ax },   // Right edge
      { p: -dz, q: az - minZ },  // Bottom edge
      { p: dz, q: maxZ - az },   // Top edge
    ];

    for (const { p, q } of edges) {
      if (Math.abs(p) < LOS_EPSILON) {
        // Line is parallel to this edge
        if (q < 0) return "none";  // Line is outside
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
      return "none";  // No intersection
    }

    // Calculate intersection points
    const entryX = ax + tMin * dx;
    const entryZ = az + tMin * dz;
    const exitX = ax + tMax * dx;
    const exitZ = az + tMax * dz;

    // Check if entry and exit are essentially the same point (corner touch)
    const intersectionLength = Math.sqrt((exitX - entryX) ** 2 + (exitZ - entryZ) ** 2);
    if (intersectionLength < LOS_EPSILON) {
      // Single point intersection - check if it's a corner
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
      // Edge touch (not corner) - treat as interior for blocking purposes
      return "interior";
    }

    return "interior";
  }

  // Determine which side of the line a point is on
  // Returns positive for left, negative for right, 0 for on line
  function sideOfLine(
    ax: number, az: number,  // Line start
    bx: number, bz: number,  // Line end
    px: number, pz: number   // Point to test
  ): number {
    // 2D cross product: (B-A) × (P-A)
    return (bx - ax) * (pz - az) - (bz - az) * (px - ax);
  }

  function hasLineOfSight(fromX: number, fromZ: number, toX: number, toZ: number, excludeUnit?: Unit): boolean {
    // Line from center of fromTile to center of toTile
    const ax = fromX + 0.5;
    const az = fromZ + 0.5;
    const bx = toX + 0.5;
    const bz = toZ + 0.5;

    // Track TERRAIN corner touches on each side of the line
    // Only terrain blocks diagonals - units on corners don't block
    let leftTerrainCorner = false;
    let rightTerrainCorner = false;

    // Get bounding box of tiles to check (expanded by 1 to catch edge cases)
    const minTileX = Math.max(0, Math.min(fromX, toX) - 1);
    const maxTileX = Math.min(GRID_SIZE - 1, Math.max(fromX, toX) + 1);
    const minTileZ = Math.max(0, Math.min(fromZ, toZ) - 1);
    const maxTileZ = Math.min(GRID_SIZE - 1, Math.max(fromZ, toZ) + 1);

    // Check all potentially blocking tiles in the bounding box
    for (let tileX = minTileX; tileX <= maxTileX; tileX++) {
      for (let tileZ = minTileZ; tileZ <= maxTileZ; tileZ++) {
        // Skip start and end tiles
        if ((tileX === fromX && tileZ === fromZ) || (tileX === toX && tileZ === toZ)) {
          continue;
        }

        const isTerrain = hasTerrain(tileX, tileZ);
        const hasUnit = units.some(u => u.gridX === tileX && u.gridZ === tileZ && u.hp > 0 && u !== excludeUnit);

        if (!isTerrain && !hasUnit) continue;

        // Check intersection type
        const intersection = lineRectIntersection(ax, az, bx, bz, tileX, tileZ);

        if (intersection === "interior") {
          return false;  // Blocked by interior intersection (terrain or unit)
        }

        if (intersection === "corner" && isTerrain) {
          // Only terrain matters for corner blocking
          const tileCenterX = tileX + 0.5;
          const tileCenterZ = tileZ + 0.5;
          const side = sideOfLine(ax, az, bx, bz, tileCenterX, tileCenterZ);

          if (side > LOS_EPSILON) {
            leftTerrainCorner = true;
          } else if (side < -LOS_EPSILON) {
            rightTerrainCorner = true;
          }
          // If side ≈ 0, terrain center is on the line (rare edge case, treat as blocking)
          else {
            return false;
          }

          // If terrain on both sides touches corners, LOS is blocked
          if (leftTerrainCorner && rightTerrainCorner) {
            return false;
          }
        }
      }
    }

    return true;
  }

  function getTilesInLOS(fromX: number, fromZ: number, excludeAdjacent: boolean, excludeUnit?: Unit): { x: number; z: number }[] {
    const result: { x: number; z: number }[] = [];

    for (let x = 0; x < GRID_SIZE; x++) {
      for (let z = 0; z < GRID_SIZE; z++) {
        if (x === fromX && z === fromZ) continue;

        // Skip terrain tiles (no unit can stand there)
        if (hasTerrain(x, z)) continue;

        const distance = Math.abs(x - fromX) + Math.abs(z - fromZ);

        // If excluding adjacent (for guns), skip distance 1
        if (excludeAdjacent && distance === 1) continue;

        if (hasLineOfSight(fromX, fromZ, x, z, excludeUnit)) {
          result.push({ x, z });
        }
      }
    }

    return result;
  }

  // ============================================
  // WEAPON RANGE HELPERS
  // ============================================

  // Get all 8 adjacent tiles (including diagonals)
  function getAdjacentTiles(x: number, z: number): { x: number; z: number }[] {
    const adjacent: { x: number; z: number }[] = [];
    const directions = [
      { dx: 0, dz: 1 },   // North
      { dx: 0, dz: -1 },  // South
      { dx: 1, dz: 0 },   // East
      { dx: -1, dz: 0 },  // West
      { dx: 1, dz: 1 },   // NE
      { dx: -1, dz: 1 },  // NW
      { dx: 1, dz: -1 },  // SE
      { dx: -1, dz: -1 }, // SW
    ];

    for (const dir of directions) {
      const nx = x + dir.dx;
      const nz = z + dir.dz;
      // Check bounds and exclude terrain tiles
      if (nx >= 0 && nx < GRID_SIZE && nz >= 0 && nz < GRID_SIZE && !hasTerrain(nx, nz)) {
        adjacent.push({ x: nx, z: nz });
      }
    }

    return adjacent;
  }

  // Check if a tile is adjacent (including diagonals)
  function isAdjacent(x1: number, z1: number, x2: number, z2: number): boolean {
    const dx = Math.abs(x2 - x1);
    const dz = Math.abs(z2 - z1);
    return dx <= 1 && dz <= 1 && !(dx === 0 && dz === 0);
  }

  function getValidAttackTiles(unit: Unit, fromX?: number, fromZ?: number): { x: number; z: number; hasLOS: boolean }[] {
    const x = fromX ?? unit.gridX;
    const z = fromZ ?? unit.gridZ;
    const isMelee = unit.customization?.combatStyle === "melee";

    if (isMelee) {
      // Sword: all 8 adjacent tiles, with LOS check for diagonals
      return getAdjacentTiles(x, z).map(tile => {
        const isDiagonal = tile.x !== x && tile.z !== z;
        // Diagonals need LOS check, ordinals always have LOS
        const hasLOS = isDiagonal ? hasLineOfSight(x, z, tile.x, tile.z, unit) : true;
        return { ...tile, hasLOS };
      });
    } else {
      // Gun: LOS but not adjacent (all 8 surrounding tiles excluded)
      const losResult: { x: number; z: number; hasLOS: boolean }[] = [];

      for (let tx = 0; tx < GRID_SIZE; tx++) {
        for (let tz = 0; tz < GRID_SIZE; tz++) {
          if (tx === x && tz === z) continue;

          // Skip all 8 adjacent tiles
          if (isAdjacent(x, z, tx, tz)) continue;

          // Exclude the shooter from blocking their own LOS
          const hasLOS = hasLineOfSight(x, z, tx, tz, unit);
          losResult.push({ x: tx, z: tz, hasLOS });
        }
      }

      return losResult;
    }
  }

  // LOS-blocked material (gray for blocked targets)
  // Blocked tile material (no LOS) - using centralized color config
  const blockedMaterial = new StandardMaterial("blockedMat", scene);
  blockedMaterial.diffuseColor = rgbToColor3(HIGHLIGHT_BLOCKED);

  // Export references for future use (prevents unused warnings)
  const _helpers = { getTilesInLOS, getValidAttackTiles, createShadowPreview, clearShadowPreview, shadowPosition: () => shadowPosition, highlightAttackTargets, getAttackableEnemiesWithLOS, showAttackPreview, clearAttackPreview, highlightHealTargets, toggleConceal, toggleCover, clearCoverVisualization };
  void _helpers;

  // ============================================
  // ANIMATED MOVEMENT
  // ============================================

  let isAnimatingMovement = false;

  function animateMovement(unit: Unit, targetX: number, targetZ: number, onComplete?: () => void): void {
    if (!unit.modelRoot) {
      moveUnit(unit, targetX, targetZ, gridOffset);
      onComplete?.();
      return;
    }

    // Get the actual path to follow (avoiding terrain)
    const path = getPathToTarget(unit, unit.gridX, unit.gridZ, targetX, targetZ);

    // Update logical position immediately
    unit.gridX = targetX;
    unit.gridZ = targetZ;

    // Recalculate cover tiles for all covering units (LOS may have changed)
    recalculateAllCoverTiles();

    // If path is just start and end (adjacent move), do simple animation
    if (path.length <= 2) {
      animateAlongPath(unit, path, onComplete);
      return;
    }

    // Animate along the path waypoints
    animateAlongPath(unit, path, onComplete);
  }

  function animateAlongPath(unit: Unit, path: { x: number; z: number }[], onComplete?: () => void): void {
    if (path.length < 2) {
      onComplete?.();
      return;
    }

    isAnimatingMovement = true;
    playAnimation(unit, "Run", true);

    let currentWaypointIndex = 0;
    const durationPerTile = MOVEMENT_DURATION_PER_TILE;
    let segmentElapsed = 0;

    // Set initial facing toward first waypoint (from start position)
    if (path.length > 1) {
      setUnitFacing(unit, path[1].x, path[1].z, path[0].x, path[0].z);
    }

    const moveObserver = scene.onBeforeRenderObservable.add(() => {
      const deltaTime = engine.getDeltaTime() / 1000;
      segmentElapsed += deltaTime;

      const fromWaypoint = path[currentWaypointIndex];
      const toWaypoint = path[currentWaypointIndex + 1];

      const fromWorldX = fromWaypoint.x * TILE_SIZE - gridOffset;
      const fromWorldZ = fromWaypoint.z * TILE_SIZE - gridOffset;
      const toWorldX = toWaypoint.x * TILE_SIZE - gridOffset;
      const toWorldZ = toWaypoint.z * TILE_SIZE - gridOffset;

      const t = Math.min(segmentElapsed / durationPerTile, 1);
      const easeT = t; // Linear for smooth path following

      const currentX = fromWorldX + (toWorldX - fromWorldX) * easeT;
      const currentZ = fromWorldZ + (toWorldZ - fromWorldZ) * easeT;

      unit.modelRoot!.position.x = currentX;
      unit.modelRoot!.position.z = currentZ;
      unit.mesh.position.x = currentX;
      unit.mesh.position.z = currentZ;

      // Move to next waypoint
      if (t >= 1) {
        currentWaypointIndex++;
        segmentElapsed = 0;

        // Update facing for next segment (from current waypoint to next)
        if (currentWaypointIndex + 1 < path.length) {
          const currentWp = path[currentWaypointIndex];
          const nextWp = path[currentWaypointIndex + 1];
          setUnitFacing(unit, nextWp.x, nextWp.z, currentWp.x, currentWp.z);
        }

        // Check if we've reached the end
        if (currentWaypointIndex >= path.length - 1) {
          scene.onBeforeRenderObservable.remove(moveObserver);
          isAnimatingMovement = false;

          // Snap to final position
          const finalWaypoint = path[path.length - 1];
          const finalX = finalWaypoint.x * TILE_SIZE - gridOffset;
          const finalZ = finalWaypoint.z * TILE_SIZE - gridOffset;
          unit.modelRoot!.position.x = finalX;
          unit.modelRoot!.position.z = finalZ;
          unit.mesh.position.x = finalX;
          unit.mesh.position.z = finalZ;

          playIdleAnimation(unit);
          onComplete?.();
        }
      }
    });
  }

  // ============================================
  // SHADOW PREVIEW SYSTEM
  // ============================================

  let shadowMesh: Mesh | null = null;
  let shadowBaseMesh: Mesh | null = null;

  function createShadowPreview(unit: Unit, targetX: number, targetZ: number): void {
    clearShadowPreview();

    // Create semi-transparent base indicator
    shadowBaseMesh = MeshBuilder.CreateCylinder(
      "shadow_base",
      { diameter: 0.8, height: 0.08, tessellation: 24 },
      scene
    );
    const shadowBaseMat = new StandardMaterial("shadowBaseMat", scene);
    shadowBaseMat.diffuseColor = unit.teamColor;
    shadowBaseMat.alpha = SHADOW_BASE_ALPHA;
    shadowBaseMesh.material = shadowBaseMat;
    shadowBaseMesh.position = new Vector3(
      targetX * TILE_SIZE - gridOffset,
      0.1,
      targetZ * TILE_SIZE - gridOffset
    );

    // Create shadow silhouette (simple cylinder for now)
    shadowMesh = MeshBuilder.CreateCylinder(
      "shadow_unit",
      { diameter: 0.5, height: 1.0, tessellation: 12 },
      scene
    );
    const shadowMat = new StandardMaterial("shadowMat", scene);
    shadowMat.diffuseColor = unit.teamColor;
    shadowMat.alpha = SHADOW_UNIT_ALPHA;
    shadowMesh.material = shadowMat;
    shadowMesh.position = new Vector3(
      targetX * TILE_SIZE - gridOffset,
      0.6,
      targetZ * TILE_SIZE - gridOffset
    );
  }

  function clearShadowPreview(): void {
    if (shadowMesh) {
      shadowMesh.dispose();
      shadowMesh = null;
    }
    if (shadowBaseMesh) {
      shadowBaseMesh.dispose();
      shadowBaseMesh = null;
    }
  }

  // ============================================
  // INTENT INDICATOR SYSTEM
  // ============================================

  // Store intent indicator meshes (one per pending attack/heal action)
  const intentIndicators: Mesh[] = [];

  // Create a single intent indicator at target position
  function createIntentIndicator(targetX: number, targetZ: number, color: Color3, stackIndex: number = 0): Mesh {
    const indicator = MeshBuilder.CreateCylinder(
      "intent_indicator",
      { diameter: 0.9, height: 0.06, tessellation: 24 },
      scene
    );
    const indicatorMat = new StandardMaterial("intentMat", scene);
    indicatorMat.diffuseColor = color;
    indicatorMat.emissiveColor = color.scale(0.3);  // Slight glow effect
    indicatorMat.alpha = INTENT_INDICATOR_ALPHA;
    indicator.material = indicatorMat;
    indicator.position = new Vector3(
      targetX * TILE_SIZE - gridOffset,
      0.12 + (stackIndex * 0.08),  // Stack vertically for multiple indicators
      targetZ * TILE_SIZE - gridOffset
    );
    indicator.isPickable = false;  // Don't block clicks
    return indicator;
  }

  // Clear all intent indicators
  function clearIntentIndicators(): void {
    for (const indicator of intentIndicators) {
      indicator.dispose();
    }
    intentIndicators.length = 0;
  }

  // Update intent indicators based on current pending actions
  function updateIntentIndicators(): void {
    clearIntentIndicators();

    if (!turnState) return;

    // Track how many indicators are at each position for stacking
    const positionCounts: Map<string, number> = new Map();

    function getStackIndex(x: number, z: number): number {
      const key = `${x},${z}`;
      const count = positionCounts.get(key) || 0;
      positionCounts.set(key, count + 1);
      return count;
    }

    for (const action of turnState.pendingActions) {
      if (action.type === "attack" && action.targetUnit) {
        // Attack indicator - using centralized color
        const stackIndex = getStackIndex(action.targetUnit.gridX, action.targetUnit.gridZ);
        const indicator = createIntentIndicator(
          action.targetUnit.gridX,
          action.targetUnit.gridZ,
          rgbToColor3(INTENT_COLOR_ATTACK),
          stackIndex
        );
        intentIndicators.push(indicator);
      } else if (action.type === "ability" && action.abilityName === "heal" && action.targetUnit) {
        // Heal indicator - using centralized color
        const stackIndex = getStackIndex(action.targetUnit.gridX, action.targetUnit.gridZ);
        const indicator = createIntentIndicator(
          action.targetUnit.gridX,
          action.targetUnit.gridZ,
          rgbToColor3(INTENT_COLOR_HEAL),
          stackIndex
        );
        intentIndicators.push(indicator);
      } else if (action.type === "ability" && (action.abilityName === "conceal" || action.abilityName === "cover") && action.targetUnit) {
        // Self-buff indicator - using centralized color
        const stackIndex = getStackIndex(action.targetUnit.gridX, action.targetUnit.gridZ);
        const indicator = createIntentIndicator(
          action.targetUnit.gridX,
          action.targetUnit.gridZ,
          rgbToColor3(INTENT_COLOR_BUFF),
          stackIndex
        );
        intentIndicators.push(indicator);
      }
    }
  }

  // Starting positions for each team - using centralized constants
  const player1Positions = [...PLAYER1_SPAWN_POSITIONS];
  const player2Positions = [...PLAYER2_SPAWN_POSITIONS];

  // Use loadout if provided, otherwise default setup
  const defaultUnits: UnitSelection[] = [{ unitClass: "soldier" }, { unitClass: "operator" }, { unitClass: "medic" }];
  const player1Selections = loadout?.player1 ?? defaultUnits;
  const player2Selections = loadout?.player2 ?? defaultUnits;

  // Get team colors from loadout or use centralized defaults
  const player1TeamColor = loadout?.player1TeamColor
    ? hexToColor3(loadout.player1TeamColor)
    : rgbToColor3(DEFAULT_TEAM_COLORS.player1);
  const player2TeamColor = loadout?.player2TeamColor
    ? hexToColor3(loadout.player2TeamColor)
    : rgbToColor3(DEFAULT_TEAM_COLORS.player2);

  // Spawn units asynchronously
  async function spawnAllUnits(): Promise<void> {
    // Spawn player1 units
    for (let i = 0; i < player1Selections.length; i++) {
      const pos = player1Positions[i];
      const selection = player1Selections[i];
      const unit = await createUnit(
        selection.unitClass,
        "player1",
        pos.x,
        pos.z,
        scene,
        unitMaterials,
        gridOffset,
        gui,
        i,
        player1TeamColor,
        selection.customization
      );
      units.push(unit);
    }

    // Spawn player2 units
    for (let i = 0; i < player2Selections.length; i++) {
      const pos = player2Positions[i];
      const selection = player2Selections[i];
      const unit = await createUnit(
        selection.unitClass,
        "player2",
        pos.x,
        pos.z,
        scene,
        unitMaterials,
        gridOffset,
        gui,
        i,
        player2TeamColor,
        selection.customization
      );
      units.push(unit);
    }

    // Set initial facing for all units (face average opposing team position)
    for (const unit of units) {
      initFacing(unit);  // Initialize facing config based on handedness
      faceAverageEnemyPosition(unit);
      // Show model and HP bar now that facing is correct
      if (unit.modelRoot) {
        unit.modelRoot.setEnabled(true);
      }
      if (unit.hpBarBg) {
        unit.hpBarBg.isVisible = true;
      }
    }

    // Start the game after all units are loaded
    startGame();
  }

  // Start spawning (game will start when done)
  spawnAllUnits();

  // Game state
  let selectedUnit: Unit | null = null;
  let highlightedTiles: Mesh[] = [];
  let attackableUnits: Unit[] = [];
  let healableUnits: Unit[] = [];
  let gameOver = false;

  // Initiative system - ACCUMULATOR_THRESHOLD imported from config
  let currentUnit: Unit | null = null;
  let lastActingTeam: Team | null = null;
  let isFirstRound = true;
  let firstRoundQueue: Unit[] = [];

  // Active unit corner indicators
  let cornerMeshes: Mesh[] = [];
  let cornerMaterial: StandardMaterial | null = null;
  let pulseTime = 0;

  function getEffectiveSpeed(unit: Unit): number {
    return unit.speed + unit.speedBonus;
  }

  function createCornerIndicators(unit: Unit): void {
    clearCornerIndicators();

    // Use the unit's team color
    const color = unit.teamColor;

    cornerMaterial = new StandardMaterial("cornerMat", scene);
    cornerMaterial.diffuseColor = color;
    cornerMaterial.emissiveColor = color.scale(0.5);

    const cornerLength = 0.2;  // Length of each arm
    const cornerWidth = 0.06;  // Width/thickness of the arms
    const tileHalf = (TILE_SIZE - TILE_GAP) / 2;  // Half tile size

    // Create L-shaped corners at each corner of the tile
    // Each corner needs arms pointing inward toward tile center
    const corners = [
      { x: -tileHalf, z: -tileHalf, armDirX: 1, armDirZ: 1 },   // Bottom-left: arms go +X, +Z
      { x: tileHalf, z: -tileHalf, armDirX: -1, armDirZ: 1 },   // Bottom-right: arms go -X, +Z
      { x: tileHalf, z: tileHalf, armDirX: -1, armDirZ: -1 },   // Top-right: arms go -X, -Z
      { x: -tileHalf, z: tileHalf, armDirX: 1, armDirZ: -1 },   // Top-left: arms go +X, -Z
    ];

    const baseX = unit.gridX * TILE_SIZE - gridOffset;
    const baseZ = unit.gridZ * TILE_SIZE - gridOffset;

    for (const corner of corners) {
      // Horizontal arm (along X)
      const armX = MeshBuilder.CreateBox("cornerArmX", {
        width: cornerLength,
        height: 0.02,
        depth: cornerWidth,
      }, scene);
      armX.material = cornerMaterial;
      armX.position = new Vector3(
        baseX + corner.x + (corner.armDirX * cornerLength / 2),
        0.06,
        baseZ + corner.z + (corner.armDirZ * cornerWidth / 2)
      );
      cornerMeshes.push(armX);

      // Vertical arm (along Z)
      const armZ = MeshBuilder.CreateBox("cornerArmZ", {
        width: cornerWidth,
        height: 0.02,
        depth: cornerLength,
      }, scene);
      armZ.material = cornerMaterial;
      armZ.position = new Vector3(
        baseX + corner.x + (corner.armDirX * cornerWidth / 2),
        0.06,
        baseZ + corner.z + (corner.armDirZ * cornerLength / 2)
      );
      cornerMeshes.push(armZ);
    }
  }

  function clearCornerIndicators(): void {
    for (const mesh of cornerMeshes) {
      mesh.dispose();
    }
    cornerMeshes = [];
    if (cornerMaterial) {
      cornerMaterial.dispose();
      cornerMaterial = null;
    }
  }

  function updateCornerIndicators(unit: Unit): void {
    if (cornerMeshes.length === 0) return;

    // Recreate corners at new position (simpler than repositioning 8 meshes)
    createCornerIndicators(unit);
  }

  // Animation loop for pulsing corners
  scene.onBeforeRenderObservable.add(() => {
    if (cornerMaterial && cornerMeshes.length > 0 && currentUnit) {
      pulseTime += engine.getDeltaTime() / 1000;
      const pulse = 0.5 + 0.5 * Math.sin(pulseTime * 4); // Pulse 4 times per second

      // Use the current unit's team color
      const baseColor = currentUnit.teamColor;

      cornerMaterial.emissiveColor = baseColor.scale(0.3 + pulse * 0.7);
    }
  });

  function buildFirstRoundQueue(): void {
    // Alternate teams: P1, P2, P1, P2, P1, P2
    // Within team, use loadout order
    const player1Units = units.filter(u => u.team === "player1").sort((a, b) => a.loadoutIndex - b.loadoutIndex);
    const player2Units = units.filter(u => u.team === "player2").sort((a, b) => a.loadoutIndex - b.loadoutIndex);

    firstRoundQueue = [];
    const maxLen = Math.max(player1Units.length, player2Units.length);
    for (let i = 0; i < maxLen; i++) {
      if (player1Units[i]) firstRoundQueue.push(player1Units[i]);
      if (player2Units[i]) firstRoundQueue.push(player2Units[i]);
    }
  }

  function getNextUnitByAccumulator(): Unit | null {
    // Add speed to all accumulators until someone hits threshold
    let readyUnits: Unit[] = [];

    // Keep ticking until at least one unit is ready
    while (readyUnits.length === 0 && units.length > 0) {
      for (const unit of units) {
        unit.accumulator += getEffectiveSpeed(unit);
        if (unit.accumulator >= ACCUMULATOR_THRESHOLD) {
          readyUnits.push(unit);
        }
      }
    }

    if (readyUnits.length === 0) return null;

    // Sort ready units by tie-breakers
    readyUnits.sort((a, b) => {
      // Primary: team that didn't just go
      if (lastActingTeam !== null) {
        if (a.team !== lastActingTeam && b.team === lastActingTeam) return -1;
        if (b.team !== lastActingTeam && a.team === lastActingTeam) return 1;
      }
      // Secondary: loadout index
      return a.loadoutIndex - b.loadoutIndex;
    });

    return readyUnits[0];
  }

  function getNextUnit(): Unit | null {
    if (isFirstRound && firstRoundQueue.length > 0) {
      return firstRoundQueue.shift() ?? null;
    }

    // After first round, use accumulator system
    if (isFirstRound) {
      isFirstRound = false;
      // Reset all accumulators for the new system
      for (const unit of units) {
        unit.accumulator = 0;
      }
    }

    return getNextUnitByAccumulator();
  }

  function startUnitTurn(unit: Unit): void {
    currentUnit = unit;
    unit.hasMoved = false;
    unit.hasAttacked = false;

    // Cancel Cover at the start of this unit's turn
    if (unit.isCovering) {
      console.log(`${unit.team} ${unit.unitClass}'s Cover ends at start of turn.`);
      endCover(unit);
    }

    // Reset accumulator after acting
    unit.accumulator = 0;

    // Reset all unit appearances
    for (const u of units) {
      if (u === unit) {
        resetUnitAppearance(u);
      } else {
        setUnitInactive(u);
      }
    }

    // Create pulsing corner indicators for active unit
    createCornerIndicators(unit);

    updateTurnIndicator();

    // Initialize turn state for preview/undo system (using centralized constant)
    turnState = {
      unit,
      actionsRemaining: ACTIONS_PER_TURN,
      pendingActions: [],
      originalPosition: { x: unit.gridX, z: unit.gridZ },
      originalFacing: unit.facing.currentAngle,
    };

    // Call turn start callback (for command menu update)
    if (onTurnStartCallback) {
      onTurnStartCallback(unit);
    }
  }

  function endCurrentUnitTurn(): void {
    const unit = currentUnit;
    if (!unit) return;

    // Calculate speed bonus based on unused actions (using centralized constant)
    const unusedActions = turnState?.actionsRemaining ?? 0;
    unit.speedBonus = unusedActions * SPEED_BONUS_PER_UNUSED_ACTION;

    // Clear turn state
    turnState = null;
    currentActionMode = "none";

    // Mark as exhausted visually
    setUnitExhausted(unit);

    // Clear corner indicators and previews
    clearCornerIndicators();
    clearShadowPreview();
    clearAttackPreview();
    clearIntentIndicators();

    lastActingTeam = unit.team;
    clearHighlights();
    selectedUnit = null;
    currentUnit = null;

    const nextUnit = getNextUnit();
    if (nextUnit) {
      startUnitTurn(nextUnit);
      nextUnit.speedBonus = 0;
    }
  }

  function startGame(): void {
    buildFirstRoundQueue();
    const firstUnit = getNextUnit();
    if (firstUnit) {
      startUnitTurn(firstUnit);
      firstUnit.speedBonus = 0; // Clear any initial bonus
    }
  }

  function getDefaultTileMaterial(x: number, z: number): StandardMaterial {
    return (x + z) % 2 === 0 ? tileMaterialLight : tileMaterialDark;
  }

  function clearHighlights(): void {
    for (const tile of highlightedTiles) {
      const { gridX, gridZ } = tile.metadata;
      tile.material = getDefaultTileMaterial(gridX, gridZ);
    }
    highlightedTiles = [];
    attackableUnits = [];
    healableUnits = [];
  }

  function hasActionsRemaining(): boolean {
    return turnState !== null && turnState.actionsRemaining > 0;
  }

  function consumeAction(): void {
    if (turnState) {
      turnState.actionsRemaining--;
      updateCommandMenu();

      // Auto-end turn when no actions remaining
      if (turnState.actionsRemaining <= 0) {
        setTimeout(() => endTurn(), 100);  // Small delay for visual feedback
      }
    }
  }

  function getValidMoveTiles(unit: Unit, fromX?: number, fromZ?: number): { x: number; z: number }[] {
    if (!hasActionsRemaining()) return []; // No actions remaining
    const startX = fromX ?? unit.gridX;
    const startZ = fromZ ?? unit.gridZ;

    // BFS pathfinding - find all tiles reachable within move range
    // Cannot pass through enemy units, but can pass through friendly units
    const visited = new Set<string>();
    const reachable: { x: number; z: number }[] = [];

    // Queue: [x, z, distance]
    const queue: [number, number, number][] = [[startX, startZ, 0]];
    visited.add(`${startX},${startZ}`);

    while (queue.length > 0) {
      const [cx, cz, dist] = queue.shift()!;

      // If within move range and not the starting tile, it's a valid destination
      if (dist > 0 && dist <= unit.moveRange) {
        // Check if target tile is unoccupied (can't end on another unit or terrain)
        const occupied = units.some(u => u.gridX === cx && u.gridZ === cz);
        if (!occupied && !hasTerrain(cx, cz)) {
          reachable.push({ x: cx, z: cz });
        }
      }

      // Stop expanding if at max range
      if (dist >= unit.moveRange) continue;

      // Check all 4 cardinal directions (manhattan movement)
      const directions = [[0, 1], [0, -1], [1, 0], [-1, 0]];
      for (const [dx, dz] of directions) {
        const nx = cx + dx;
        const nz = cz + dz;
        const key = `${nx},${nz}`;

        // Skip if out of bounds or already visited
        if (nx < 0 || nx >= GRID_SIZE || nz < 0 || nz >= GRID_SIZE) continue;
        if (visited.has(key)) continue;

        // Check if tile is blocked by terrain (can't pass through)
        if (hasTerrain(nx, nz)) {
          visited.add(key);
          continue;
        }

        // Check if tile is blocked by enemy unit (can't pass through)
        const enemyBlocking = units.some(u => u.gridX === nx && u.gridZ === nz && u.team !== unit.team);
        if (enemyBlocking) {
          visited.add(key); // Mark as visited so we don't check again
          continue;
        }

        visited.add(key);
        queue.push([nx, nz, dist + 1]);
      }
    }

    return reachable;
  }

  // Compute the actual path from start to target using BFS
  function getPathToTarget(unit: Unit, fromX: number, fromZ: number, toX: number, toZ: number): { x: number; z: number }[] {
    // BFS to find shortest path
    const visited = new Set<string>();
    const parent = new Map<string, string | null>();

    const queue: [number, number][] = [[fromX, fromZ]];
    const startKey = `${fromX},${fromZ}`;
    visited.add(startKey);
    parent.set(startKey, null);

    while (queue.length > 0) {
      const [cx, cz] = queue.shift()!;
      const currentKey = `${cx},${cz}`;

      // Found target
      if (cx === toX && cz === toZ) {
        // Reconstruct path
        const path: { x: number; z: number }[] = [];
        let key: string | null = currentKey;
        while (key) {
          const [x, z] = key.split(",").map(Number);
          path.unshift({ x, z });
          key = parent.get(key) || null;
        }
        return path;
      }

      // Check cardinal directions
      const directions = [[0, 1], [0, -1], [1, 0], [-1, 0]];
      for (const [dx, dz] of directions) {
        const nx = cx + dx;
        const nz = cz + dz;
        const key = `${nx},${nz}`;

        if (nx < 0 || nx >= GRID_SIZE || nz < 0 || nz >= GRID_SIZE) continue;
        if (visited.has(key)) continue;

        // Check terrain blocking
        if (hasTerrain(nx, nz)) continue;

        // Check enemy blocking
        const enemyBlocking = units.some(u => u.gridX === nx && u.gridZ === nz && u.team !== unit.team && u.hp > 0);
        if (enemyBlocking) continue;

        visited.add(key);
        parent.set(key, currentKey);
        queue.push([nx, nz]);
      }
    }

    // No path found, return direct path (shouldn't happen if target is valid)
    return [{ x: fromX, z: fromZ }, { x: toX, z: toZ }];
  }

  // Legacy function - kept for potential AI/simulation use (simpler than LOS version)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function getAttackableEnemiesSimple(unit: Unit, fromX?: number, fromZ?: number): Unit[] {
    if (!hasActionsRemaining()) return []; // No actions remaining
    // Use shadow position if pending move, otherwise use provided or current position
    const effectiveX = fromX ?? shadowPosition?.x ?? unit.gridX;
    const effectiveZ = fromZ ?? shadowPosition?.z ?? unit.gridZ;
    return units.filter(u => {
      if (u.team === unit.team) return false;
      const distance = Math.abs(u.gridX - effectiveX) + Math.abs(u.gridZ - effectiveZ);
      return distance <= unit.attackRange;
    });
  }
  // Export for future AI/simulation use
  void getAttackableEnemiesSimple;

  function getHealableAllies(unit: Unit, fromX?: number, fromZ?: number): Unit[] {
    // Only medic can heal, needs actions remaining
    // Heal works on self or all 8 adjacent tiles with LOS (diagonals require LOS check)
    if (unit.healAmount <= 0 || !hasActionsRemaining()) return [];

    // Use shadow position if pending move, otherwise use provided or current position
    const hasPendingMove = shadowPosition !== null;
    const effectiveX = fromX ?? shadowPosition?.x ?? unit.gridX;
    const effectiveZ = fromZ ?? shadowPosition?.z ?? unit.gridZ;

    return units.filter(u => {
      if (u.team !== unit.team) return false; // Must be same team
      if (u.hp >= u.maxHp) return false; // Already at full health

      // For the healer themselves with a pending move:
      // They can self-heal but only by clicking the shadow position (distance 0 from effective)
      if (u === unit && hasPendingMove) {
        return true;
      }

      // Self-heal (distance 0) is always allowed
      if (u.gridX === effectiveX && u.gridZ === effectiveZ) {
        return true;
      }

      // Check if ally is adjacent (including diagonals)
      if (!isAdjacent(effectiveX, effectiveZ, u.gridX, u.gridZ)) {
        return false;
      }

      // Diagonals require LOS check, ordinals always have LOS
      const isDiagonal = u.gridX !== effectiveX && u.gridZ !== effectiveZ;
      const hasLOS = isDiagonal ? hasLineOfSight(effectiveX, effectiveZ, u.gridX, u.gridZ, unit) : true;
      return hasLOS;
    });
  }

  function highlightValidActions(unit: Unit): void {
    clearHighlights();

    // Use shadow position if there's a pending move, otherwise use current position
    const effectiveX = shadowPosition?.x ?? unit.gridX;
    const effectiveZ = shadowPosition?.z ?? unit.gridZ;

    // Highlight move tiles from effective position
    const validTiles = getValidMoveTiles(unit, effectiveX, effectiveZ);
    for (const { x, z } of validTiles) {
      const tile = tiles[x][z];
      tile.material = validMoveMaterial;
      highlightedTiles.push(tile);
    }

    // Highlight effective position (shadow or current)
    const currentTile = tiles[effectiveX][effectiveZ];
    currentTile.material = selectedMaterial;
    highlightedTiles.push(currentTile);

    // Highlight healable allies (support only, from effective position)
    healableUnits = getHealableAllies(unit, effectiveX, effectiveZ);
    for (const ally of healableUnits) {
      const tile = tiles[ally.gridX][ally.gridZ];
      tile.material = healableMaterial;
      highlightedTiles.push(tile);
    }
  }

  // Highlight attack targets with LOS consideration (for attack mode)
  function highlightAttackTargets(unit: Unit, fromX?: number, fromZ?: number): void {
    clearHighlights();
    attackableUnits = [];

    if (!hasActionsRemaining()) return;

    const x = fromX ?? unit.gridX;
    const z = fromZ ?? unit.gridZ;

    // Get valid attack tiles with LOS info
    const attackTiles = getValidAttackTiles(unit, x, z);

    // Check each player2
    for (const player2 of units) {
      if (player2.team === unit.team) continue;
      if (player2.hp <= 0) continue;

      // Find if this player2's tile is in our attack tiles
      const tileInfo = attackTiles.find(t => t.x === player2.gridX && t.z === player2.gridZ);
      if (tileInfo) {
        const tile = tiles[player2.gridX][player2.gridZ];
        if (tileInfo.hasLOS) {
          tile.material = attackableMaterial;
          attackableUnits.push(player2);
        } else {
          tile.material = blockedMaterial;
        }
        highlightedTiles.push(tile);
      }
    }

    // Highlight current position (or shadow position)
    const positionTile = tiles[x][z];
    positionTile.material = selectedMaterial;
    highlightedTiles.push(positionTile);
  }

  // Get attackable enemies with LOS check
  function getAttackableEnemiesWithLOS(unit: Unit, fromX?: number, fromZ?: number): Unit[] {
    if (!hasActionsRemaining()) return [];

    const x = fromX ?? unit.gridX;
    const z = fromZ ?? unit.gridZ;

    const attackTiles = getValidAttackTiles(unit, x, z);

    return units.filter(player2 => {
      if (player2.team === unit.team) return false;
      if (player2.hp <= 0) return false;

      const tileInfo = attackTiles.find(t => t.x === player2.gridX && t.z === player2.gridZ);
      return tileInfo?.hasLOS ?? false;
    });
  }

  // ============================================
  // ABILITY FUNCTIONS
  // ============================================

  // Highlight healable allies for Medic's Heal ability
  // Works on self or all 8 adjacent tiles with LOS (diagonals require LOS check)
  function highlightHealTargets(unit: Unit, fromX?: number, fromZ?: number): void {
    clearHighlights();
    healableUnits = [];

    if (!hasActionsRemaining() || unit.healAmount <= 0) return;

    // Use shadow position if pending move, otherwise current position
    const hasPendingMove = shadowPosition !== null;
    const effectiveX = fromX ?? shadowPosition?.x ?? unit.gridX;
    const effectiveZ = fromZ ?? shadowPosition?.z ?? unit.gridZ;

    // Can heal self or adjacent allies (all 8 directions with LOS)
    for (const ally of units) {
      if (ally.team !== unit.team) continue;
      if (ally.hp >= ally.maxHp) continue;  // Already at full health

      // For the healer themselves with a pending move:
      // They can self-heal by clicking the shadow position, not their original position
      if (ally === unit && hasPendingMove) {
        // Highlight the shadow position for self-heal (effective position)
        const tile = tiles[effectiveX][effectiveZ];
        tile.material = healableMaterial;
        highlightedTiles.push(tile);
        healableUnits.push(ally);
        continue;
      }

      // Self-heal (distance 0) is always allowed
      if (ally.gridX === effectiveX && ally.gridZ === effectiveZ) {
        const tile = tiles[ally.gridX][ally.gridZ];
        tile.material = healableMaterial;
        highlightedTiles.push(tile);
        healableUnits.push(ally);
        continue;
      }

      // Check if ally is adjacent (including diagonals)
      if (!isAdjacent(effectiveX, effectiveZ, ally.gridX, ally.gridZ)) {
        continue;
      }

      // Diagonals require LOS check, ordinals always have LOS
      const isDiagonal = ally.gridX !== effectiveX && ally.gridZ !== effectiveZ;
      const hasLOS = isDiagonal ? hasLineOfSight(effectiveX, effectiveZ, ally.gridX, ally.gridZ, unit) : true;

      if (hasLOS) {
        const tile = tiles[ally.gridX][ally.gridZ];
        tile.material = healableMaterial;
        highlightedTiles.push(tile);
        healableUnits.push(ally);
      }
    }

    // Highlight effective position if not already highlighted
    const currentTile = tiles[effectiveX][effectiveZ];
    if (!highlightedTiles.includes(currentTile)) {
      currentTile.material = selectedMaterial;
      highlightedTiles.push(currentTile);
    }
  }

  // Helper to apply conceal visual (semi-transparent with team color tint)
  // Uses centralized alpha and emissive values
  function applyConcealVisual(unit: Unit): void {
    if (unit.modelMeshes) {
      unit.modelMeshes.forEach(mesh => {
        if (mesh.material) {
          const mat = mesh.material as PBRMaterial;
          mat.alpha = CONCEAL_ALPHA;
          mat.emissiveColor = unit.teamColor.scale(CONCEAL_EMISSIVE_SCALE);
        }
      });
    }
  }

  // Helper to remove conceal visual
  function removeConcealVisual(unit: Unit): void {
    if (unit.modelMeshes) {
      unit.modelMeshes.forEach(mesh => {
        if (mesh.material) {
          const mat = mesh.material as PBRMaterial;
          mat.alpha = 1.0;
          mat.emissiveColor = Color3.Black();
        }
      });
    }
  }

  // Toggle Conceal for Operator (damage type)
  function toggleConceal(unit: Unit): void {
    // Always turn conceal ON (never toggle off)
    if (unit.isConcealed) {
      console.log(`${unit.team} ${unit.unitClass} is already Concealed.`);
      return;
    }

    unit.isConcealed = true;
    applyConcealVisual(unit);
    console.log(`${unit.team} ${unit.unitClass} activates Conceal!`);

    // Play interact animation
    if (unit.modelMeshes) {
      const weaponMeshes = unit.modelMeshes.filter(m =>
        m.name.toLowerCase().includes("sword") || m.name.toLowerCase().includes("pistol")
      );
      weaponMeshes.forEach(m => m.setEnabled(false));

      playAnimation(unit, "Interact", false, () => {
        const isMelee = unit.customization?.combatStyle === "melee";
        unit.modelMeshes?.forEach(m => {
          if (m.name.toLowerCase().includes("sword")) {
            m.setEnabled(isMelee);
          } else if (m.name.toLowerCase().includes("pistol")) {
            m.setEnabled(!isMelee);
          }
        });
        playIdleAnimation(unit);
      });
    }

    consumeAction();
  }

  // Cover tiles tracking for visual display - per unit
  const coverMeshesByUnit: Map<Unit, Mesh[]> = new Map();
  // Preview meshes for pending cover actions
  let coverPreviewMeshes: Mesh[] = [];
  // Hazard stripe meshes for dual-covered tiles
  let hazardStripeMeshes: Mesh[] = [];
  // Cover tile map: tracks which tiles are covered and by which units (allows multiple)
  // Key: "x,z", Value: array of units covering that tile
  const coverTileMap: Map<string, Unit[]> = new Map();

  // Add tiles to the cover map for a unit
  function setCoverTiles(unit: Unit, tiles: { x: number; z: number }[]): void {
    for (const { x, z } of tiles) {
      const key = `${x},${z}`;
      const existing = coverTileMap.get(key) || [];
      if (!existing.includes(unit)) {
        existing.push(unit);
      }
      coverTileMap.set(key, existing);
    }
  }

  // Clear cover tiles for a specific unit
  function clearCoverTilesForUnit(unit: Unit): void {
    for (const [key, coveringUnits] of coverTileMap.entries()) {
      const index = coveringUnits.indexOf(unit);
      if (index !== -1) {
        coveringUnits.splice(index, 1);
        if (coveringUnits.length === 0) {
          coverTileMap.delete(key);
        }
      }
    }
  }

  // Get the enemy unit covering a tile (returns first enemy found, null if no enemy is covering)
  function getEnemyCoveringTile(x: number, z: number, forUnit: Unit): Unit | null {
    const coveringUnits = coverTileMap.get(`${x},${z}`);
    if (!coveringUnits) return null;
    for (const coveringUnit of coveringUnits) {
      if (coveringUnit.team !== forUnit.team && coveringUnit.hp > 0) {
        return coveringUnit;
      }
    }
    return null;
  }

  // Check if a tile is covered by both teams
  function isTileDualCovered(x: number, z: number): { player1Color?: Color3; player2Color?: Color3 } | null {
    const coveringUnits = coverTileMap.get(`${x},${z}`);
    if (!coveringUnits || coveringUnits.length < 2) return null;

    let player1Color: Color3 | undefined;
    let player2Color: Color3 | undefined;

    for (const unit of coveringUnits) {
      if (unit.team === "player1" && unit.hp > 0) {
        player1Color = unit.teamColor;
      } else if (unit.team === "player2" && unit.hp > 0) {
        player2Color = unit.teamColor;
      }
    }

    if (player1Color && player2Color) {
      return { player1Color, player2Color };
    }
    return null;
  }

  // Update hazard stripes for all dual-covered tiles
  function updateHazardStripes(): void {
    // Clear existing hazard meshes
    for (const mesh of hazardStripeMeshes) {
      mesh.dispose();
    }
    hazardStripeMeshes = [];

    // Find all dual-covered tiles and create hazard stripes
    for (const [key] of coverTileMap.entries()) {
      const [xStr, zStr] = key.split(",");
      const x = parseInt(xStr);
      const z = parseInt(zStr);
      const dualCover = isTileDualCovered(x, z);
      if (dualCover) {
        createDualCoverCorners(x, z, dualCover.player1Color!, dualCover.player2Color!);
      }
    }
  }

  // Create corner markers for dual-covered tile (no Z-fighting)
  function createDualCoverCorners(tileX: number, tileZ: number, color1: Color3, color2: Color3): void {
    const cornerSize = 0.12;
    const cornerThickness = 0.05;
    const cornerHeight = 0.08;
    const tileHalf = (TILE_SIZE - TILE_GAP) / 2;

    const worldX = tileX * TILE_SIZE - gridOffset;
    const worldZ = tileZ * TILE_SIZE - gridOffset;

    // Create materials for both colors
    const mat1 = new StandardMaterial(`dualMat1_${tileX}_${tileZ}`, scene);
    mat1.diffuseColor = color1;
    mat1.emissiveColor = color1.scale(0.4);
    mat1.alpha = 0.4;

    const mat2 = new StandardMaterial(`dualMat2_${tileX}_${tileZ}`, scene);
    mat2.diffuseColor = color2;
    mat2.emissiveColor = color2.scale(0.4);
    mat2.alpha = 0.4;

    // Create corner markers - alternating colors at each corner
    // Each corner has an L-shape made of two boxes
    const corners = [
      { x: tileHalf, z: tileHalf, mat: mat1 },     // Top-right - color1
      { x: -tileHalf, z: tileHalf, mat: mat2 },    // Top-left - color2
      { x: tileHalf, z: -tileHalf, mat: mat2 },    // Bottom-right - color2
      { x: -tileHalf, z: -tileHalf, mat: mat1 },   // Bottom-left - color1
    ];

    for (const corner of corners) {
      // Horizontal part of L - slightly larger to cover underlying corners
      const hBox = MeshBuilder.CreateBox(`dualCornerH_${tileX}_${tileZ}`, {
        width: cornerSize + 0.02,
        height: cornerHeight,
        depth: cornerThickness + 0.01,
      }, scene);
      hBox.material = corner.mat;
      hBox.position = new Vector3(
        worldX + corner.x - Math.sign(corner.x) * cornerSize / 2,
        0.09,  // Just above single-team corners (0.08)
        worldZ + corner.z
      );
      hBox.isPickable = false;
      hazardStripeMeshes.push(hBox);

      // Vertical part of L
      const vBox = MeshBuilder.CreateBox(`dualCornerV_${tileX}_${tileZ}`, {
        width: cornerThickness + 0.01,
        height: cornerHeight,
        depth: cornerSize + 0.02,
      }, scene);
      vBox.material = corner.mat;
      vBox.position = new Vector3(
        worldX + corner.x,
        0.09,
        worldZ + corner.z - Math.sign(corner.z) * cornerSize / 2
      );
      vBox.isPickable = false;
      hazardStripeMeshes.push(vBox);
    }
  }

  // End cover for a unit (clears state, visualization, and map)
  function endCover(unit: Unit): void {
    unit.isCovering = false;
    clearCoverTilesForUnit(unit);
    clearCoverVisualizationForUnit(unit);
    updateHazardStripes();  // Recalculate dual-covered tiles
  }

  // Recalculate cover tiles for all covering units (called after any movement)
  function recalculateAllCoverTiles(): void {
    for (const unit of units) {
      if (!unit.isCovering || unit.hp <= 0) continue;

      // Clear existing cover for this unit
      clearCoverTilesForUnit(unit);
      clearCoverVisualizationForUnit(unit);

      // Recalculate covered tiles based on current positions
      const isMelee = unit.customization?.combatStyle === "melee";
      let coveredTiles: { x: number; z: number }[];

      if (isMelee) {
        // Sword: Cover all 8 adjacent tiles with LOS check for diagonals
        coveredTiles = getAdjacentTiles(unit.gridX, unit.gridZ).filter(tile => {
          const isDiagonal = tile.x !== unit.gridX && tile.z !== unit.gridZ;
          return !isDiagonal || hasLineOfSight(unit.gridX, unit.gridZ, tile.x, tile.z, unit);
        });
      } else {
        // Gun: recalculate LOS with current unit positions
        coveredTiles = getTilesInLOS(unit.gridX, unit.gridZ, true, unit);
      }

      // Re-add to cover map and recreate visualization
      setCoverTiles(unit, coveredTiles);
      for (const { x, z } of coveredTiles) {
        createCoverBorder(unit, x, z, unit.teamColor);
      }
    }

    // Update dual-covered tile indicators
    updateHazardStripes();
  }

  // Clear cover visualization for a specific unit only
  function clearCoverVisualizationForUnit(unit: Unit): void {
    const meshes = coverMeshesByUnit.get(unit);
    if (meshes) {
      for (const mesh of meshes) {
        mesh.dispose();
      }
      coverMeshesByUnit.delete(unit);
    }
  }

  // Clear cover preview meshes
  function clearCoverPreview(): void {
    for (const mesh of coverPreviewMeshes) {
      mesh.dispose();
    }
    coverPreviewMeshes = [];
  }

  // Show cover preview for pending action (semi-transparent)
  function showCoverPreview(unit: Unit, fromX: number, fromZ: number): void {
    clearCoverPreview();

    const isMelee = unit.customization?.combatStyle === "melee";
    let tiles: { x: number; z: number }[];

    if (isMelee) {
      // Sword: Cover all 8 adjacent tiles with LOS check for diagonals
      tiles = getAdjacentTiles(fromX, fromZ).filter(tile => {
        const isDiagonal = tile.x !== fromX && tile.z !== fromZ;
        return !isDiagonal || hasLineOfSight(fromX, fromZ, tile.x, tile.z, unit);
      });
    } else {
      tiles = getTilesInLOS(fromX, fromZ, true, unit);
    }

    // Create preview borders (more transparent than active cover)
    for (const { x, z } of tiles) {
      createCoverBorderPreview(x, z, unit.teamColor);
    }
  }

  // Create a preview border (more transparent) - uses corner style
  function createCoverBorderPreview(tileX: number, tileZ: number, color: Color3): void {
    const cornerSize = 0.12;
    const cornerThickness = 0.05;
    const cornerHeight = 0.08;
    const tileHalf = (TILE_SIZE - TILE_GAP) / 2;

    const worldX = tileX * TILE_SIZE - gridOffset;
    const worldZ = tileZ * TILE_SIZE - gridOffset;

    const cornerMat = new StandardMaterial(`coverPreviewMat_${tileX}_${tileZ}`, scene);
    cornerMat.diffuseColor = color;
    cornerMat.emissiveColor = color.scale(COVER_PREVIEW_ALPHA);
    cornerMat.alpha = COVER_PREVIEW_ALPHA;  // More transparent for preview

    // Create L-shaped corner markers at each corner
    const corners = [
      { x: tileHalf, z: tileHalf },
      { x: -tileHalf, z: tileHalf },
      { x: tileHalf, z: -tileHalf },
      { x: -tileHalf, z: -tileHalf },
    ];

    for (const corner of corners) {
      const hBox = MeshBuilder.CreateBox(`coverPreviewH_${tileX}_${tileZ}`, {
        width: cornerSize,
        height: cornerHeight,
        depth: cornerThickness,
      }, scene);
      hBox.material = cornerMat;
      hBox.position = new Vector3(
        worldX + corner.x - Math.sign(corner.x) * cornerSize / 2,
        0.08,
        worldZ + corner.z
      );
      hBox.isPickable = false;
      coverPreviewMeshes.push(hBox);

      const vBox = MeshBuilder.CreateBox(`coverPreviewV_${tileX}_${tileZ}`, {
        width: cornerThickness,
        height: cornerHeight,
        depth: cornerSize,
      }, scene);
      vBox.material = cornerMat;
      vBox.position = new Vector3(
        worldX + corner.x,
        0.08,
        worldZ + corner.z - Math.sign(corner.z) * cornerSize / 2
      );
      vBox.isPickable = false;
      coverPreviewMeshes.push(vBox);
    }
  }

  // Check if a unit triggers cover reaction and execute it
  // Returns true if cover was triggered (caller should end turn)
  // Concealed units do not trigger cover at all
  function checkAndTriggerCoverReaction(targetUnit: Unit, onComplete: () => void): boolean {
    // Concealed units don't trigger cover
    if (targetUnit.isConcealed) {
      return false;
    }

    const coveringUnit = getEnemyCoveringTile(targetUnit.gridX, targetUnit.gridZ, targetUnit);
    if (!coveringUnit) {
      return false;
    }

    console.log(`${coveringUnit.team} ${coveringUnit.unitClass} triggers Cover reaction on ${targetUnit.team} ${targetUnit.unitClass}!`);

    // Execute the cover reaction attack
    executeAttack(coveringUnit, targetUnit, () => {
      // End cover after reaction
      endCover(coveringUnit);
      onComplete();
    });

    return true;
  }

  // Toggle Cover for Soldier (tank type)
  function toggleCover(unit: Unit): void {
    unit.isCovering = !unit.isCovering;

    // Clear existing cover for this unit only
    clearCoverTilesForUnit(unit);
    clearCoverVisualizationForUnit(unit);

    if (unit.isCovering) {
      // Get covered tiles based on weapon type
      const isMelee = unit.customization?.combatStyle === "melee";
      let coveredTiles: { x: number; z: number }[];

      if (isMelee) {
        // Sword: Cover all 8 adjacent tiles with LOS check for diagonals
        coveredTiles = getAdjacentTiles(unit.gridX, unit.gridZ).filter(tile => {
          const isDiagonal = tile.x !== unit.gridX && tile.z !== unit.gridZ;
          return !isDiagonal || hasLineOfSight(unit.gridX, unit.gridZ, tile.x, tile.z, unit);
        });
      } else {
        // Gun: Cover all tiles in LOS that they could shoot (not adjacent)
        coveredTiles = getTilesInLOS(unit.gridX, unit.gridZ, true, unit);
      }

      // Add to cover map and create visualization
      setCoverTiles(unit, coveredTiles);
      for (const { x, z } of coveredTiles) {
        createCoverBorder(unit, x, z, unit.teamColor);
      }
      updateHazardStripes();  // Check for dual-covered tiles

      console.log(`${unit.team} ${unit.unitClass} activates Cover! (${coveredTiles.length} tiles)`);
    } else {
      updateHazardStripes();  // Update after deactivation
      console.log(`${unit.team} ${unit.unitClass} deactivates Cover.`);
    }

    // Play interact animation
    if (unit.modelMeshes) {
      const weaponMeshes = unit.modelMeshes.filter(m =>
        m.name.toLowerCase().includes("sword") || m.name.toLowerCase().includes("pistol")
      );
      weaponMeshes.forEach(m => m.setEnabled(false));

      playAnimation(unit, "Interact", false, () => {
        const isMelee = unit.customization?.combatStyle === "melee";
        unit.modelMeshes?.forEach(m => {
          if (m.name.toLowerCase().includes("sword")) {
            m.setEnabled(isMelee);
          } else if (m.name.toLowerCase().includes("pistol")) {
            m.setEnabled(!isMelee);
          }
        });
        playIdleAnimation(unit);
      });
    }

    consumeAction();
  }

  function createCoverBorder(unit: Unit, tileX: number, tileZ: number, color: Color3): void {
    const cornerSize = 0.12;
    const cornerThickness = 0.05;
    const cornerHeight = 0.08;
    const tileHalf = (TILE_SIZE - TILE_GAP) / 2;

    const worldX = tileX * TILE_SIZE - gridOffset;
    const worldZ = tileZ * TILE_SIZE - gridOffset;

    const cornerMat = new StandardMaterial(`coverCornerMat_${unit.team}_${tileX}_${tileZ}`, scene);
    cornerMat.diffuseColor = color;
    cornerMat.emissiveColor = color.scale(COVER_ACTIVE_ALPHA);
    cornerMat.alpha = COVER_ACTIVE_ALPHA;

    // Get or create mesh array for this unit
    if (!coverMeshesByUnit.has(unit)) {
      coverMeshesByUnit.set(unit, []);
    }
    const unitMeshes = coverMeshesByUnit.get(unit)!;

    // Create L-shaped corner markers at each corner
    const corners = [
      { x: tileHalf, z: tileHalf },     // Top-right
      { x: -tileHalf, z: tileHalf },    // Top-left
      { x: tileHalf, z: -tileHalf },    // Bottom-right
      { x: -tileHalf, z: -tileHalf },   // Bottom-left
    ];

    for (const corner of corners) {
      // Horizontal part of L
      const hBox = MeshBuilder.CreateBox(`coverCornerH_${tileX}_${tileZ}`, {
        width: cornerSize,
        height: cornerHeight,
        depth: cornerThickness,
      }, scene);
      hBox.material = cornerMat;
      hBox.position = new Vector3(
        worldX + corner.x - Math.sign(corner.x) * cornerSize / 2,
        0.08,
        worldZ + corner.z
      );
      hBox.isPickable = false;
      unitMeshes.push(hBox);

      // Vertical part of L
      const vBox = MeshBuilder.CreateBox(`coverCornerV_${tileX}_${tileZ}`, {
        width: cornerThickness,
        height: cornerHeight,
        depth: cornerSize,
      }, scene);
      vBox.material = cornerMat;
      vBox.position = new Vector3(
        worldX + corner.x,
        0.08,
        worldZ + corner.z - Math.sign(corner.z) * cornerSize / 2
      );
      vBox.isPickable = false;
      unitMeshes.push(vBox);
    }
  }

  // Clear ALL cover visualizations (for all units)
  function clearCoverVisualization(): void {
    for (const [_unit, meshes] of coverMeshesByUnit.entries()) {
      for (const mesh of meshes) {
        mesh.dispose();
      }
    }
    coverMeshesByUnit.clear();
  }

  function isValidMove(x: number, z: number): boolean {
    return highlightedTiles.some(tile => {
      const meta = tile.metadata;
      return meta.gridX === x && meta.gridZ === z && tile.material === validMoveMaterial;
    });
  }

  function setUnitExhausted(unit: Unit): void {
    // Dim the 3D model to indicate exhausted
    if (unit.modelMeshes) {
      unit.modelMeshes.forEach(mesh => {
        if (mesh.material && (mesh.material as PBRMaterial).albedoColor) {
          // Store original if not already stored, then dim
          const mat = mesh.material as PBRMaterial;
          if (!mesh.metadata?.originalAlbedo) {
            mesh.metadata = mesh.metadata || {};
            mesh.metadata.originalAlbedo = mat.albedoColor?.clone();
          }
          if (mat.albedoColor) {
            mat.albedoColor = mat.albedoColor.scale(0.4);
          }
        }
      });
    }
  }

  function setUnitInactive(unit: Unit): void {
    // Keep normal appearance - no dimming for non-active units
    resetUnitAppearance(unit);
  }

  function resetUnitAppearance(unit: Unit): void {
    // Reset 3D model materials
    if (unit.modelMeshes && unit.customization) {
      unit.modelMeshes.forEach(mesh => {
        if (mesh.material) {
          const mat = mesh.material as PBRMaterial;
          const matName = mat.name;

          // Restore original colors based on material type
          if (matName === "MainSkin") {
            mat.albedoColor = hexToColor3(SKIN_TONES[unit.customization!.skinTone] || SKIN_TONES[4]);
          } else if (matName === "MainHair") {
            mat.albedoColor = hexToColor3(HAIR_COLORS[unit.customization!.hairColor] || HAIR_COLORS[0]);
          } else if (matName === "MainEye") {
            mat.albedoColor = hexToColor3(EYE_COLORS[unit.customization!.eyeColor] || EYE_COLORS[2]);
          } else if (matName === "TeamMain") {
            mat.albedoColor = unit.teamColor;
          } else if (mesh.metadata?.originalAlbedo) {
            mat.albedoColor = mesh.metadata.originalAlbedo.clone();
          }
        }
      });
    }
  }

  function checkWinCondition(): void {
    const player1Units = units.filter(u => u.team === "player1");
    const player2Units = units.filter(u => u.team === "player2");

    if (player2Units.length === 0) {
      gameOver = true;
      showGameOver(player1TeamColor, "Player 1");
    } else if (player1Units.length === 0) {
      gameOver = true;
      showGameOver(player2TeamColor, "Player 2");
    }
  }

  function showGameOver(winningColor: Color3, winnerName: string): void {
    const overlay = new Rectangle();
    overlay.width = "100%";
    overlay.height = "100%";
    overlay.background = "rgba(0,0,0,0.7)";
    gui.addControl(overlay);

    const container = new StackPanel();
    container.width = "600px";
    container.height = "200px";
    overlay.addControl(container);

    // Convert Color3 to hex
    const r = Math.round(winningColor.r * 255).toString(16).padStart(2, '0');
    const g = Math.round(winningColor.g * 255).toString(16).padStart(2, '0');
    const b = Math.round(winningColor.b * 255).toString(16).padStart(2, '0');
    const colorHex = `#${r}${g}${b}`;

    const text = new TextBlock();
    text.text = `${winnerName} Wins!`;
    text.color = colorHex;
    text.fontSize = 72;
    text.width = "100%";
    text.height = "100px";
    text.fontWeight = "bold";
    container.addControl(text);

    // Back to loadout button
    const backBtn = Button.CreateSimpleButton("backBtn", "Back to Loadout");
    backBtn.width = "200px";
    backBtn.height = "50px";
    backBtn.color = "white";
    backBtn.background = "#444444";
    backBtn.cornerRadius = 10;
    backBtn.fontSize = 18;
    backBtn.onPointerClickObservable.add(() => {
      // Import dynamically to avoid circular dependency
      import("../main").then(main => {
        main.switchToLoadout();
      });
    });
    container.addControl(backBtn);
  }

  function updateHpBar(unit: Unit): void {
    if (unit.hpBar) {
      const hpPercent = Math.max(0, unit.hp / unit.maxHp);
      unit.hpBar.width = `${30 * hpPercent}px`;
      // Update color based on HP percentage - using centralized thresholds and colors
      if (hpPercent < HP_LOW_THRESHOLD) {
        unit.hpBar.background = HP_BAR_RED;
      } else if (hpPercent < HP_MEDIUM_THRESHOLD) {
        unit.hpBar.background = HP_BAR_ORANGE;
      } else {
        unit.hpBar.background = HP_BAR_GREEN;
      }
    }
  }

  function endTurn(): void {
    endCurrentUnitTurn();
  }

  function updateTurnIndicator(): void {
    if (!currentUnit) return;

    const teamName = currentUnit.team === "player1" ? "Player 1" : "Player 2";
    // Convert Color3 to hex for GUI
    const r = Math.round(currentUnit.teamColor.r * 255).toString(16).padStart(2, '0');
    const g = Math.round(currentUnit.teamColor.g * 255).toString(16).padStart(2, '0');
    const b = Math.round(currentUnit.teamColor.b * 255).toString(16).padStart(2, '0');
    const teamColorHex = `#${r}${g}${b}`;

    const unitName = getClassData(currentUnit.unitClass).name;
    const speedInfo = `(Spd: ${getEffectiveSpeed(currentUnit).toFixed(1)})`;
    turnText.text = `${teamName}'s ${unitName} ${speedInfo}`;
    turnText.color = teamColorHex;
  }

  function canSelectUnit(unit: Unit): boolean {
    // Can only select the current unit whose turn it is
    return unit === currentUnit;
  }

  // Shadow position tracking for attack preview
  let shadowPosition: { x: number; z: number } | null = null;

  // Attack preview tiles when hovering during move mode
  let attackPreviewTiles: Mesh[] = [];

  function showAttackPreview(unit: Unit, fromX: number, fromZ: number): void {
    clearAttackPreview();

    if (unit.hasAttacked) return;

    // Get valid attack tiles from shadow position
    const attackTiles = getValidAttackTiles(unit, fromX, fromZ);

    // Show preview on player2 tiles
    for (const player2 of units) {
      if (player2.team === unit.team) continue;
      if (player2.hp <= 0) continue;

      const tileInfo = attackTiles.find(t => t.x === player2.gridX && t.z === player2.gridZ);
      if (tileInfo) {
        const tile = tiles[player2.gridX][player2.gridZ];
        // Use a lighter version of attack/blocked colors for preview
        if (tileInfo.hasLOS) {
          tile.material = attackableMaterial;
        } else {
          tile.material = blockedMaterial;
        }
        attackPreviewTiles.push(tile);
      }
    }
  }

  function clearAttackPreview(): void {
    for (const tile of attackPreviewTiles) {
      const { gridX, gridZ } = tile.metadata;
      // Only reset if not part of main highlights
      if (!highlightedTiles.includes(tile)) {
        tile.material = getDefaultTileMaterial(gridX, gridZ);
      }
    }
    attackPreviewTiles = [];
  }

  // Hover handling removed - mobile-focused, select only
  // Shadow preview now only appears when a move tile is clicked

  // Track if we're executing queued actions
  let isExecutingActions = false;

  // Queue a move action instead of executing immediately
  function queueMoveAction(unit: Unit, targetX: number, targetZ: number): void {
    if (!turnState) return;

    // Add to pending actions
    turnState.pendingActions.push({
      type: "move",
      targetX,
      targetZ,
    });

    // Show shadow at target position
    createShadowPreview(unit, targetX, targetZ);
    shadowPosition = { x: targetX, z: targetZ };

    // Consume an action (for UI display)
    turnState.actionsRemaining--;

    // Update cover preview if there's a pending cover action
    updateCoverPreview();

    // Clear move highlights
    clearHighlights();
    currentActionMode = "none";
    selectedUnit = null;

    // Update menu to show queued action
    updateCommandMenu();
  }

  // Queue an attack action instead of executing immediately
  function queueAttackAction(_attacker: Unit, defender: Unit): void {
    if (!turnState) return;

    // Add to pending actions
    turnState.pendingActions.push({
      type: "attack",
      targetUnit: defender,
    });

    // Consume an action (for UI display)
    turnState.actionsRemaining--;

    // Clear attack highlights
    clearHighlights();
    currentActionMode = "none";
    selectedUnit = null;

    // Update intent indicators (red for attack)
    updateIntentIndicators();

    // Update menu to show queued action
    updateCommandMenu();
  }

  // Queue a heal action instead of executing immediately
  function queueHealAction(_healer: Unit, target: Unit): void {
    if (!turnState) return;

    // Add to pending actions
    turnState.pendingActions.push({
      type: "ability",
      abilityName: "heal",
      targetUnit: target,
    });

    // Consume an action (for UI display)
    turnState.actionsRemaining--;

    // Clear heal highlights
    clearHighlights();
    currentActionMode = "none";
    selectedUnit = null;

    // Update intent indicators (green for heal)
    updateIntentIndicators();

    // Update menu to show queued action
    updateCommandMenu();
  }

  // Queue a conceal action instead of executing immediately
  function queueConcealAction(unit: Unit): void {
    if (!turnState) return;

    // Don't allow queuing if already concealed
    if (unit.isConcealed) {
      console.log(`${unit.team} ${unit.unitClass} is already Concealed.`);
      return;
    }

    // Add to pending actions
    turnState.pendingActions.push({
      type: "ability",
      abilityName: "conceal",
      targetUnit: unit,  // Self-targeting
    });

    // Consume an action
    turnState.actionsRemaining--;

    // Update intent indicators (blue for self-buff)
    updateIntentIndicators();

    // Update menu to show queued action
    updateCommandMenu();
  }

  // Queue a cover action instead of executing immediately
  function queueCoverAction(unit: Unit): void {
    if (!turnState) return;

    // Add to pending actions
    turnState.pendingActions.push({
      type: "ability",
      abilityName: "cover",
      targetUnit: unit,  // Self-targeting
    });

    // Consume an action
    turnState.actionsRemaining--;

    // Show cover preview from effective position (considering pending moves)
    updateCoverPreview();

    // Update intent indicators (blue for self-buff)
    updateIntentIndicators();

    // Update menu to show queued action
    updateCommandMenu();
  }

  // Update cover preview based on pending actions
  function updateCoverPreview(): void {
    clearCoverPreview();
    if (!turnState) return;

    // Find if there's a pending cover action
    const coverAction = turnState.pendingActions.find(a => a.type === "ability" && a.abilityName === "cover");
    if (!coverAction) return;

    const unit = turnState.unit;

    // Find the final position (last move in queue, or current position)
    let finalX = unit.gridX;
    let finalZ = unit.gridZ;
    for (const action of turnState.pendingActions) {
      if (action.type === "move" && action.targetX !== undefined && action.targetZ !== undefined) {
        finalX = action.targetX;
        finalZ = action.targetZ;
      }
    }

    // Show preview at final position
    showCoverPreview(unit, finalX, finalZ);
  }

  // Execute all queued actions sequentially
  function executeQueuedActions(): void {
    if (!turnState || turnState.pendingActions.length === 0) {
      endCurrentUnitTurn();
      return;
    }

    isExecutingActions = true;
    const unit = turnState.unit;
    const actions = [...turnState.pendingActions];

    clearShadowPreview();
    clearAttackPreview();
    clearIntentIndicators();
    clearCoverPreview();
    shadowPosition = null;

    // Helper to check cover reaction after an action completes
    // If cover is triggered, ends turn immediately; otherwise continues to next action
    // Concealed units do not trigger cover
    function afterActionWithCoverCheck(nextIndex: number): void {
      // Check if the acting unit is in a covered tile
      if (unit.hp > 0) {  // Only check if unit is still alive
        const coverTriggered = checkAndTriggerCoverReaction(unit, () => {
          // Cover reaction complete - end turn immediately (skip remaining actions)
          faceClosestEnemy(unit);
          isExecutingActions = false;
          endCurrentUnitTurn();
        });
        if (coverTriggered) {
          return; // Cover reaction is handling the turn end
        }
      }
      // No cover triggered, continue to next action
      processNextAction(nextIndex);
    }

    function processNextAction(index: number): void {
      if (index >= actions.length) {
        faceClosestEnemy(unit);
        isExecutingActions = false;
        endCurrentUnitTurn();
        return;
      }

      const action = actions[index];

      if (action.type === "move" && action.targetX !== undefined && action.targetZ !== undefined) {
        // Execute move with animation
        animateMovement(unit, action.targetX, action.targetZ, () => {
          updateCornerIndicators(unit);
          afterActionWithCoverCheck(index + 1);
        });
      } else if (action.type === "attack" && action.targetUnit) {
        // Check if target is still alive (may have been killed by previous action)
        if (action.targetUnit.hp <= 0) {
          processNextAction(index + 1);
          return;
        }
        // Execute attack
        executeAttack(unit, action.targetUnit, () => {
          afterActionWithCoverCheck(index + 1);
        });
      } else if (action.type === "ability" && action.abilityName === "heal" && action.targetUnit) {
        // Execute heal
        executeHeal(unit, action.targetUnit, () => {
          afterActionWithCoverCheck(index + 1);
        });
      } else if (action.type === "ability" && action.abilityName === "conceal") {
        // Execute conceal
        executeConceal(unit, () => {
          afterActionWithCoverCheck(index + 1);
        });
      } else if (action.type === "ability" && action.abilityName === "cover") {
        // Execute cover - find final position from any remaining move actions
        let finalX = unit.gridX;
        let finalZ = unit.gridZ;
        for (let i = index + 1; i < actions.length; i++) {
          const futureAction = actions[i];
          if (futureAction.type === "move" && futureAction.targetX !== undefined && futureAction.targetZ !== undefined) {
            finalX = futureAction.targetX;
            finalZ = futureAction.targetZ;
          }
        }
        executeCover(unit, () => {
          afterActionWithCoverCheck(index + 1);
        }, finalX, finalZ);
      } else {
        // Unknown action, skip
        processNextAction(index + 1);
      }
    }

    // Start processing
    processNextAction(0);
  }

  // Execute attack (called during execution phase)
  function executeAttack(attacker: Unit, defender: Unit, onComplete: () => void): void {
    setUnitFacing(attacker, defender.gridX, defender.gridZ);

    // Play attack animation based on combat style
    const isMelee = attacker.customization?.combatStyle === "melee";
    const attackAnim = isMelee ? "Sword_Slash" : "Gun_Shoot";

    // Play attacker animation, then apply damage after a delay for impact
    playAnimation(attacker, attackAnim, false, () => {
      playIdleAnimation(attacker);
    });

    // Delay the impact to sync with attack animation (300ms for impact moment)
    setTimeout(() => {
      // Check if defender is concealed
      if (defender.isConcealed) {
        defender.isConcealed = false;
        removeConcealVisual(defender);
        console.log(`${defender.team} ${defender.unitClass}'s Conceal was broken! Damage negated!`);
        // Light hit sound for conceal break
        playSfx(sfx.hitLight);

        playAnimation(defender, "HitRecieve", false, () => {
          playIdleAnimation(defender);
          onComplete();
        });
        return;
      }

      // Apply damage (melee does more damage - using centralized multiplier)
      const isMeleeAttack = attacker.customization?.combatStyle === "melee";
      const damage = isMeleeAttack ? attacker.attack * MELEE_DAMAGE_MULTIPLIER : attacker.attack;
      defender.hp -= damage;
      console.log(`${attacker.team} ${attacker.unitClass} attacks ${defender.team} ${defender.unitClass} for ${damage} damage! (${defender.hp}/${defender.maxHp} HP)`);

      // Hit sounds based on weapon type
      if (isMeleeAttack) playSfx(sfx.hitHeavy);
      else playSfx(sfx.hitMedium);

      updateHpBar(defender);

      // Cancel cover when hit (even if surviving)
      if (defender.isCovering) {
        console.log(`${defender.team} ${defender.unitClass}'s Cover is broken by being hit!`);
        endCover(defender);
      }

      if (defender.hp <= 0) {
        console.log(`${defender.team} ${defender.unitClass} was defeated!`);

        playAnimation(defender, "Death", false, () => {
          defender.mesh.dispose();
          if (defender.hpBar) defender.hpBar.dispose();
          if (defender.hpBarBg) defender.hpBarBg.dispose();
          if (defender.modelRoot) defender.modelRoot.dispose();
          if (defender.animationGroups) defender.animationGroups.forEach(ag => ag.dispose());
          onComplete();
        });

        const index = units.indexOf(defender);
        if (index > -1) units.splice(index, 1);
        const queueIndex = firstRoundQueue.indexOf(defender);
        if (queueIndex > -1) firstRoundQueue.splice(queueIndex, 1);

        checkWinCondition();
      } else {
        playAnimation(defender, "HitRecieve", false, () => {
          playIdleAnimation(defender);
          onComplete();
        });
      }
    }, ATTACK_IMPACT_DELAY_MS); // Delay for attack animation to reach impact
  }

  // Execute heal (called during execution phase)
  function executeHeal(healer: Unit, target: Unit, onComplete: () => void): void {
    if (healer !== target) {
      setUnitFacing(healer, target.gridX, target.gridZ);
    }

    if (healer.modelMeshes) {
      const weaponMeshes = healer.modelMeshes.filter(m =>
        m.name.toLowerCase().includes("sword") || m.name.toLowerCase().includes("pistol")
      );
      weaponMeshes.forEach(m => m.setEnabled(false));

      playAnimation(healer, "Interact", false, () => {
        const isMelee = healer.customization?.combatStyle === "melee";
        healer.modelMeshes?.forEach(m => {
          if (m.name.toLowerCase().includes("sword")) m.setEnabled(isMelee);
          else if (m.name.toLowerCase().includes("pistol")) m.setEnabled(!isMelee);
        });
        playIdleAnimation(healer);
        onComplete();
      });
    } else {
      onComplete();
    }

    const healedAmount = Math.min(healer.healAmount, target.maxHp - target.hp);
    target.hp += healedAmount;
    console.log(`${healer.team} ${healer.unitClass} heals ${target.team} ${target.unitClass} for ${healedAmount} HP! (${target.hp}/${target.maxHp} HP)`);

    playSfx(sfx.heal);
    updateHpBar(target);
  }

  // Execute conceal ability (called during execution phase)
  function executeConceal(unit: Unit, onComplete: () => void): void {
    // Always turn conceal ON (never toggle off)
    if (unit.isConcealed) {
      console.log(`${unit.team} ${unit.unitClass} is already Concealed.`);
      onComplete();
      return;
    }

    unit.isConcealed = true;
    applyConcealVisual(unit);
    console.log(`${unit.team} ${unit.unitClass} activates Conceal!`);

    // Play interact animation
    if (unit.modelMeshes) {
      const weaponMeshes = unit.modelMeshes.filter(m =>
        m.name.toLowerCase().includes("sword") || m.name.toLowerCase().includes("pistol")
      );
      weaponMeshes.forEach(m => m.setEnabled(false));

      playAnimation(unit, "Interact", false, () => {
        const isMelee = unit.customization?.combatStyle === "melee";
        unit.modelMeshes?.forEach(m => {
          if (m.name.toLowerCase().includes("sword")) {
            m.setEnabled(isMelee);
          } else if (m.name.toLowerCase().includes("pistol")) {
            m.setEnabled(!isMelee);
          }
        });
        playIdleAnimation(unit);
        onComplete();
      });
    } else {
      onComplete();
    }
  }

  // Execute cover ability (called during execution phase)
  // fromX/fromZ allow specifying a different position (e.g., if there's a pending move after cover)
  function executeCover(unit: Unit, onComplete: () => void, fromX?: number, fromZ?: number): void {
    unit.isCovering = !unit.isCovering;

    // Clear existing cover for this unit only
    clearCoverTilesForUnit(unit);
    clearCoverVisualizationForUnit(unit);
    clearCoverPreview();  // Clear any pending preview

    // Use provided position or current position
    const coverX = fromX ?? unit.gridX;
    const coverZ = fromZ ?? unit.gridZ;

    if (unit.isCovering) {
      // Get covered tiles based on weapon type
      const isMelee = unit.customization?.combatStyle === "melee";
      let coveredTiles: { x: number; z: number }[];

      if (isMelee) {
        // Sword: Cover all 8 adjacent tiles with LOS check for diagonals
        coveredTiles = getAdjacentTiles(coverX, coverZ).filter(tile => {
          const isDiagonal = tile.x !== coverX && tile.z !== coverZ;
          return !isDiagonal || hasLineOfSight(coverX, coverZ, tile.x, tile.z, unit);
        });
      } else {
        // Gun: Cover all tiles in LOS that they could shoot (not adjacent)
        coveredTiles = getTilesInLOS(coverX, coverZ, true, unit);
      }

      // Add to cover map and create visualization
      setCoverTiles(unit, coveredTiles);
      for (const { x, z } of coveredTiles) {
        createCoverBorder(unit, x, z, unit.teamColor);
      }
      updateHazardStripes();  // Check for dual-covered tiles

      console.log(`${unit.team} ${unit.unitClass} activates Cover! (${coveredTiles.length} tiles)`);
    } else {
      updateHazardStripes();  // Update after deactivation
      console.log(`${unit.team} ${unit.unitClass} deactivates Cover.`);
    }

    // Play interact animation
    if (unit.modelMeshes) {
      const weaponMeshes = unit.modelMeshes.filter(m =>
        m.name.toLowerCase().includes("sword") || m.name.toLowerCase().includes("pistol")
      );
      weaponMeshes.forEach(m => m.setEnabled(false));

      playAnimation(unit, "Interact", false, () => {
        const isMelee = unit.customization?.combatStyle === "melee";
        unit.modelMeshes?.forEach(m => {
          if (m.name.toLowerCase().includes("sword")) {
            m.setEnabled(isMelee);
          } else if (m.name.toLowerCase().includes("pistol")) {
            m.setEnabled(!isMelee);
          }
        });
        playIdleAnimation(unit);
        onComplete();
      });
    } else {
      onComplete();
    }
  }

  // Undo the last queued action
  function undoLastAction(): void {
    if (!turnState || turnState.pendingActions.length === 0) return;

    const lastAction = turnState.pendingActions.pop();
    turnState.actionsRemaining++;

    // If it was a move, clear the shadow preview and update cover preview
    if (lastAction?.type === "move") {
      clearShadowPreview();
      shadowPosition = null;
      updateCoverPreview();  // Update in case cover depends on position
    }

    // If it was a cover action, clear the cover preview
    if (lastAction?.type === "ability" && lastAction.abilityName === "cover") {
      clearCoverPreview();
    }

    // Update intent indicators to reflect remaining actions
    updateIntentIndicators();

    updateCommandMenu();
  }

  // Click handling
  scene.onPointerObservable.add((pointerInfo) => {
    if (gameOver) return;
    if (isAnimatingMovement || isExecutingActions) return;  // Block input during animations
    if (pointerInfo.type !== PointerEventTypes.POINTERPICK) return;

    // Check action mode for menu-driven actions
    const isMenuDriven = currentActionMode !== "none";

    const pickedMesh = pointerInfo.pickInfo?.pickedMesh;
    if (!pickedMesh) return;

    const metadata = pickedMesh.metadata;

    if (metadata?.type === "tile") {
      const { gridX, gridZ } = metadata;

      if (selectedUnit && currentActionMode === "move") {
        if (isValidMove(gridX, gridZ)) {
          queueMoveAction(selectedUnit, gridX, gridZ);
        } else {
          clearHighlights();
          clearShadowPreview();
          clearAttackPreview();
          shadowPosition = null;
          selectedUnit = null;
          if (isMenuDriven) currentActionMode = "none";
        }
      } else if (selectedUnit && currentActionMode === "attack") {
        // Check if there's an attackable unit on this tile
        const targetUnit = attackableUnits.find(u => u.gridX === gridX && u.gridZ === gridZ);
        if (targetUnit) {
          queueAttackAction(selectedUnit, targetUnit);
        } else {
          // Clicked invalid tile, cancel attack mode
          clearHighlights();
          selectedUnit = null;
          currentActionMode = "none";
        }
      } else if (selectedUnit && currentActionMode === "ability") {
        // Check if there's a healable unit on this tile
        // Special case: self-heal with pending move - healer clicks shadow position
        let targetUnit = healableUnits.find(u => u.gridX === gridX && u.gridZ === gridZ);
        if (!targetUnit && shadowPosition && gridX === shadowPosition.x && gridZ === shadowPosition.z) {
          // Clicked on shadow position - check if healer is in healableUnits (self-heal)
          targetUnit = healableUnits.find(u => u === selectedUnit);
        }
        if (targetUnit) {
          queueHealAction(selectedUnit, targetUnit);
          clearHighlights();
          selectedUnit = null;
          currentActionMode = "none";
        } else {
          // Clicked invalid tile, cancel ability mode
          clearHighlights();
          selectedUnit = null;
          currentActionMode = "none";
        }
      }
    } else if (metadata?.type === "unit") {
      const clickedUnit = units.find(u =>
        u.mesh === pickedMesh ||
        u.modelMeshes?.includes(pickedMesh as AbstractMesh)
      );
      if (!clickedUnit) return;

      if (selectedUnit) {
        if (attackableUnits.includes(clickedUnit) && currentActionMode === "attack") {
          queueAttackAction(selectedUnit, clickedUnit);
          return;
        }

        // Check if clicking a healable ally
        if (healableUnits.includes(clickedUnit) && currentActionMode === "ability") {
          // If clicking self with a pending move, don't allow - must click shadow position instead
          if (clickedUnit === selectedUnit && shadowPosition) {
            return; // Ignore click on original position, player should click shadow
          }
          queueHealAction(selectedUnit, clickedUnit);
          clearHighlights();
          selectedUnit = null;
          currentActionMode = "none";
          return;
        }
      }

      // Try to select/deselect unit
      if (selectedUnit === clickedUnit) {
        clearHighlights();
        selectedUnit = null;
      } else if (canSelectUnit(clickedUnit)) {
        selectedUnit = clickedUnit;
        highlightValidActions(clickedUnit);
      }
    }
  });

  // Turn indicator
  const turnText = new TextBlock();
  turnText.text = "Player 1's Turn";
  turnText.color = "#4488ff";
  turnText.fontSize = 24;
  turnText.top = "-45%";
  turnText.fontWeight = "bold";
  gui.addControl(turnText);

  // Rotation buttons
  const rotateLeftBtn = Button.CreateSimpleButton("rotateLeft", "↺");
  rotateLeftBtn.width = "50px";
  rotateLeftBtn.height = "50px";
  rotateLeftBtn.color = "white";
  rotateLeftBtn.background = "#444444";
  rotateLeftBtn.cornerRadius = 25;
  rotateLeftBtn.left = "-45%";
  rotateLeftBtn.top = "40%";
  rotateLeftBtn.onPointerClickObservable.add(() => {
    camera.alpha += Math.PI / 2;
  });
  gui.addControl(rotateLeftBtn);

  const rotateRightBtn = Button.CreateSimpleButton("rotateRight", "↻");
  rotateRightBtn.width = "50px";
  rotateRightBtn.height = "50px";
  rotateRightBtn.color = "white";
  rotateRightBtn.background = "#444444";
  rotateRightBtn.cornerRadius = 25;
  rotateRightBtn.left = "45%";
  rotateRightBtn.top = "40%";
  rotateRightBtn.onPointerClickObservable.add(() => {
    camera.alpha -= Math.PI / 2;
  });
  gui.addControl(rotateRightBtn);

  // ============================================
  // COMMAND MENU UI
  // ============================================

  // Main menu container - bottom left
  const commandMenu = new Rectangle("commandMenu");
  commandMenu.width = "200px";
  commandMenu.height = "340px";
  commandMenu.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
  commandMenu.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
  commandMenu.left = "20px";
  commandMenu.top = "-20px";
  commandMenu.background = "#1a1a2e";
  commandMenu.cornerRadius = 10;
  commandMenu.thickness = 2;
  commandMenu.color = "#4488ff";  // Will be updated to team color
  commandMenu.isVisible = false;
  gui.addControl(commandMenu);

  // Menu layout
  const menuStack = new StackPanel("menuStack");
  menuStack.width = "100%";
  menuStack.paddingTop = "10px";
  menuStack.paddingLeft = "10px";
  menuStack.paddingRight = "10px";
  commandMenu.addControl(menuStack);

  // Unit name header
  const menuUnitName = new TextBlock("menuUnitName");
  menuUnitName.text = "SOLDIER";
  menuUnitName.color = "#ffffff";
  menuUnitName.fontSize = 18;
  menuUnitName.fontWeight = "bold";
  menuUnitName.height = "30px";
  menuUnitName.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
  menuStack.addControl(menuUnitName);

  // Actions remaining text
  const menuActionsText = new TextBlock("menuActionsText");
  menuActionsText.text = "Actions: 2/2";
  menuActionsText.color = "#aaaaaa";
  menuActionsText.fontSize = 12;
  menuActionsText.height = "20px";
  menuActionsText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
  menuStack.addControl(menuActionsText);

  // Separator
  const menuSeparator1 = new Rectangle("menuSeparator1");
  menuSeparator1.width = "90%";
  menuSeparator1.height = "2px";
  menuSeparator1.background = "#333355";
  menuSeparator1.thickness = 0;
  menuStack.addControl(menuSeparator1);

  // Action buttons container
  const actionButtonsStack = new StackPanel("actionButtons");
  actionButtonsStack.width = "100%";
  actionButtonsStack.height = "100px";
  actionButtonsStack.paddingTop = "5px";
  menuStack.addControl(actionButtonsStack);

  // Move button
  const moveBtn = Button.CreateSimpleButton("moveBtn", "Move");
  moveBtn.width = "100%";
  moveBtn.height = "28px";
  moveBtn.color = "white";
  moveBtn.background = "#335588";
  moveBtn.cornerRadius = 5;
  moveBtn.fontSize = 14;
  moveBtn.paddingBottom = "3px";
  moveBtn.onPointerClickObservable.add(() => {
    if (currentUnit && !isAnimatingMovement) {
      currentActionMode = "move";
      selectedUnit = currentUnit;
      highlightValidActions(currentUnit);
    }
  });
  actionButtonsStack.addControl(moveBtn);

  // Attack button
  const attackBtn = Button.CreateSimpleButton("attackBtn", "Attack");
  attackBtn.width = "100%";
  attackBtn.height = "28px";
  attackBtn.color = "white";
  attackBtn.background = "#883333";
  attackBtn.cornerRadius = 5;
  attackBtn.fontSize = 14;
  attackBtn.paddingBottom = "3px";
  attackBtn.onPointerClickObservable.add(() => {
    if (currentUnit && !isAnimatingMovement) {
      currentActionMode = "attack";
      selectedUnit = currentUnit;
      // Highlight attack targets from shadow position (if pending move) or current position
      const effectiveX = shadowPosition?.x ?? currentUnit.gridX;
      const effectiveZ = shadowPosition?.z ?? currentUnit.gridZ;
      highlightAttackTargets(currentUnit, effectiveX, effectiveZ);
    }
  });
  actionButtonsStack.addControl(attackBtn);

  // Ability button (changes based on unit type)
  const abilityBtn = Button.CreateSimpleButton("abilityBtn", "Ability");
  abilityBtn.width = "100%";
  abilityBtn.height = "28px";
  abilityBtn.color = "white";
  abilityBtn.background = "#338855";
  abilityBtn.cornerRadius = 5;
  abilityBtn.fontSize = 14;
  abilityBtn.onPointerClickObservable.add(() => {
    if (currentUnit && !isAnimatingMovement && hasActionsRemaining()) {
      if (currentUnit.unitClass === "medic") {
        // Heal mode - highlight healable allies
        currentActionMode = "ability";
        selectedUnit = currentUnit;
        highlightHealTargets(currentUnit);
      } else if (currentUnit.unitClass === "operator") {
        // Conceal - queue as action
        queueConcealAction(currentUnit);
      } else if (currentUnit.unitClass === "soldier") {
        // Cover - queue as action
        queueCoverAction(currentUnit);
      }
    }
  });
  actionButtonsStack.addControl(abilityBtn);

  // Separator
  const menuSeparator2 = new Rectangle("menuSeparator2");
  menuSeparator2.width = "90%";
  menuSeparator2.height = "2px";
  menuSeparator2.background = "#333355";
  menuSeparator2.thickness = 0;
  menuStack.addControl(menuSeparator2);

  // Turn preview section
  const previewLabel = new TextBlock("previewLabel");
  previewLabel.text = "Turn Preview:";
  previewLabel.color = "#888888";
  previewLabel.fontSize = 11;
  previewLabel.height = "18px";
  previewLabel.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
  previewLabel.paddingTop = "5px";
  menuStack.addControl(previewLabel);

  const previewText = new TextBlock("previewText");
  previewText.text = "(no actions queued)";
  previewText.color = "#aaaaaa";
  previewText.fontSize = 11;
  previewText.height = "80px";
  previewText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
  previewText.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
  previewText.textWrapping = true;
  menuStack.addControl(previewText);

  // Bottom buttons (Undo / Execute)
  const bottomButtonsGrid = new Grid("bottomButtons");
  bottomButtonsGrid.width = "100%";
  bottomButtonsGrid.height = "35px";
  bottomButtonsGrid.addColumnDefinition(0.5);
  bottomButtonsGrid.addColumnDefinition(0.5);
  bottomButtonsGrid.addRowDefinition(1);
  menuStack.addControl(bottomButtonsGrid);

  const undoBtn = Button.CreateSimpleButton("undoBtn", "Undo");
  undoBtn.width = "95%";
  undoBtn.height = "28px";
  undoBtn.color = "#ff8888";
  undoBtn.background = "#442222";
  undoBtn.cornerRadius = 5;
  undoBtn.fontSize = 12;
  undoBtn.onPointerClickObservable.add(() => {
    undoLastAction();
  });
  bottomButtonsGrid.addControl(undoBtn, 0, 0);

  const executeBtn = Button.CreateSimpleButton("executeBtn", "Execute");
  executeBtn.width = "95%";
  executeBtn.height = "28px";
  executeBtn.color = "white";
  executeBtn.background = "#338833";
  executeBtn.cornerRadius = 5;
  executeBtn.fontSize = 12;
  executeBtn.onPointerClickObservable.add(() => {
    if (currentUnit && !isExecutingActions) {
      executeQueuedActions();
    }
  });
  bottomButtonsGrid.addControl(executeBtn, 0, 1);

  // Pulse the execute button when actions are queued
  let executePulseTime = 0;
  scene.onBeforeRenderObservable.add(() => {
    const shouldPulse = turnState && turnState.pendingActions.length > 0 && turnState.actionsRemaining === 0;
    if (shouldPulse) {
      executePulseTime += engine.getDeltaTime() / 1000;
      const pulse = 0.7 + 0.3 * Math.sin(executePulseTime * 4);
      const g = Math.round(0x88 * pulse);
      const gHex = g.toString(16).padStart(2, '0');
      executeBtn.background = `#33${gHex}33`;
    } else {
      executePulseTime = 0;
      executeBtn.background = "#338833";
    }
  });

  // Function to update menu for current unit
  function updateCommandMenu(): void {
    if (!currentUnit) {
      commandMenu.isVisible = false;
      return;
    }

    commandMenu.isVisible = true;

    // Position menu based on team (P1 = left, P2 = right)
    if (currentUnit.team === "player1") {
      commandMenu.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      commandMenu.left = "20px";
    } else {
      commandMenu.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
      commandMenu.left = "-20px";  // Negative moves it left from right edge
    }
    // Force layout update
    commandMenu.markAsDirty();

    // Update team color border
    const r = Math.round(currentUnit.teamColor.r * 255).toString(16).padStart(2, '0');
    const g = Math.round(currentUnit.teamColor.g * 255).toString(16).padStart(2, '0');
    const b = Math.round(currentUnit.teamColor.b * 255).toString(16).padStart(2, '0');
    commandMenu.color = `#${r}${g}${b}`;

    // Update unit name from class data
    const classData = getClassData(currentUnit.unitClass);
    menuUnitName.text = classData.name.toUpperCase();

    // Update ability button from class data
    if (abilityBtn.textBlock) {
      abilityBtn.textBlock.text = classData.ability;
    }

    // Update attack button based on combat style
    if (attackBtn.textBlock) {
      const isMelee = currentUnit.customization?.combatStyle === "melee";
      attackBtn.textBlock.text = isMelee ? "Strike" : "Shoot";
    }

    // Update actions text from turnState (using centralized constant)
    const remaining = turnState?.actionsRemaining ?? 0;
    menuActionsText.text = `Actions: ${remaining}/${ACTIONS_PER_TURN}`;

    // Update preview section
    updateMenuPreview();
  }

  function updateMenuPreview(): void {
    if (!currentUnit || !turnState) {
      previewText.text = "";
      return;
    }

    const lines: string[] = [];

    // Show queued actions
    if (turnState.pendingActions.length > 0) {
      lines.push("Queued:");
      for (const action of turnState.pendingActions) {
        if (action.type === "move") {
          lines.push(`  Move to (${action.targetX},${action.targetZ})`);
        } else if (action.type === "attack" && action.targetUnit) {
          const targetName = getClassData(action.targetUnit.unitClass).name;
          const isMelee = currentUnit.customization?.combatStyle === "melee";
          const attackVerb = isMelee ? "Strike" : "Shoot";
          lines.push(`  ${attackVerb} ${targetName}`);
        } else if (action.type === "ability" && action.abilityName === "heal" && action.targetUnit) {
          const targetName = action.targetUnit === currentUnit ? "self" : getClassData(action.targetUnit.unitClass).name;
          lines.push(`  Heal ${targetName}`);
        } else if (action.type === "ability" && action.abilityName === "conceal") {
          lines.push(`  Conceal`);
        } else if (action.type === "ability" && action.abilityName === "cover") {
          lines.push(`  Cover`);
        }
      }
    }

    // Show unit status effects
    if (currentUnit.isConcealed) {
      lines.push("* CONCEALED");
    }
    if (currentUnit.isCovering) {
      lines.push("* COVERING");
    }

    // Show action status
    const remaining = turnState.actionsRemaining;
    if (remaining > 0 && turnState.pendingActions.length < 2) {
      lines.push(`${remaining} action(s) left`);
    }

    previewText.text = lines.join("\n");
  }

  // Register menu update callback
  onTurnStartCallback = () => updateCommandMenu();

  // Game is initialized when spawnAllUnits completes (calls startGame)

  return scene;
}

function createUnitMaterial(name: string, color: Color3, scene: Scene): StandardMaterial {
  const mat = new StandardMaterial(`${name}Mat`, scene);
  mat.diffuseColor = color;
  return mat;
}

// Map unit types to model file names
function getModelFileName(unitClass: UnitClass, isMale: boolean): string {
  const gender = isMale ? "m" : "f";
  const classData = getClassData(unitClass);
  return `${classData.modelFile}_${gender}.glb`;
}

async function createUnit(
  unitClass: UnitClass,
  team: Team,
  gridX: number,
  gridZ: number,
  scene: Scene,
  _materials: Record<UnitClass, StandardMaterial>,  // Kept for API compatibility
  gridOffset: number,
  gui: AdvancedDynamicTexture,
  loadoutIndex: number,
  teamColor: Color3,
  customization?: UnitCustomization
): Promise<Unit> {
  const classData = getClassData(unitClass);

  // Default customization if not provided
  const c: UnitCustomization = customization ?? {
    body: "male",
    combatStyle: "ranged",
    handedness: "right",
    head: 0,
    hairColor: 0,
    eyeColor: 2,
    skinTone: 4,
  };

  // Load 3D model
  const isMale = c.body === "male";
  const modelFile = getModelFileName(unitClass, isMale);
  const result = await SceneLoader.ImportMeshAsync("", "/models/", modelFile, scene);

  const modelRoot = result.meshes[0];
  const modelMeshes = result.meshes;
  const animationGroups = result.animationGroups;

  // Hide model initially until facing is set (prevents wrong-direction flash)
  modelRoot.setEnabled(false);

  // Position and scale the model - using centralized constants
  modelRoot.position = new Vector3(
    gridX * TILE_SIZE - gridOffset,
    BATTLE_MODEL_Y_POSITION,
    gridZ * TILE_SIZE - gridOffset
  );
  modelRoot.scaling = new Vector3(
    c.handedness === "right" ? -BATTLE_MODEL_SCALE : BATTLE_MODEL_SCALE,
    BATTLE_MODEL_SCALE,
    BATTLE_MODEL_SCALE
  );

  // Apply customizations to the model
  // Head visibility (using centralized constant)
  for (let i = 0; i < HEAD_VARIANT_COUNT; i++) {
    const headName = `Head_00${i + 1}`;
    const headMeshes = modelMeshes.filter(m => m.name.includes(headName));
    headMeshes.forEach(mesh => mesh.setEnabled(i === c.head));
  }

  // Weapon visibility based on combat style
  const swordMeshes = modelMeshes.filter(m => m.name.toLowerCase().includes("sword"));
  const pistolMeshes = modelMeshes.filter(m => m.name.toLowerCase().includes("pistol"));
  const isMelee = c.combatStyle === "melee";
  swordMeshes.forEach(m => m.setEnabled(isMelee));
  pistolMeshes.forEach(m => m.setEnabled(!isMelee));

  // Apply colors to materials
  modelMeshes.forEach(mesh => {
    if (!mesh.material) return;
    const mat = mesh.material as PBRMaterial;
    const matName = mat.name;

    if (matName === "MainSkin") {
      mat.albedoColor = hexToColor3(SKIN_TONES[c.skinTone] || SKIN_TONES[4]);
    } else if (matName === "MainHair") {
      mat.albedoColor = hexToColor3(HAIR_COLORS[c.hairColor] || HAIR_COLORS[0]);
    } else if (matName === "MainEye") {
      mat.albedoColor = hexToColor3(EYE_COLORS[c.eyeColor] || EYE_COLORS[2]);
    } else if (matName === "TeamMain") {
      mat.albedoColor = teamColor;
    }
  });

  // Set metadata for click detection
  modelMeshes.forEach(mesh => {
    mesh.metadata = { type: "unit", unitClass, team };
  });

  // Start idle animation
  animationGroups.forEach(ag => ag.stop());
  const idleAnim = isMelee
    ? animationGroups.find(ag => ag.name === "Idle_Sword")
    : animationGroups.find(ag => ag.name === "Idle_Gun");
  idleAnim?.start(true);

  // Create an invisible mesh for HP bar linkage (positioned at model's head height)
  const hpBarAnchor = MeshBuilder.CreateBox(`${team}_${unitClass}_anchor_${gridX}_${gridZ}`, { size: 0.01 }, scene);
  hpBarAnchor.position = new Vector3(
    gridX * TILE_SIZE - gridOffset,
    HP_BAR_ANCHOR_HEIGHT,
    gridZ * TILE_SIZE - gridOffset
  );
  hpBarAnchor.isVisible = false;
  hpBarAnchor.metadata = { type: "unit", unitClass, team };

  // HP bar background - using centralized colors
  const hpBarBg = new Rectangle();
  hpBarBg.width = "34px";
  hpBarBg.height = "6px";
  hpBarBg.background = HP_BAR_BACKGROUND;
  hpBarBg.thickness = 1;
  hpBarBg.color = HP_BAR_BORDER;
  hpBarBg.isVisible = false;  // Hide until model is ready
  gui.addControl(hpBarBg);
  hpBarBg.linkWithMesh(hpBarAnchor);
  hpBarBg.linkOffsetY = -50;

  // HP bar fill - using centralized colors
  const hpBar = new Rectangle();
  hpBar.width = "30px";
  hpBar.height = "4px";
  hpBar.background = HP_BAR_GREEN;
  hpBar.horizontalAlignment = Rectangle.HORIZONTAL_ALIGNMENT_LEFT;
  hpBar.left = "2px";
  hpBarBg.addControl(hpBar);

  const originalColor = teamColor.clone();

  return {
    mesh: hpBarAnchor,  // Use anchor as the main "mesh" for positioning
    unitClass,
    team,
    gridX,
    gridZ,
    moveRange: classData.moveRange,
    attackRange: classData.attackRange,
    hp: classData.hp,
    maxHp: classData.hp,
    attack: classData.attack,
    healAmount: classData.healAmount,
    hpBar,
    hpBarBg,
    originalColor,
    hasMoved: false,
    hasAttacked: false,
    speed: 1,
    speedBonus: 0,
    accumulator: 0,
    loadoutIndex,
    modelRoot,
    modelMeshes,
    animationGroups,
    customization: c,
    teamColor,
    facing: {  // Will be initialized via initFacing after spawn
      currentAngle: 0,
      baseOffset: 0,
      isFlipped: false
    },
    isConcealed: false,
    isCovering: false,
  };
}

function moveUnit(unit: Unit, newX: number, newZ: number, gridOffset: number): void {
  unit.gridX = newX;
  unit.gridZ = newZ;

  const newPosX = newX * TILE_SIZE - gridOffset;
  const newPosZ = newZ * TILE_SIZE - gridOffset;

  // Move HP bar anchor (using centralized height constant)
  unit.mesh.position = new Vector3(newPosX, HP_BAR_ANCHOR_HEIGHT, newPosZ);

  // Move 3D model (using centralized Y position constant)
  if (unit.modelRoot) {
    unit.modelRoot.position = new Vector3(newPosX, BATTLE_MODEL_Y_POSITION, newPosZ);
  }
}
