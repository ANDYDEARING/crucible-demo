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
  Matrix,
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF";
import { AdvancedDynamicTexture, TextBlock, Button, Rectangle, StackPanel, Grid, Control, ScrollViewer } from "@babylonjs/gui";
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
  BOOST_MULTIPLIER,
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

// Module-level music player (persists across orientation reloads)
let battleMusic: HTMLAudioElement | null = null;

// Import command pattern for action queue
import {
  type CommandExecutor,
  type ControllerContext,
  type BattleCommand,
  CommandQueue,
  createMoveCommand,
  createAttackCommand,
  createHealCommand,
  createConcealCommand,
  createCoverCommand,
  processCommandQueue,
  ControllerManager,
  createLocalPvPControllers,
  createPvEControllers,
} from "../battle";

// Pure game logic is available in /src/battle/ for headless simulations.
// This file (BattleScene.ts) handles visual rendering and uses inline logic
// that mirrors the pure versions. Future refactor: delegate to battle module.
// See: /src/battle/state.ts (UnitState, BattleState)
//      /src/battle/rules.ts (movement, LOS, combat, turns)
//      /src/battle/commands.ts (Command pattern for actions)
//      /src/battle/controllers.ts (Controller abstraction for PvE/PvP)

// Greek letters for unit designations (matches LoadoutScene)
const UNIT_DESIGNATIONS = ["Δ", "Ψ", "Ω"]; // Delta, Psi, Omega

// Boost info for turn order display
const BOOST_INFO = [
  { name: "Tough", stat: "HP" },
  { name: "Deadly", stat: "Damage" },
  { name: "Quick", stat: "Speed" },
];

export function createBattleScene(engine: Engine, canvas: HTMLCanvasElement, loadout: Loadout | null): Scene {
  const scene = new Scene(engine);
  // Use centralized scene background color
  const bg = SCENE_BACKGROUNDS.battle;
  scene.clearColor.set(bg.r, bg.g, bg.b, bg.a);

  // ============================================
  // RESPONSIVE SIZING
  // ============================================
  const screenWidth = engine.getRenderWidth();
  const screenHeight = engine.getRenderHeight();
  const isLandscapePhone = screenHeight < 500 && screenWidth < 1024;
  const isMobile = screenWidth < 600 && !isLandscapePhone;
  const isTablet = (screenWidth >= 600 && screenWidth < 1024) || isLandscapePhone;
  const isTouch = isMobile || isTablet;

  // Note: We don't reload BattleScene on orientation change since that would
  // lose all battle state (unit positions, HP, turn order). The UI scales
  // reasonably and the 3D scene auto-adjusts via engine.resize().

  // Battle music - using module-level variable for persistence across reloads
  if (!battleMusic) {
    battleMusic = createMusicPlayer(MUSIC.battle, AUDIO_VOLUMES.music, true, LOOP_BUFFER_TIME);
  }
  // Only start playing if not already playing
  if (battleMusic.paused) {
    battleMusic.play();
  }

  scene.onDisposeObservable.add(() => {
    // Stop music when leaving battle scene
    if (battleMusic) {
      battleMusic.pause();
      battleMusic.src = "";
      battleMusic = null;
    }
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
  // Camera controls will be attached by updateCameraModeButton() when toggle is initialized
  // Don't attach here to avoid interfering with GUI clicks before toggle is ready
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

  // GUI - ensure it captures pointer events before the scene
  const gui = AdvancedDynamicTexture.CreateFullscreenUI("UI");
  gui.isForeground = true;

  // Units
  const units: Unit[] = [];

  // Current turn state for preview/undo system
  let turnState: TurnState | null = null;
  let currentActionMode: ActionMode = "none";

  // Command queue for pending actions
  const commandQueue = new CommandQueue();

  // Helper to get unit ID (for command serialization)
  function getUnitId(unit: Unit): string {
    return `${unit.team}-${units.indexOf(unit)}`;
  }

  // Helper to find unit by ID
  function findUnitById(id: string): Unit | undefined {
    const [team, indexStr] = id.split("-");
    const index = parseInt(indexStr, 10);
    return units.find((u, i) => u.team === team && i === index);
  }

  // ============================================
  // CONTROLLER SYSTEM
  // ============================================
  // Controllers handle input for each team (human, AI, or network).
  // Default is local PvP (both human). Can be changed for PvE or online play.

  // Create controller manager based on game mode from loadout
  let controllerManager: ControllerManager;
  if (loadout?.gameMode === "local-pve") {
    // PvE mode: human controls one team, AI controls the other
    const humanTeam = loadout.humanTeam || "player1";
    controllerManager = createPvEControllers(humanTeam, "medium");
  } else {
    // Default: local PvP (both teams controlled by humans)
    controllerManager = createLocalPvPControllers();
  }

  /** Create controller context for the current turn */
  function createControllerContext(unit: Unit): ControllerContext {
    return {
      state: extractBattleState(),
      unit: extractUnitState(unit, units.indexOf(unit)),
      actionsRemaining: turnState?.actionsRemaining ?? 0,

      issueCommand(command: BattleCommand): boolean {
        if (!turnState || turnState.actionsRemaining <= 0) return false;

        // Get pending move position (if unit has a queued move, use that position)
        let fromX = unit.gridX;
        let fromZ = unit.gridZ;
        for (const action of turnState.pendingActions) {
          if (action.type === "move" && action.targetX !== undefined && action.targetZ !== undefined) {
            fromX = action.targetX;
            fromZ = action.targetZ;
          }
        }

        // Route command to appropriate queue function
        switch (command.type) {
          case "move": {
            // Validate from pending position (works for both human UI and AI)
            const validMoves = getValidMoveTiles(unit, fromX, fromZ);
            const isValid = validMoves.some(t => t.x === command.targetX && t.z === command.targetZ);
            if (isValid) {
              queueMoveAction(unit, command.targetX, command.targetZ);
              return true;
            }
            return false;
          }

          case "attack": {
            const target = findUnitById(command.targetUnitId);
            if (!target) return false;
            // Validate from pending position (works for both human UI and AI)
            const validTargets = getAttackableEnemiesWithLOS(unit, fromX, fromZ);
            if (validTargets.includes(target)) {
              queueAttackAction(unit, target);
              return true;
            }
            return false;
          }

          case "heal": {
            const target = findUnitById(command.targetUnitId);
            if (!target) return false;
            // Validate from pending position (works for both human UI and AI)
            const validTargets = getHealableAllies(unit, fromX, fromZ);
            if (validTargets.includes(target)) {
              queueHealAction(unit, target);
              return true;
            }
            return false;
          }

          case "conceal":
            if (unit.unitClass === "operator" && !unit.isConcealed) {
              queueConcealAction(unit);
              return true;
            }
            return false;

          case "cover":
            if (unit.unitClass === "soldier") {
              queueCoverAction(unit);
              return true;
            }
            return false;
        }
      },

      executeTurn(): void {
        executeQueuedActions();
      },

      undoLastCommand(): void {
        undoLastAction();
      },
    };
  }

  /** Get current controller manager (for external configuration) */
  function getControllerManager(): ControllerManager {
    return controllerManager;
  }

  /** Set controller manager (to switch between PvP/PvE modes) */
  function setControllerManager(manager: ControllerManager): void {
    controllerManager.dispose();
    controllerManager = manager;
  }

  // Export controller functions for external use
  void getControllerManager;
  void setControllerManager;

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

        // If excluding adjacent (for guns), skip all 8 adjacent tiles including diagonals
        if (excludeAdjacent && isAdjacent(fromX, fromZ, x, z)) continue;

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
    shadowBaseMesh.isPickable = false; // Allow clicks to pass through

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
    shadowMesh.isPickable = false; // Allow clicks to pass through
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
        selection.customization,
        selection.boost
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
        selection.customization,
        selection.boost
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
      if (unit.designationLabel) {
        unit.designationLabel.isVisible = true;
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

    // Clear command queue for new turn
    commandQueue.clear();

    // Initialize turn state for preview/undo system (using centralized constant)
    turnState = {
      unit,
      actionsRemaining: ACTIONS_PER_TURN,
      pendingActions: [],
      originalPosition: { x: unit.gridX, z: unit.gridZ },
      originalFacing: unit.facing.currentAngle,
    };

    // Call turn start callback (for command menu update and highlighting)
    if (onTurnStartCallback) {
      onTurnStartCallback(unit);
    }

    // Note: highlightAllAvailableActions() is called in onTurnStartCallback
    // which handles all highlighting including medic green self-heal

    // Notify controller that turn has started
    // This allows AI/network controllers to take over
    const context = createControllerContext(unit);
    controllerManager.notifyTurnStart(unit.team, context);
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

    // Notify controller that turn ended
    controllerManager.notifyTurnEnd(unit.team);

    lastActingTeam = unit.team;
    selectedUnit = null;
    currentUnit = null;
    clearHighlights();

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

    // Always keep the active unit's tile highlighted yellow
    highlightActiveUnitTile();
  }

  // Highlight just the active unit's current tile (or shadow position) yellow
  function highlightActiveUnitTile(): void {
    if (!currentUnit) return;

    // Use shadow position if there's a pending move, otherwise current position
    const effectiveX = shadowPosition?.x ?? currentUnit.gridX;
    const effectiveZ = shadowPosition?.z ?? currentUnit.gridZ;

    const tile = tiles[effectiveX][effectiveZ];
    tile.material = selectedMaterial;

    // Track it so it can be cleared properly later
    if (!highlightedTiles.includes(tile)) {
      highlightedTiles.push(tile);
    }
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

  // ============================================
  // UNIFIED ACTION HIGHLIGHTING (Mobile-friendly UI)
  // Shows all available actions at once: moves, attacks, and self-ability
  // ============================================

  function highlightAllAvailableActions(unit: Unit): void {
    clearHighlights();

    // Always clear target arrays to prevent stale data
    attackableUnits = [];
    healableUnits = [];

    // Always update action buttons (even if no actions remain)
    updateActionButtons();

    if (!hasActionsRemaining()) return;

    // Use shadow position if there's a pending move, otherwise current position
    const effectiveX = shadowPosition?.x ?? unit.gridX;
    const effectiveZ = shadowPosition?.z ?? unit.gridZ;

    // 1. Highlight valid move tiles (blue)
    const validTiles = getValidMoveTiles(unit, effectiveX, effectiveZ);
    for (const { x, z } of validTiles) {
      const tile = tiles[x][z];
      tile.material = validMoveMaterial;
      highlightedTiles.push(tile);
    }

    // 2. Highlight attackable enemies (red)
    const attackTiles = getValidAttackTiles(unit, effectiveX, effectiveZ);

    for (const enemy of units) {
      if (enemy.team === unit.team) continue;
      if (enemy.hp <= 0) continue;

      const tileInfo = attackTiles.find(t => t.x === enemy.gridX && t.z === enemy.gridZ);
      if (tileInfo?.hasLOS) {
        const tile = tiles[enemy.gridX][enemy.gridZ];
        tile.material = attackableMaterial;
        highlightedTiles.push(tile);
        attackableUnits.push(enemy);
      }
    }

    // 3. Highlight self for ability (based on class)
    const currentTile = tiles[effectiveX][effectiveZ];
    const classData = getClassData(unit.unitClass);

    if (classData.ability === "Heal" && unit.hp < unit.maxHp) {
      // Medic can self-heal - green highlight
      currentTile.material = healableMaterial;
    } else if (classData.ability === "Conceal" && !unit.isConcealed) {
      // Operator can conceal - yellow highlight
      currentTile.material = selectedMaterial;
    } else if (classData.ability === "Cover" && !unit.isCovering) {
      // Soldier can cover - yellow highlight
      currentTile.material = selectedMaterial;
    } else {
      // Default: yellow selected highlight
      currentTile.material = selectedMaterial;
    }
    highlightedTiles.push(currentTile);

    // 4. Also highlight healable allies for Medic
    if (classData.ability === "Heal") {
      const allies = getHealableAllies(unit, effectiveX, effectiveZ);
      for (const ally of allies) {
        if (ally !== unit) { // Skip self, already handled above
          const tile = tiles[ally.gridX][ally.gridZ];
          tile.material = healableMaterial;
          highlightedTiles.push(tile);
        }
      }
      // Include self in healableUnits if damaged
      if (unit.hp < unit.maxHp) {
        healableUnits = allies.includes(unit) ? allies : [...allies, unit];
      } else {
        healableUnits = allies;
      }
    }

    // Update action buttons visibility
    updateActionButtons();
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
      controllerManager.notifyGameEnd("player1");
      showGameOver(player1TeamColor, "Player 1");
    } else if (player1Units.length === 0) {
      gameOver = true;
      controllerManager.notifyGameEnd("player2");
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

  // updateTurnIndicator removed - info now shown in command menu popup

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

    // Add command to queue
    commandQueue.enqueue(createMoveCommand(targetX, targetZ));

    // Also add to pending actions (for UI preview compatibility)
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

    // Re-highlight remaining available actions (no popup mode)
    highlightAllAvailableActions(currentUnit!);

    // Update menu to show queued action
    updateCommandMenu();
  }

  // Queue an attack action instead of executing immediately
  function queueAttackAction(_attacker: Unit, defender: Unit): void {
    if (!turnState) return;

    // Add command to queue
    commandQueue.enqueue(createAttackCommand(getUnitId(defender)));

    // Also add to pending actions (for UI preview compatibility)
    turnState.pendingActions.push({
      type: "attack",
      targetUnit: defender,
    });

    // Consume an action (for UI display)
    turnState.actionsRemaining--;

    // Update intent indicators (red for attack)
    updateIntentIndicators();

    // Re-highlight remaining available actions (no popup mode)
    highlightAllAvailableActions(currentUnit!);

    // Update menu to show queued action
    updateCommandMenu();
  }

  // Queue a heal action instead of executing immediately
  function queueHealAction(_healer: Unit, target: Unit): void {
    if (!turnState) return;

    // Add command to queue
    commandQueue.enqueue(createHealCommand(getUnitId(target)));

    // Also add to pending actions (for UI preview compatibility)
    turnState.pendingActions.push({
      type: "ability",
      abilityName: "heal",
      targetUnit: target,
    });

    // Consume an action (for UI display)
    turnState.actionsRemaining--;

    // Update intent indicators (green for heal)
    updateIntentIndicators();

    // Re-highlight remaining available actions (no popup mode)
    highlightAllAvailableActions(currentUnit!);

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

    // Add command to queue
    commandQueue.enqueue(createConcealCommand());

    // Also add to pending actions (for UI preview compatibility)
    turnState.pendingActions.push({
      type: "ability",
      abilityName: "conceal",
      targetUnit: unit,  // Self-targeting
    });

    // Consume an action
    turnState.actionsRemaining--;

    // Update intent indicators (blue for self-buff)
    updateIntentIndicators();

    // Re-highlight remaining available actions (no popup mode)
    highlightAllAvailableActions(currentUnit!);

    // Update menu to show queued action
    updateCommandMenu();
  }

  // Queue a cover action instead of executing immediately
  function queueCoverAction(unit: Unit): void {
    if (!turnState) return;

    // Add command to queue
    commandQueue.enqueue(createCoverCommand());

    // Also add to pending actions (for UI preview compatibility)
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

    // Re-highlight remaining available actions (no popup mode)
    highlightAllAvailableActions(currentUnit!);

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
  // Alternative: Use processCommandQueue(commandQueue, commandExecutor) for command-based execution
  function executeQueuedActions(): void {
    if (!turnState || turnState.pendingActions.length === 0) {
      endCurrentUnitTurn();
      return;
    }

    isExecutingActions = true;
    const unit = turnState.unit;
    const actions = [...turnState.pendingActions];

    // Note: commandQueue contains the same actions as pendingActions
    // To use the command pattern instead, replace the code below with:
    // processCommandQueue(commandQueue, commandExecutor);
    // return;
    void processCommandQueue; // Mark as available for future use

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

      // Update status bar if current unit's HP changed
      if (defender === currentUnit) {
        updateCurrentUnitStatusBar();
      }

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
          if (defender.designationLabel) defender.designationLabel.dispose();
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

    // Update status bar if current unit's HP changed
    if (target === currentUnit) {
      updateCurrentUnitStatusBar();
    }
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

  // ============================================
  // COMMAND EXECUTOR
  // ============================================
  // Implements the CommandExecutor interface from /src/battle/commands.ts
  // This allows actions to be executed via the command pattern.

  /**
   * Command executor implementation for the battle scene.
   * Bridges between pure commands and visual execution.
   */
  const commandExecutor: CommandExecutor = {
    executeMove(command, onComplete) {
      if (!turnState) { onComplete(); return; }
      const unit = turnState.unit;
      animateMovement(unit, command.targetX, command.targetZ, () => {
        updateCornerIndicators(unit);
        onComplete();
      });
    },

    executeAttack(command, onComplete) {
      if (!turnState) { onComplete(); return; }
      const unit = turnState.unit;
      const target = findUnitById(command.targetUnitId);
      if (!target || target.hp <= 0) { onComplete(); return; }
      executeAttack(unit, target, onComplete);
    },

    executeHeal(command, onComplete) {
      if (!turnState) { onComplete(); return; }
      const unit = turnState.unit;
      const target = findUnitById(command.targetUnitId);
      if (!target) { onComplete(); return; }
      executeHeal(unit, target, onComplete);
    },

    executeConceal(_command, onComplete) {
      if (!turnState) { onComplete(); return; }
      executeConceal(turnState.unit, onComplete);
    },

    executeCover(_command, onComplete) {
      if (!turnState) { onComplete(); return; }
      const unit = turnState.unit;
      // Find final position from remaining commands
      const lastMove = commandQueue.getLastMoveCommand();
      const finalX = lastMove?.targetX ?? unit.gridX;
      const finalZ = lastMove?.targetZ ?? unit.gridZ;
      executeCover(unit, onComplete, finalX, finalZ);
    },

    onQueueComplete() {
      if (turnState) {
        faceClosestEnemy(turnState.unit);
      }
      isExecutingActions = false;
      endCurrentUnitTurn();
    },

    checkReactions(onReactionComplete) {
      if (!turnState || turnState.unit.hp <= 0) return false;
      return checkAndTriggerCoverReaction(turnState.unit, () => {
        faceClosestEnemy(turnState!.unit);
        isExecutingActions = false;
        endCurrentUnitTurn();
        onReactionComplete();
      });
    },
  };

  // Export command executor for external use (AI, network play)
  void commandExecutor;

  // ============================================
  // UNDO SYSTEM
  // ============================================

  // Undo the last queued action
  function undoLastAction(): void {
    if (!turnState || turnState.pendingActions.length === 0) return;

    // Pop from both queues
    const lastCommand = commandQueue.pop();
    const lastAction = turnState.pendingActions.pop();
    turnState.actionsRemaining++;

    // If it was a move, clear the shadow preview and update cover preview
    if (lastAction?.type === "move" || lastCommand?.type === "move") {
      clearShadowPreview();
      shadowPosition = null;
      updateCoverPreview();  // Update in case cover depends on position
    }

    // If it was a cover action, clear the cover preview
    if (lastAction?.type === "ability" && lastAction.abilityName === "cover") {
      clearCoverPreview();
    }
    if (lastCommand?.type === "cover") {
      clearCoverPreview();
    }

    // Update intent indicators to reflect remaining actions
    updateIntentIndicators();

    updateCommandMenu();

    // Restore highlights based on current action mode
    if (selectedUnit && currentUnit) {
      const effectiveX = shadowPosition?.x ?? currentUnit.gridX;
      const effectiveZ = shadowPosition?.z ?? currentUnit.gridZ;

      switch (currentActionMode) {
        case "move":
          highlightValidActions(selectedUnit);
          break;
        case "attack":
          highlightAttackTargets(selectedUnit, effectiveX, effectiveZ);
          break;
        case "ability":
          highlightHealTargets(selectedUnit, effectiveX, effectiveZ);
          break;
        default:
          // No specific mode, just ensure active tile is highlighted
          clearHighlights();
          break;
      }
    }
  }

  // Click handling - infers action from what was clicked (no popup menu mode)
  scene.onPointerObservable.add((pointerInfo) => {
    if (gameOver) return;
    if (isAnimatingMovement || isExecutingActions) return;  // Block input during animations
    if (pointerInfo.type !== PointerEventTypes.POINTERPICK) return;

    const pickedMesh = pointerInfo.pickInfo?.pickedMesh;
    if (!pickedMesh) return;

    const metadata = pickedMesh.metadata;

    if (metadata?.type === "tile") {
      const { gridX, gridZ } = metadata;

      // Must have a selected unit to take actions
      if (!selectedUnit || !currentUnit || selectedUnit !== currentUnit) return;

      // Priority 1: Check if there's an attackable enemy on this tile
      const attackTarget = attackableUnits.find(u => u.gridX === gridX && u.gridZ === gridZ);
      if (attackTarget) {
        queueAttackAction(selectedUnit, attackTarget);
        return;
      }

      // Priority 2: Check if there's a healable ally on this tile
      const healTarget = healableUnits.find(u => u.gridX === gridX && u.gridZ === gridZ);
      if (healTarget && healTarget !== selectedUnit) {
        queueHealAction(selectedUnit, healTarget);
        return;
      }

      // Priority 3: Check if clicking unit's effective position (or shadow) for ability
      const effectiveX = shadowPosition?.x ?? selectedUnit.gridX;
      const effectiveZ = shadowPosition?.z ?? selectedUnit.gridZ;
      if (gridX === effectiveX && gridZ === effectiveZ) {
        // Clicking on self/shadow position - queue ability
        const classData = getClassData(selectedUnit.unitClass);
        // Only if ability is available (not already used this turn)
        if (classData.ability === "Heal" && selectedUnit.hp < selectedUnit.maxHp) {
          queueHealAction(selectedUnit, selectedUnit);
        } else if (classData.ability === "Conceal" && !selectedUnit.isConcealed) {
          queueConcealAction(selectedUnit);
        } else if (classData.ability === "Cover" && !selectedUnit.isCovering) {
          queueCoverAction(selectedUnit);
        }
        return;
      }

      // Priority 4: Check if it's a valid move tile
      if (isValidMove(gridX, gridZ)) {
        queueMoveAction(selectedUnit, gridX, gridZ);
        return;
      }

      // Clicked an invalid tile - do nothing (don't deselect in no-popup mode)
    } else if (metadata?.type === "unit") {
      const clickedUnit = units.find(u =>
        u.mesh === pickedMesh ||
        u.modelMeshes?.includes(pickedMesh as AbstractMesh)
      );
      if (!clickedUnit) return;

      // If clicking an attackable enemy
      if (selectedUnit && attackableUnits.includes(clickedUnit)) {
        queueAttackAction(selectedUnit, clickedUnit);
        return;
      }

      // If clicking a healable ally (not self)
      if (selectedUnit && healableUnits.includes(clickedUnit) && clickedUnit !== selectedUnit) {
        queueHealAction(selectedUnit, clickedUnit);
        return;
      }

      // If clicking self (current unit) - queue ability
      if (selectedUnit && clickedUnit === selectedUnit) {
        const classData = getClassData(selectedUnit.unitClass);
        // Only if ability is available
        if (classData.ability === "Heal" && selectedUnit.hp < selectedUnit.maxHp) {
          queueHealAction(selectedUnit, selectedUnit);
        } else if (classData.ability === "Conceal" && !selectedUnit.isConcealed) {
          queueConcealAction(selectedUnit);
        } else if (classData.ability === "Cover" && !selectedUnit.isCovering) {
          queueCoverAction(selectedUnit);
        }
        return;
      }

      // Try to select a different unit (if it's the current unit's turn)
      if (canSelectUnit(clickedUnit)) {
        selectedUnit = clickedUnit;
        highlightAllAvailableActions(clickedUnit);
      }
    }
  });

  // Turn indicator removed - all info now in command menu popup

  // ============================================
  // CAMERA MODE TOGGLE (touch devices only)
  // ============================================
  let cameraMode: "rotate" | "pan" = "rotate";

  // Custom panning state
  let isPanning = false;
  let lastPanX = 0;
  let lastPanY = 0;

  // Camera mode toggle container - top right, shows both icons
  const cameraModeContainer = new Rectangle("cameraModeContainer");
  cameraModeContainer.width = "90px";
  cameraModeContainer.height = "44px";
  cameraModeContainer.background = "#333333";
  cameraModeContainer.cornerRadius = 22;
  cameraModeContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
  cameraModeContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
  cameraModeContainer.left = "-15px";
  cameraModeContainer.top = "15px";
  cameraModeContainer.thickness = 2;
  cameraModeContainer.color = "#555555";
  cameraModeContainer.zIndex = 50;
  cameraModeContainer.isPointerBlocker = true;

  // Grid to hold both toggle options
  const toggleGrid = new Grid("toggleGrid");
  toggleGrid.addColumnDefinition(0.5);
  toggleGrid.addColumnDefinition(0.5);
  cameraModeContainer.addControl(toggleGrid);

  // Rotate button (left side)
  const rotateBtn = Button.CreateSimpleButton("rotateMode", "");
  rotateBtn.width = "40px";
  rotateBtn.height = "36px";
  rotateBtn.background = "#555555";
  rotateBtn.cornerRadius = 18;
  rotateBtn.thickness = 0;
  rotateBtn.isPointerBlocker = true;
  const rotateIcon = new TextBlock("rotateIcon", "⟳");
  rotateIcon.fontSize = 20;
  rotateIcon.color = "white";
  rotateIcon.top = "-1px";  // Nudge up to center visually
  rotateBtn.addControl(rotateIcon);
  toggleGrid.addControl(rotateBtn, 0, 0);

  // Pan button (right side)
  const panBtn = Button.CreateSimpleButton("panMode", "");
  panBtn.width = "40px";
  panBtn.height = "36px";
  panBtn.background = "transparent";
  panBtn.cornerRadius = 18;
  panBtn.thickness = 0;
  panBtn.isPointerBlocker = true;
  const panIcon = new TextBlock("panIcon", "✥");
  panIcon.fontSize = 18;
  panIcon.color = "#888888";
  panBtn.addControl(panIcon);
  toggleGrid.addControl(panBtn, 0, 1);

  function updateCameraModeButton(): void {
    if (cameraMode === "rotate") {
      // Highlight rotate button
      rotateBtn.background = "#555555";
      rotateIcon.color = "white";
      panBtn.background = "transparent";
      panIcon.color = "#888888";
      // Re-enable camera's built-in rotation controls
      camera.attachControl(true);
    } else {
      // Highlight pan button
      rotateBtn.background = "transparent";
      rotateIcon.color = "#888888";
      panBtn.background = "#664422";
      panIcon.color = "white";
      // Detach camera controls - we'll handle panning manually
      camera.detachControl();
    }
  }

  rotateBtn.onPointerUpObservable.add(() => {
    if (cameraMode !== "rotate") {
      cameraMode = "rotate";
      updateCameraModeButton();
    }
  });

  panBtn.onPointerUpObservable.add(() => {
    if (cameraMode !== "pan") {
      cameraMode = "pan";
      updateCameraModeButton();
    }
  });

  // Custom pan handling when in pan mode
  scene.onPointerObservable.add((pointerInfo) => {
    if (cameraMode !== "pan") return;

    switch (pointerInfo.type) {
      case PointerEventTypes.POINTERDOWN:
        isPanning = true;
        lastPanX = pointerInfo.event.clientX;
        lastPanY = pointerInfo.event.clientY;
        break;
      case PointerEventTypes.POINTERUP:
        isPanning = false;
        break;
      case PointerEventTypes.POINTERMOVE:
        if (isPanning) {
          const deltaX = pointerInfo.event.clientX - lastPanX;
          const deltaY = pointerInfo.event.clientY - lastPanY;
          lastPanX = pointerInfo.event.clientX;
          lastPanY = pointerInfo.event.clientY;

          // Calculate pan direction based on camera angle
          const panSpeed = 0.05;
          const cosAlpha = Math.cos(camera.alpha);
          const sinAlpha = Math.sin(camera.alpha);

          // Move camera target (panning) - drag direction matches movement
          camera.target.x += (deltaX * cosAlpha + deltaY * sinAlpha) * panSpeed;
          camera.target.z += (-deltaX * sinAlpha + deltaY * cosAlpha) * panSpeed;
        }
        break;
    }
  });

  // Pinch-to-zoom handling (works in both modes)
  let initialPinchDistance = 0;
  let initialRadius = camera.radius;

  const handleTouchStart = (e: TouchEvent) => {
    if (e.touches.length === 2) {
      // Two fingers down - start pinch
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      initialPinchDistance = Math.sqrt(dx * dx + dy * dy);
      initialRadius = camera.radius;
      isPanning = false; // Cancel any panning
    }
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (e.touches.length === 2 && initialPinchDistance > 0) {
      // Two fingers moving - zoom
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const currentDistance = Math.sqrt(dx * dx + dy * dy);

      const scale = initialPinchDistance / currentDistance;
      let newRadius = initialRadius * scale;

      // Clamp to camera limits
      newRadius = Math.max(camera.lowerRadiusLimit || 5, Math.min(camera.upperRadiusLimit || 50, newRadius));
      camera.radius = newRadius;

      e.preventDefault(); // Prevent page zoom
    }
  };

  const handleTouchEnd = (e: TouchEvent) => {
    if (e.touches.length < 2) {
      initialPinchDistance = 0;
    }
  };

  canvas.addEventListener("touchstart", handleTouchStart, { passive: false });
  canvas.addEventListener("touchmove", handleTouchMove, { passive: false });
  canvas.addEventListener("touchend", handleTouchEnd);

  // Clean up touch listeners on scene dispose
  scene.onDisposeObservable.add(() => {
    canvas.removeEventListener("touchstart", handleTouchStart);
    canvas.removeEventListener("touchmove", handleTouchMove);
    canvas.removeEventListener("touchend", handleTouchEnd);
  });

  // Show camera mode toggle on all devices (iPad Pro users need it too)
  gui.addControl(cameraModeContainer);
  updateCameraModeButton();

  // ============================================
  // TURN ORDER PREVIEW (Next Up indicator + modal)
  // ============================================

  // Function to predict turn order without modifying actual state
  function predictTurnOrder(count: number): Unit[] {
    const result: Unit[] = [];
    const aliveUnits = units.filter(u => u.hp > 0);
    if (aliveUnits.length === 0) return result;

    // During first round, use the queue
    if (isFirstRound && firstRoundQueue.length > 0) {
      // Return remaining units in first round queue
      for (let i = 0; i < Math.min(count, firstRoundQueue.length); i++) {
        if (firstRoundQueue[i].hp > 0) {
          result.push(firstRoundQueue[i]);
        }
      }
      return result;
    }

    // Clone accumulators for simulation
    const simAccumulators = new Map<Unit, number>();
    for (const unit of aliveUnits) {
      simAccumulators.set(unit, unit.accumulator);
    }

    // Track simulated "last acting team" for tie-breaking
    let simLastTeam: Team | null = lastActingTeam;

    for (let i = 0; i < count && aliveUnits.length > 0; i++) {
      const readyUnits: Unit[] = [];

      // Tick until someone is ready
      while (readyUnits.length === 0) {
        for (const unit of aliveUnits) {
          const acc = (simAccumulators.get(unit) || 0) + getEffectiveSpeed(unit);
          simAccumulators.set(unit, acc);
          if (acc >= ACCUMULATOR_THRESHOLD) {
            readyUnits.push(unit);
          }
        }
      }

      // Sort by tie-breakers
      readyUnits.sort((a, b) => {
        if (simLastTeam !== null) {
          if (a.team !== simLastTeam && b.team === simLastTeam) return -1;
          if (b.team !== simLastTeam && a.team === simLastTeam) return 1;
        }
        return a.loadoutIndex - b.loadoutIndex;
      });

      const nextUnit = readyUnits[0];
      result.push(nextUnit);
      simAccumulators.set(nextUnit, 0); // Reset after acting
      simLastTeam = nextUnit.team;
    }

    return result;
  }

  // Turn order button in top left - hamburger menu icon, opens modal
  const turnOrderBtn = Button.CreateSimpleButton("turnOrderBtn", "");
  turnOrderBtn.width = "44px";
  turnOrderBtn.height = "44px";
  turnOrderBtn.background = "rgba(40, 40, 50, 0.9)";
  turnOrderBtn.cornerRadius = 22;
  turnOrderBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
  turnOrderBtn.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
  turnOrderBtn.left = "15px";
  turnOrderBtn.top = "15px";
  turnOrderBtn.thickness = 2;
  turnOrderBtn.color = "white";
  turnOrderBtn.isPointerBlocker = true;
  turnOrderBtn.zIndex = 50;

  // Hamburger icon (3 horizontal lines) - positioned absolutely for precise control
  const lineSpacing = 6; // pixels between line centers
  const lineHeight = 2;
  const lineWidth = 18;

  for (let i = 0; i < 3; i++) {
    const line = new Rectangle(`hamburgerLine${i}`);
    line.width = `${lineWidth}px`;
    line.height = `${lineHeight}px`;
    line.background = "white";
    line.thickness = 0;
    line.isHitTestVisible = false;
    // Center the 3 lines: offsets are -6, 0, +6 from center
    line.top = `${(i - 1) * lineSpacing}px`;
    turnOrderBtn.addControl(line);
  }

  gui.addControl(turnOrderBtn);

  // Current unit status bar - top center, between hamburger and toggle
  // Same width calculation as queue panel below
  const statusBarWidth = Math.min(screenWidth - 160, 400);
  const currentUnitStatusBar = new Rectangle("currentUnitStatusBar");
  currentUnitStatusBar.width = `${statusBarWidth}px`;
  currentUnitStatusBar.height = "44px";
  currentUnitStatusBar.background = "rgba(20, 20, 30, 0.8)";
  currentUnitStatusBar.cornerRadius = 8;
  currentUnitStatusBar.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
  currentUnitStatusBar.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
  currentUnitStatusBar.top = "15px";
  currentUnitStatusBar.thickness = 0;
  currentUnitStatusBar.isVisible = false;
  gui.addControl(currentUnitStatusBar);

  // Status bar with two lines
  const statusStack = new StackPanel("statusStack");
  statusStack.isVertical = true;
  currentUnitStatusBar.addControl(statusStack);

  // Line 1: Symbol Class: Weapon
  const statusLine1 = new TextBlock("statusLine1");
  statusLine1.text = "";
  statusLine1.fontSize = 12;
  statusLine1.fontWeight = "bold";
  statusLine1.color = "white";
  statusLine1.height = "20px";
  statusStack.addControl(statusLine1);

  // Line 2: Boost | HP (HP in HP color)
  const statusLine2Stack = new StackPanel("statusLine2Stack");
  statusLine2Stack.isVertical = false;
  statusLine2Stack.height = "18px";
  statusLine2Stack.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
  statusStack.addControl(statusLine2Stack);

  const statusBoostText = new TextBlock("statusBoostText");
  statusBoostText.text = "";
  statusBoostText.fontSize = 11;
  statusBoostText.color = "white";
  statusBoostText.resizeToFit = true;
  statusLine2Stack.addControl(statusBoostText);

  const statusHpText = new TextBlock("statusHpText");
  statusHpText.text = "";
  statusHpText.fontSize = 11;
  statusHpText.color = HP_BAR_GREEN;
  statusHpText.resizeToFit = true;
  statusLine2Stack.addControl(statusHpText);

  function getHpColor(unit: Unit): string {
    const hpPercent = unit.hp / unit.maxHp;
    if (hpPercent < HP_LOW_THRESHOLD) return HP_BAR_RED;
    if (hpPercent < HP_MEDIUM_THRESHOLD) return HP_BAR_ORANGE;
    return HP_BAR_GREEN;
  }

  function updateCurrentUnitStatusBar(): void {
    if (!currentUnit) {
      currentUnitStatusBar.isVisible = false;
      return;
    }

    const designation = UNIT_DESIGNATIONS[currentUnit.loadoutIndex] || "?";
    const className = getClassData(currentUnit.unitClass).name;
    const weapon = currentUnit.customization?.combatStyle === "melee" ? "Melee" : "Ranged";
    const boostData = BOOST_INFO[currentUnit.boost] || BOOST_INFO[0];

    // Line 1: Symbol Class: Weapon in team color
    statusLine1.text = `${designation} ${className}: ${weapon}`;
    const r = Math.round(currentUnit.teamColor.r * 255).toString(16).padStart(2, '0');
    const g = Math.round(currentUnit.teamColor.g * 255).toString(16).padStart(2, '0');
    const b = Math.round(currentUnit.teamColor.b * 255).toString(16).padStart(2, '0');
    statusLine1.color = `#${r}${g}${b}`;

    // Line 2: Boost | HP
    statusBoostText.text = `${boostData.name} | `;
    statusHpText.text = `HP: ${currentUnit.hp}/${currentUnit.maxHp}`;
    statusHpText.color = getHpColor(currentUnit);

    currentUnitStatusBar.isVisible = true;
  }

  // Turn order modal
  const turnOrderBackdrop = new Rectangle("turnOrderBackdrop");
  turnOrderBackdrop.width = "100%";
  turnOrderBackdrop.height = "100%";
  turnOrderBackdrop.background = "rgba(0, 0, 0, 0.7)";
  turnOrderBackdrop.thickness = 0;
  turnOrderBackdrop.isVisible = false;
  turnOrderBackdrop.zIndex = 100;
  gui.addControl(turnOrderBackdrop);

  const turnOrderModal = new Rectangle("turnOrderModal");
  turnOrderModal.width = isTouch ? "280px" : "320px";
  turnOrderModal.height = "400px";
  turnOrderModal.background = "#0a0a0a";
  turnOrderModal.cornerRadius = 12;
  turnOrderModal.thickness = 2;
  turnOrderModal.color = "#333333";
  turnOrderModal.isVisible = false;
  turnOrderModal.zIndex = 101;
  gui.addControl(turnOrderModal);

  // Modal header
  const modalHeader = new Rectangle("modalHeader");
  modalHeader.width = "100%";
  modalHeader.height = "50px";
  modalHeader.background = "#151515";
  modalHeader.thickness = 0;
  modalHeader.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
  turnOrderModal.addControl(modalHeader);

  const modalTitle = new TextBlock("modalTitle");
  modalTitle.text = "Turn Order";
  modalTitle.color = "#ffffff";
  modalTitle.fontSize = 18;
  modalTitle.fontWeight = "bold";
  modalHeader.addControl(modalTitle);

  // Scrollable turn order list (drag to scroll, no visible scrollbar)
  const turnOrderScroll = new ScrollViewer("turnOrderScroll");
  turnOrderScroll.width = "100%";
  turnOrderScroll.height = "340px";
  turnOrderScroll.top = "50px";
  turnOrderScroll.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
  turnOrderScroll.thickness = 0;
  turnOrderScroll.barSize = 0;
  turnOrderScroll.barColor = "transparent";
  turnOrderModal.addControl(turnOrderScroll);

  const turnOrderStack = new StackPanel("turnOrderStack");
  turnOrderStack.width = "100%";
  turnOrderStack.paddingTop = "10px";
  turnOrderScroll.addControl(turnOrderStack);

  // No-op: turn order info is now only shown in modal (hamburger button)
  function updateNextUpIndicator(): void {
    // Hamburger button doesn't show dynamic text
  }

  function showTurnOrderModal(): void {
    // Populate turn order list
    turnOrderStack.clearControls();

    // Show current unit first
    if (currentUnit) {
      const currentRow = createTurnOrderRow(currentUnit, 0, true);
      turnOrderStack.addControl(currentRow);
    }

    // Predict next several turns
    const predicted = predictTurnOrder(12); // Show up to 12 upcoming turns
    for (let i = 0; i < predicted.length; i++) {
      const row = createTurnOrderRow(predicted[i], i + 1, false);
      turnOrderStack.addControl(row);
    }

    turnOrderBackdrop.isVisible = true;
    turnOrderModal.isVisible = true;
  }

  function hideTurnOrderModal(): void {
    turnOrderBackdrop.isVisible = false;
    turnOrderModal.isVisible = false;
  }

  function createTurnOrderRow(unit: Unit, index: number, isCurrent: boolean): Rectangle {
    const row = new Rectangle(`turnOrderRow${index}`);
    row.width = "100%";
    row.height = "58px";
    row.background = isCurrent ? "rgba(255, 200, 100, 0.15)" : "transparent";
    row.thickness = 0;
    row.paddingBottom = "4px";

    // Team color indicator
    const colorBar = new Rectangle(`colorBar${index}`);
    colorBar.width = "4px";
    colorBar.height = "50px";
    const r = Math.round(unit.teamColor.r * 255).toString(16).padStart(2, '0');
    const g = Math.round(unit.teamColor.g * 255).toString(16).padStart(2, '0');
    const b = Math.round(unit.teamColor.b * 255).toString(16).padStart(2, '0');
    const teamColorHex = `#${r}${g}${b}`;
    colorBar.background = teamColorHex;
    colorBar.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    colorBar.left = "5px";
    colorBar.thickness = 0;
    row.addControl(colorBar);

    // Unit name - team colored
    const designation = UNIT_DESIGNATIONS[unit.loadoutIndex] || "?";
    const className = getClassData(unit.unitClass).name;

    const nameText = new TextBlock(`nameText${index}`);
    nameText.text = `${designation} ${className}`;
    nameText.color = teamColorHex;
    nameText.fontSize = 14;
    nameText.fontWeight = isCurrent ? "bold" : "normal";
    nameText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    nameText.left = "20px";
    nameText.top = "-14px";
    row.addControl(nameText);

    // Speed text
    const speed = getEffectiveSpeed(unit).toFixed(1);
    const speedText = new TextBlock(`speedText${index}`);
    speedText.text = `Speed: ${speed}`;
    speedText.color = "#888888";
    speedText.fontSize = 11;
    speedText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    speedText.left = "20px";
    speedText.top = "2px";
    row.addControl(speedText);

    // Weapon + Boost text
    const weaponType = unit.customization?.combatStyle === "melee" ? "Melee" : "Ranged";
    const boostData = BOOST_INFO[unit.boost] || BOOST_INFO[0];
    const boostText = new TextBlock(`boostText${index}`);
    boostText.text = `${weaponType}, +25% ${boostData.stat}`;
    boostText.color = "#888888";
    boostText.fontSize = 11;
    boostText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    boostText.left = "20px";
    boostText.top = "16px";
    row.addControl(boostText);

    // Current indicator
    if (isCurrent) {
      const currentLabel = new TextBlock(`currentLabel${index}`);
      currentLabel.text = "NOW";
      currentLabel.color = "#ffcc66";
      currentLabel.fontSize = 10;
      currentLabel.fontWeight = "bold";
      currentLabel.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
      currentLabel.left = "-10px";
      row.addControl(currentLabel);
    }

    return row;
  }

  // Event handlers
  turnOrderBtn.onPointerUpObservable.add(() => {
    showTurnOrderModal();
  });

  // Click backdrop to close modal
  turnOrderBackdrop.onPointerClickObservable.add(() => {
    hideTurnOrderModal();
  });

  // ============================================
  // ACTION BUTTONS (Cancel & Execute)
  // ============================================

  // Cancel button - bottom left
  const cancelBtn = Button.CreateSimpleButton("cancelBtn", "✕");
  cancelBtn.width = "50px";
  cancelBtn.height = "50px";
  cancelBtn.background = "#3a2020";
  cancelBtn.color = "#ff6666";
  cancelBtn.cornerRadius = 25;
  cancelBtn.fontSize = 24;
  cancelBtn.fontWeight = "bold";
  cancelBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
  cancelBtn.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
  cancelBtn.left = "15px";
  cancelBtn.top = "-15px";
  cancelBtn.thickness = 2;
  cancelBtn.isVisible = false;
  cancelBtn.isPointerBlocker = true;
  cancelBtn.zIndex = 50;
  gui.addControl(cancelBtn);

  cancelBtn.onPointerUpObservable.add(() => {
    if (!currentUnit || !turnState) return;

    // Clear the command queue
    commandQueue.clear();
    turnState.pendingActions = [];
    turnState.actionsRemaining = ACTIONS_PER_TURN;

    // Remove shadow preview
    clearShadowPreview();
    shadowPosition = null;

    // Clear cover preview
    clearCoverPreview();

    // Clear intent indicators
    clearIntentIndicators();

    // Re-highlight available actions
    highlightAllAvailableActions(currentUnit);

    // Update action buttons (they should hide since queue is empty)
    updateActionButtons();
  });

  // Execute button - bottom right
  const executeBtn = Button.CreateSimpleButton("executeBtn", "✓");
  executeBtn.width = "50px";
  executeBtn.height = "50px";
  executeBtn.background = "#203a20";
  executeBtn.color = "#66ff66";
  executeBtn.cornerRadius = 25;
  executeBtn.fontSize = 24;
  executeBtn.fontWeight = "bold";
  executeBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
  executeBtn.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
  executeBtn.left = "-15px";
  executeBtn.top = "-15px";
  executeBtn.thickness = 2;
  executeBtn.isVisible = false;
  executeBtn.isPointerBlocker = true;
  executeBtn.zIndex = 50;
  gui.addControl(executeBtn);

  // Pulse animation state for execute button (only when all actions used - green state)
  let executePulseTime = 0;

  scene.onBeforeRenderObservable.add(() => {
    const allActionsUsed = turnState && turnState.actionsRemaining === 0;
    const shouldPulse = executeBtn.isVisible && allActionsUsed;

    if (shouldPulse) {
      executePulseTime += engine.getDeltaTime() / 1000;
      const pulse = 0.6 + 0.4 * Math.sin(executePulseTime * 4);
      executeBtn.background = `rgba(32, 80, 32, ${pulse})`;
      executeBtn.color = `rgba(102, 255, 102, ${0.7 + 0.3 * pulse})`;
    } else {
      executePulseTime = 0;
      // Don't override colors here - updateActionButtons handles that
    }
  });

  // Skip confirmation popup
  const skipConfirmBackdrop = new Rectangle("skipConfirmBackdrop");
  skipConfirmBackdrop.width = "100%";
  skipConfirmBackdrop.height = "100%";
  skipConfirmBackdrop.background = "rgba(0, 0, 0, 0.5)";
  skipConfirmBackdrop.thickness = 0;
  skipConfirmBackdrop.isVisible = false;
  skipConfirmBackdrop.zIndex = 100;
  gui.addControl(skipConfirmBackdrop);

  const skipConfirmPanel = new Rectangle("skipConfirmPanel");
  skipConfirmPanel.width = "280px";
  skipConfirmPanel.height = "120px";
  skipConfirmPanel.background = "#1a1a2a";
  skipConfirmPanel.cornerRadius = 12;
  skipConfirmPanel.thickness = 2;
  skipConfirmPanel.color = "#ffff66";
  skipConfirmPanel.zIndex = 101;
  gui.addControl(skipConfirmPanel);
  skipConfirmPanel.isVisible = false;

  const skipConfirmStack = new StackPanel("skipConfirmStack");
  skipConfirmStack.isVertical = true;
  skipConfirmPanel.addControl(skipConfirmStack);

  const skipConfirmText = new TextBlock("skipConfirmText");
  skipConfirmText.text = "Skip action for Speed Boost?";
  skipConfirmText.fontSize = 14;
  skipConfirmText.color = "white";
  skipConfirmText.height = "50px";
  skipConfirmText.textWrapping = true;
  skipConfirmStack.addControl(skipConfirmText);

  const skipConfirmBtnRow = new StackPanel("skipConfirmBtnRow");
  skipConfirmBtnRow.isVertical = false;
  skipConfirmBtnRow.height = "50px";
  skipConfirmStack.addControl(skipConfirmBtnRow);

  const skipConfirmNo = Button.CreateSimpleButton("skipConfirmNo", "Cancel");
  skipConfirmNo.width = "100px";
  skipConfirmNo.height = "36px";
  skipConfirmNo.background = "#2a2a2a";
  skipConfirmNo.color = "#aaaaaa";
  skipConfirmNo.cornerRadius = 8;
  skipConfirmNo.fontSize = 14;
  skipConfirmNo.paddingRight = "10px";
  skipConfirmBtnRow.addControl(skipConfirmNo);

  const skipConfirmYes = Button.CreateSimpleButton("skipConfirmYes", "Yes, Skip");
  skipConfirmYes.width = "100px";
  skipConfirmYes.height = "36px";
  skipConfirmYes.background = "#3a3a20";
  skipConfirmYes.color = "#ffff66";
  skipConfirmYes.cornerRadius = 8;
  skipConfirmYes.fontSize = 14;
  skipConfirmYes.paddingLeft = "10px";
  skipConfirmBtnRow.addControl(skipConfirmYes);

  function showSkipConfirm(): void {
    if (!turnState) return;
    const unusedActions = turnState.actionsRemaining;
    const speedBoost = unusedActions * SPEED_BONUS_PER_UNUSED_ACTION;
    const actionWord = unusedActions === 1 ? "action" : "actions";
    skipConfirmText.text = `Skip ${unusedActions} ${actionWord} for Speed Boost?\n(+${speedBoost.toFixed(2)})`;
    skipConfirmBackdrop.isVisible = true;
    skipConfirmPanel.isVisible = true;
  }

  function hideSkipConfirm(): void {
    skipConfirmBackdrop.isVisible = false;
    skipConfirmPanel.isVisible = false;
  }

  skipConfirmYes.onPointerClickObservable.add(() => {
    hideSkipConfirm();
    executeQueuedActions();
  });

  skipConfirmNo.onPointerClickObservable.add(() => {
    hideSkipConfirm();
  });

  skipConfirmBackdrop.onPointerClickObservable.add(() => {
    hideSkipConfirm();
  });

  executeBtn.onPointerUpObservable.add(() => {
    if (!currentUnit || !turnState) return;

    // If there are unused actions, show confirmation popup
    if (turnState.actionsRemaining > 0) {
      showSkipConfirm();
    } else {
      // All actions used, just execute
      executeQueuedActions();
    }
  });

  // Update action button visibility and style
  function updateActionButtons(): void {
    const hasQueuedActions = !!(turnState && turnState.pendingActions.length > 0);
    const isHumanTurn = !!(currentUnit && !controllerManager.isAI(currentUnit.team));
    const allActionsUsed = turnState && turnState.actionsRemaining === 0;

    cancelBtn.isVisible = isHumanTurn && hasQueuedActions;
    executeBtn.isVisible = isHumanTurn; // Always show during human turn
    queuedActionsPanel.isVisible = isHumanTurn && hasQueuedActions;

    // Update execute button appearance:
    // - Green checkmark when all actions are used (ready to execute)
    // - Yellow skip when actions remain (will show confirmation)
    if (executeBtn.textBlock) {
      if (allActionsUsed) {
        // Green checkmark - all actions used, ready to execute
        executeBtn.textBlock.text = "✓";
        executeBtn.background = "#203a20";
        executeBtn.color = "#66ff66";
      } else {
        // Yellow skip - has unused actions
        executeBtn.textBlock.text = "⏭";
        executeBtn.background = "#3a3a20";
        executeBtn.color = "#ffff66";
      }
    }

    updateQueuedActionsDisplay();
  }

  // ============================================
  // ACTION COUNTER (Next to designation symbol)
  // ============================================

  const actionCounterText = new TextBlock("actionCounterText");
  actionCounterText.text = "2/2";
  actionCounterText.fontSize = 12;
  actionCounterText.fontWeight = "bold";
  actionCounterText.color = "#66ff66";
  actionCounterText.outlineWidth = 2;
  actionCounterText.outlineColor = "black";
  actionCounterText.isVisible = false;
  gui.addControl(actionCounterText);

  function updateActionCounter(): void {
    if (!currentUnit || !turnState || controllerManager.isAI(currentUnit.team)) {
      actionCounterText.isVisible = false;
      return;
    }

    const remaining = turnState.actionsRemaining;
    actionCounterText.text = `${remaining}/${ACTIONS_PER_TURN}`;

    // Color based on remaining actions
    if (remaining >= 2) {
      actionCounterText.color = "#66ff66"; // Green
    } else if (remaining === 1) {
      actionCounterText.color = "#ffff66"; // Yellow
    } else {
      actionCounterText.color = "#ff6666"; // Red
    }

    // Position next to designation symbol (to the right of it)
    const effectiveX = shadowPosition?.x ?? currentUnit.gridX;
    const effectiveZ = shadowPosition?.z ?? currentUnit.gridZ;
    const gridOffset = (GRID_SIZE * TILE_SIZE) / 2 - TILE_SIZE / 2;

    // Convert world position to screen coordinates
    const worldPos = new Vector3(
      effectiveX * TILE_SIZE - gridOffset,
      HP_BAR_ANCHOR_HEIGHT,
      effectiveZ * TILE_SIZE - gridOffset
    );
    const screenPos = Vector3.Project(
      worldPos,
      Matrix.Identity(),
      scene.getTransformMatrix(),
      camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight())
    );

    // Position next to designation: offset X to the right by ~20px, same Y as designation (-32 offset)
    actionCounterText.left = `${screenPos.x - engine.getRenderWidth() / 2 + 18}px`;
    actionCounterText.top = `${screenPos.y - engine.getRenderHeight() / 2 - 32}px`;
    actionCounterText.isVisible = true;
  }

  // Update action counter position each frame
  scene.onBeforeRenderObservable.add(() => {
    updateActionCounter();
  });

  // ============================================
  // QUEUED ACTIONS DISPLAY (Bottom Center)
  // ============================================

  // Queue panel sits between cancel (left) and execute (right) buttons
  // Buttons are 50px wide with 15px margin = 65px, add 10px gap = 75px clear on each side
  const queuePanelWidth = Math.min(screenWidth - 160, 400); // Leave 80px each side, cap at 400px
  const queuedActionsPanel = new Rectangle("queuedActionsPanel");
  queuedActionsPanel.height = "50px";
  queuedActionsPanel.adaptHeightToChildren = true;
  queuedActionsPanel.background = "rgba(20, 20, 30, 0.8)";
  queuedActionsPanel.cornerRadius = 8;
  queuedActionsPanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
  queuedActionsPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
  queuedActionsPanel.top = "-15px";
  queuedActionsPanel.thickness = 0;
  queuedActionsPanel.width = `${queuePanelWidth}px`;
  queuedActionsPanel.paddingLeft = "10px";
  queuedActionsPanel.paddingRight = "10px";
  queuedActionsPanel.isVisible = false;

  const queuedActionsStack = new StackPanel("queuedActionsStack");
  queuedActionsStack.isVertical = true;
  queuedActionsStack.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
  queuedActionsPanel.addControl(queuedActionsStack);

  gui.addControl(queuedActionsPanel);

  function updateQueuedActionsDisplay(): void {
    queuedActionsStack.clearControls();

    if (!currentUnit || !turnState || turnState.pendingActions.length === 0) {
      return;
    }

    for (const action of turnState.pendingActions) {
      const actionLine = new TextBlock();
      actionLine.fontSize = 12;
      actionLine.height = "18px";
      actionLine.resizeToFit = true;

      if (action.type === "move") {
        actionLine.text = `Move to (${action.targetX}, ${action.targetZ})`;
        actionLine.color = "#88ccff"; // Blue for move
      } else if (action.type === "attack" && action.targetUnit) {
        const target = action.targetUnit;
        const targetDesignation = UNIT_DESIGNATIONS[target.loadoutIndex] || "?";
        const targetClass = getClassData(target.unitClass).name;
        const damage = currentUnit.attack;
        const newHp = Math.max(0, target.hp - damage);
        actionLine.text = `${targetDesignation} ${targetClass} HP ${target.hp} → ${newHp}`;
        actionLine.color = "#ff6666"; // Red for attack
      } else if (action.type === "ability" && action.abilityName === "heal" && action.targetUnit) {
        const target = action.targetUnit;
        const targetDesignation = UNIT_DESIGNATIONS[target.loadoutIndex] || "?";
        const targetClass = getClassData(target.unitClass).name;
        const healAmt = currentUnit.healAmount;
        const newHp = Math.min(target.maxHp, target.hp + healAmt);
        const name = target === currentUnit ? "Self" : `${targetDesignation} ${targetClass}`;
        actionLine.text = `${name} HP ${target.hp} → ${newHp}`;
        actionLine.color = "#66ff66"; // Green for heal
      } else if (action.type === "ability" && action.abilityName === "conceal") {
        actionLine.text = "Conceal";
        actionLine.color = "#ffff66"; // Yellow for ability
      } else if (action.type === "ability" && action.abilityName === "cover") {
        actionLine.text = "Cover";
        actionLine.color = "#ffff66"; // Yellow for ability
      }

      queuedActionsStack.addControl(actionLine);
    }
  }

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

  const menuExecuteBtn = Button.CreateSimpleButton("menuExecuteBtn", "Execute");
  menuExecuteBtn.width = "95%";
  menuExecuteBtn.height = "28px";
  menuExecuteBtn.color = "white";
  menuExecuteBtn.background = "#338833";
  menuExecuteBtn.cornerRadius = 5;
  menuExecuteBtn.fontSize = 12;
  menuExecuteBtn.onPointerClickObservable.add(() => {
    if (currentUnit && !isExecutingActions) {
      executeQueuedActions();
    }
  });
  bottomButtonsGrid.addControl(menuExecuteBtn, 0, 1);

  // Pulse the menu execute button when actions are queued
  let menuExecutePulseTime = 0;
  scene.onBeforeRenderObservable.add(() => {
    const shouldPulse = turnState && turnState.pendingActions.length > 0 && turnState.actionsRemaining === 0;
    if (shouldPulse) {
      menuExecutePulseTime += engine.getDeltaTime() / 1000;
      const pulse = 0.7 + 0.3 * Math.sin(menuExecutePulseTime * 4);
      const g = Math.round(0x88 * pulse);
      const gHex = g.toString(16).padStart(2, '0');
      menuExecuteBtn.background = `#33${gHex}33`;
    } else {
      menuExecutePulseTime = 0;
      menuExecuteBtn.background = "#338833";
    }
  });

  // Function to update menu for current unit
  // Note: Command menu is now hidden - using simplified action buttons instead
  function updateCommandMenu(): void {
    // Always hide command menu - we use the new mobile UI
    commandMenu.isVisible = false;

    if (!currentUnit) {
      return;
    }

    // Hide menu for AI-controlled units
    if (controllerManager.isAI(currentUnit.team)) {
      return;
    }

    // Keep the rest of the function for updating internal state (but menu stays hidden)

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

    // Update unit header: designation + class + speed
    const classData = getClassData(currentUnit.unitClass);
    const designation = UNIT_DESIGNATIONS[currentUnit.loadoutIndex] || "?";
    const speed = getEffectiveSpeed(currentUnit).toFixed(1);
    menuUnitName.text = `${designation} ${classData.name}, Speed ${speed}`;

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

  // Register turn start callback
  onTurnStartCallback = () => {
    updateNextUpIndicator();
    updateActionButtons();
    updateCurrentUnitStatusBar();

    // Auto-select the current unit and show all available actions
    if (currentUnit && !controllerManager.isAI(currentUnit.team)) {
      selectedUnit = currentUnit;
      highlightAllAvailableActions(currentUnit);
    }

    // Hide command menu - using simplified action buttons instead
    commandMenu.isVisible = false;
  };

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
  customization?: UnitCustomization,
  boost?: number
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

  // Unit designation (Greek symbol) under HP bar in team color
  const designation = UNIT_DESIGNATIONS[loadoutIndex] || "?";
  const designationText = new TextBlock(`designation_${team}_${loadoutIndex}`);
  designationText.text = designation;
  designationText.fontSize = 14;
  designationText.fontWeight = "bold";
  // Convert teamColor to hex
  const tr = Math.round(teamColor.r * 255).toString(16).padStart(2, '0');
  const tg = Math.round(teamColor.g * 255).toString(16).padStart(2, '0');
  const tb = Math.round(teamColor.b * 255).toString(16).padStart(2, '0');
  designationText.color = `#${tr}${tg}${tb}`;
  designationText.outlineWidth = 2;
  designationText.outlineColor = "black";
  designationText.isVisible = false; // Hide until model is ready
  gui.addControl(designationText);
  designationText.linkWithMesh(hpBarAnchor);
  designationText.linkOffsetY = -32; // Below the HP bar

  const originalColor = teamColor.clone();

  // Apply boost multipliers based on boost index
  // boost 0 = HP, boost 1 = Damage, boost 2 = Speed
  const boostIndex = boost ?? 0;
  const hpMultiplier = boostIndex === 0 ? 1 + BOOST_MULTIPLIER : 1;
  const attackMultiplier = boostIndex === 1 ? 1 + BOOST_MULTIPLIER : 1;
  const speedMultiplier = boostIndex === 2 ? 1 + BOOST_MULTIPLIER : 1;

  const boostedHp = Math.round(classData.hp * hpMultiplier);
  const boostedAttack = Math.round(classData.attack * attackMultiplier);
  const boostedSpeed = 1 * speedMultiplier;

  return {
    mesh: hpBarAnchor,  // Use anchor as the main "mesh" for positioning
    unitClass,
    team,
    gridX,
    gridZ,
    moveRange: classData.moveRange,
    attackRange: classData.attackRange,
    hp: boostedHp,
    maxHp: boostedHp,
    attack: boostedAttack,
    healAmount: classData.healAmount,
    hpBar,
    hpBarBg,
    designationLabel: designationText,
    originalColor,
    hasMoved: false,
    hasAttacked: false,
    speed: boostedSpeed,
    speedBonus: 0,
    accumulator: 0,
    loadoutIndex,
    boost: boost ?? 0,
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
