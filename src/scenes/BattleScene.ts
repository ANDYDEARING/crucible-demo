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
  AnimationGroup,
  PBRMaterial,
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF";
import { AdvancedDynamicTexture, TextBlock, Button, Rectangle, StackPanel, Grid, Control } from "@babylonjs/gui";
import type { Loadout, UnitType, UnitSelection, SupportCustomization } from "../types";

// Color palettes (same as LoadoutScene)
const SKIN_TONES = [
  "#FFDFC4", "#E8C0A0", "#D0A080", "#B08060", "#906040",
  "#704828", "#503418", "#352210", "#1E1208", "#0A0604",
];
const HAIR_COLORS = [
  "#0A0A0A", "#4A3728", "#E5C8A8", "#B55239", "#C0C0C0",
  "#FF2222", "#FF66AA", "#9933FF", "#22CC44", "#2288FF",
];
const EYE_COLORS = [
  "#2288FF", "#22AA44", "#634E34", "#DD2222",
  "#9933FF", "#FFFFFF", "#0A0A0A", "#FF8800",
];

// Helper to convert hex color to Color3
function hexToColor3(hex: string): Color3 {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return new Color3(r, g, b);
}

const GRID_SIZE = 8;
const TILE_SIZE = 1;
const TILE_GAP = 0.05;

const UNIT_STATS = {
  tank: { hp: 100, attack: 15, moveRange: 2, attackRange: 1, healAmount: 0 },
  damage: { hp: 50, attack: 30, moveRange: 4, attackRange: 2, healAmount: 0 },
  support: { hp: 60, attack: 10, moveRange: 3, attackRange: 3, healAmount: 25 },
};

type Team = "player1" | "player2";
type ActionMode = "none" | "move" | "attack" | "ability";

// Pending action for preview system
interface PendingAction {
  type: "move" | "attack" | "ability";
  targetX?: number;
  targetZ?: number;
  targetUnit?: Unit;
  abilityName?: string;
}

// Turn state for preview/undo system
interface TurnState {
  unit: Unit;
  actionsRemaining: number;
  pendingActions: PendingAction[];
  originalPosition: { x: number; z: number };
  originalFacing: number;
}

// Facing configuration for a unit's model
interface FacingConfig {
  currentAngle: number;      // Current facing angle in radians
  baseOffset: number;        // Model's base rotation offset (model-specific)
  isFlipped: boolean;        // Whether model has negative X scale (right-handed)
}

interface Unit {
  mesh: Mesh;
  type: "tank" | "damage" | "support";
  team: Team;
  gridX: number;
  gridZ: number;
  moveRange: number;
  attackRange: number;
  hp: number;
  maxHp: number;
  attack: number;
  healAmount: number;
  hpBar?: Rectangle;
  hpBarBg?: Rectangle;
  originalColor: Color3;
  // Action tracking (legacy - will migrate to TurnState)
  hasMoved: boolean;
  hasAttacked: boolean;
  // Initiative system
  speed: number;
  speedBonus: number;  // Bonus from skipping, consumed after next turn
  accumulator: number; // Builds up until >= 10, then unit acts
  loadoutIndex: number; // Original position in loadout for tie-breaking
  // 3D model data
  modelRoot?: AbstractMesh;
  modelMeshes?: AbstractMesh[];
  animationGroups?: AnimationGroup[];
  customization?: SupportCustomization;
  teamColor: Color3;
  // Facing system
  facing: FacingConfig;
  // Ability states
  isConcealed: boolean;
  isCovering: boolean;
}

export function createBattleScene(engine: Engine, _canvas: HTMLCanvasElement, loadout: Loadout | null): Scene {
  const scene = new Scene(engine);
  scene.clearColor.set(0.1, 0.1, 0.15, 1);

  // Battle music - Placeholder
  const music = new Audio("/audio/battle_v2.m4a");
  music.loop = true;
  music.volume = 0.5;
  music.addEventListener("timeupdate", () => {
    if (music.duration && music.currentTime >= music.duration - 0.5) {
      music.currentTime = 0;
    }
  });
  music.play();

  scene.onDisposeObservable.add(() => {
    music.pause();
    music.src = "";
  });

  // Sound effects
  const sfx = {
    hitLight: new Audio("/audio/effects/hit-light.flac"),
    hitMedium: new Audio("/audio/effects/hit-medium.flac"),
    hitHeavy: new Audio("/audio/effects/hit-heavy.flac"),
    heal: new Audio("/audio/effects/Cure1.wav"),
  };
  // Set volume for sound effects
  Object.values(sfx).forEach(sound => sound.volume = 0.6);

  function playSfx(sound: HTMLAudioElement): void {
    sound.currentTime = 0;
    sound.play();
  }

  const camera = new ArcRotateCamera(
    "camera",
    Math.PI / 4,
    Math.PI / 3,
    12,
    new Vector3(0, 0, 0),
    scene
  );
  camera.attachControl(true);
  camera.lowerBetaLimit = 0.3;
  camera.upperBetaLimit = Math.PI / 2.2;
  camera.lowerRadiusLimit = 8;
  camera.upperRadiusLimit = 20;

  new HemisphericLight("ambientLight", new Vector3(0, 1, 0), scene);
  const dirLight = new DirectionalLight("dirLight", new Vector3(-1, -2, -1), scene);
  dirLight.intensity = 0.5;

  // Tile materials
  const tileMaterialLight = new StandardMaterial("tileLightMat", scene);
  tileMaterialLight.diffuseColor = new Color3(0.18, 0.22, 0.17);

  const tileMaterialDark = new StandardMaterial("tileDarkMat", scene);
  tileMaterialDark.diffuseColor = new Color3(0.12, 0.15, 0.11);

  const selectedMaterial = new StandardMaterial("selectedMat", scene);
  selectedMaterial.diffuseColor = new Color3(0.8, 0.8, 0.2);

  const validMoveMaterial = new StandardMaterial("validMoveMat", scene);
  validMoveMaterial.diffuseColor = new Color3(0.3, 0.6, 0.9);

  const attackableMaterial = new StandardMaterial("attackableMat", scene);
  attackableMaterial.diffuseColor = new Color3(0.9, 0.3, 0.3);

  const healableMaterial = new StandardMaterial("healableMat", scene);
  healableMaterial.diffuseColor = new Color3(0.3, 0.9, 0.5);

  const unitMaterials = {
    tank: createUnitMaterial("tank", new Color3(0.3, 0.3, 0.8), scene),
    damage: createUnitMaterial("damage", new Color3(0.8, 0.2, 0.2), scene),
    support: createUnitMaterial("support", new Color3(0.2, 0.8, 0.3), scene),
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
      console.warn(`No animation groups for ${unit.type}`);
      if (onComplete) onComplete();
      return;
    }

    // Stop all current animations
    unit.animationGroups.forEach(ag => ag.stop());

    // Find and play the requested animation
    const anim = unit.animationGroups.find(ag => ag.name === animName);
    if (anim) {
      console.log(`Playing animation "${animName}" for ${unit.team} ${unit.type}`);
      anim.start(loop);
      if (onComplete && !loop) {
        anim.onAnimationEndObservable.addOnce(() => {
          console.log(`Animation "${animName}" completed for ${unit.team} ${unit.type}`);
          onComplete();
        });
      }
    } else {
      // Animation not found - call onComplete immediately so game doesn't hang
      console.warn(`Animation "${animName}" not found for ${unit.type}. Available: ${unit.animationGroups.map(ag => ag.name).join(", ")}`);
      if (onComplete) onComplete();
    }
  }

  function playIdleAnimation(unit: Unit): void {
    const isMelee = unit.customization?.combatStyle === "melee";
    playAnimation(unit, isMelee ? "Idle_Sword" : "Idle_Gun", true);
  }

  // ============================================
  // FACING SYSTEM (Encapsulated)
  // ============================================
  //
  // Each unit has a FacingConfig that stores:
  // - currentAngle: the world-space angle the unit should face
  // - baseOffset: rotation offset for the model's default orientation
  // - isFlipped: whether the model has negative X scale (right-handed)
  //
  // Key functions:
  // - initFacing(unit): Initialize facing config based on customization
  // - faceTarget(unit, x, z): Face a specific grid position
  // - faceClosestEnemy(unit): Face the nearest enemy
  // - applyFacing(unit): Apply the current facing angle to the model
  //
  // TESTING JIG: Press 'f' to log current facing debug info
  // ============================================

  // Rotation offsets determined empirically for each model configuration
  const FACING_OFFSET_NORMAL = 0;           // Non-flipped models (left-handed)
  const FACING_OFFSET_FLIPPED = 0;          // Flipped models (right-handed) - just negate angle

  // Testing jig state
  let isInitialSetup = true;  // Skip debug during spawn
  let facingDebugHighlight: Mesh | null = null;
  let lastFacingDebugInfo: {
    unit: Unit;
    unitPos: { x: number; z: number };
    targetPos: { x: number; z: number };
    handedness: string;
  } | null = null;

  // Create/update the yellow highlight for facing target
  function updateFacingDebugHighlight(targetX: number, targetZ: number): void {
    if (isInitialSetup) return;  // Skip during initial spawn

    // Remove old highlight
    if (facingDebugHighlight) {
      facingDebugHighlight.dispose();
    }

    // Create yellow highlight on target tile
    facingDebugHighlight = MeshBuilder.CreateBox(
      "facingDebugHighlight",
      { width: TILE_SIZE - TILE_GAP + 0.1, height: 0.15, depth: TILE_SIZE - TILE_GAP + 0.1 },
      scene
    );
    const highlightMat = new StandardMaterial("facingHighlightMat", scene);
    highlightMat.diffuseColor = new Color3(1, 1, 0);  // Yellow
    highlightMat.emissiveColor = new Color3(0.5, 0.5, 0);
    highlightMat.alpha = 0.6;
    facingDebugHighlight.material = highlightMat;
    facingDebugHighlight.position = new Vector3(
      targetX * TILE_SIZE - gridOffset,
      0.08,
      targetZ * TILE_SIZE - gridOffset
    );
  }

  // Keyboard listener for facing debug
  window.addEventListener("keydown", (e) => {
    if (e.key === "f" || e.key === "F") {
      if (lastFacingDebugInfo) {
        const info = lastFacingDebugInfo;
        console.log(`[FACING DEBUG] Unit: ${info.unit.team} ${info.unit.type}`);
        console.log(`[FACING DEBUG] Handedness: ${info.handedness} (isFlipped: ${info.unit.facing.isFlipped})`);
        console.log(`[FACING DEBUG] Unit position: (${info.unitPos.x}, ${info.unitPos.z})`);
        console.log(`[FACING DEBUG] Target position (yellow tile): (${info.targetPos.x.toFixed(1)}, ${info.targetPos.z.toFixed(1)})`);
        console.log(`[FACING DEBUG] Current angle: ${info.unit.facing.currentAngle.toFixed(3)} rad (${(info.unit.facing.currentAngle * 180 / Math.PI).toFixed(1)} deg)`);
        console.log(`[FACING DEBUG] Base offset: ${info.unit.facing.baseOffset.toFixed(3)} rad`);
        if (info.unit.modelRoot) {
          console.log(`[FACING DEBUG] Applied rotation.y: ${info.unit.modelRoot.rotation.y.toFixed(3)} rad`);
        }
      } else {
        console.log(`[FACING DEBUG] No facing data yet. Move a unit first.`);
      }
    }
  });

  // Initialize facing config for a unit
  function initFacing(unit: Unit): void {
    const isFlipped = unit.customization?.handedness === "right";
    unit.facing = {
      currentAngle: 0,
      baseOffset: isFlipped ? FACING_OFFSET_FLIPPED : FACING_OFFSET_NORMAL,
      isFlipped: isFlipped
    };
  }

  // Apply the current facing angle to the unit's model
  function applyFacing(unit: Unit): void {
    if (!unit.modelRoot) return;

    // Clear quaternion (GLTF uses quaternions which override Euler)
    unit.modelRoot.rotationQuaternion = null;

    // Calculate final rotation: same formula for both flipped and non-flipped
    // The X scale flip handles mirroring internally
    const finalRotation = unit.facing.currentAngle + unit.facing.baseOffset;

    unit.modelRoot.rotation.y = finalRotation;
  }

  // Face a specific grid position
  function faceTarget(unit: Unit, targetX: number, targetZ: number): void {
    const dx = targetX - unit.gridX;
    const dz = targetZ - unit.gridZ;

    if (dx === 0 && dz === 0) return;

    // Calculate angle from +Z axis (0 = facing +Z, positive = clockwise)
    unit.facing.currentAngle = Math.atan2(dx, dz);

    applyFacing(unit);

    // Update debug info and highlight (skip during initial setup)
    if (!isInitialSetup) {
      lastFacingDebugInfo = {
        unit,
        unitPos: { x: unit.gridX, z: unit.gridZ },
        targetPos: { x: targetX, z: targetZ },
        handedness: unit.customization?.handedness ?? "left"
      };
      updateFacingDebugHighlight(targetX, targetZ);
    }
  }

  // Face the closest living enemy
  function faceClosestEnemy(unit: Unit): void {
    const enemies = units.filter(u => u.team !== unit.team && u.hp > 0);
    if (enemies.length === 0) return;

    // Find closest by Manhattan distance
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

  // Mark initial setup as complete (call after spawning)
  function enableFacingDebug(): void {
    isInitialSetup = false;
  }

  // Legacy alias for compatibility
  function setUnitFacing(unit: Unit, targetX: number, targetZ: number): void {
    faceTarget(unit, targetX, targetZ);
  }

  // ============================================
  // LINE OF SIGHT SYSTEM
  // ============================================

  function hasLineOfSight(fromX: number, fromZ: number, toX: number, toZ: number, excludeUnit?: Unit): boolean {
    // Bresenham's line algorithm to check tiles between from and to
    // Returns false if any occupied tile (other than start/end) blocks the line
    // excludeUnit: optionally exclude a specific unit from blocking (usually the shooter)

    const dx = Math.abs(toX - fromX);
    const dz = Math.abs(toZ - fromZ);
    const sx = fromX < toX ? 1 : -1;
    const sz = fromZ < toZ ? 1 : -1;
    let err = dx - dz;

    let x = fromX;
    let z = fromZ;

    while (x !== toX || z !== toZ) {
      const e2 = 2 * err;

      if (e2 > -dz) {
        err -= dz;
        x += sx;
      }
      if (e2 < dx) {
        err += dx;
        z += sz;
      }

      // Skip checking the destination tile
      if (x === toX && z === toZ) break;

      // Check if this tile is occupied (blocking LOS), excluding the specified unit
      const occupant = units.find(u => u.gridX === x && u.gridZ === z && u.hp > 0 && u !== excludeUnit);
      if (occupant) {
        return false;
      }
    }

    return true;
  }

  function getTilesInLOS(fromX: number, fromZ: number, excludeAdjacent: boolean, excludeUnit?: Unit): { x: number; z: number }[] {
    const result: { x: number; z: number }[] = [];

    for (let x = 0; x < GRID_SIZE; x++) {
      for (let z = 0; z < GRID_SIZE; z++) {
        if (x === fromX && z === fromZ) continue;

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

  function getAdjacentOrdinalTiles(x: number, z: number): { x: number; z: number }[] {
    // Only N, S, E, W - not diagonals
    const adjacent: { x: number; z: number }[] = [];
    const directions = [
      { dx: 0, dz: 1 },   // North
      { dx: 0, dz: -1 },  // South
      { dx: 1, dz: 0 },   // East
      { dx: -1, dz: 0 },  // West
    ];

    for (const dir of directions) {
      const nx = x + dir.dx;
      const nz = z + dir.dz;
      if (nx >= 0 && nx < GRID_SIZE && nz >= 0 && nz < GRID_SIZE) {
        adjacent.push({ x: nx, z: nz });
      }
    }

    return adjacent;
  }

  function getValidAttackTiles(unit: Unit, fromX?: number, fromZ?: number): { x: number; z: number; hasLOS: boolean }[] {
    const x = fromX ?? unit.gridX;
    const z = fromZ ?? unit.gridZ;
    const isMelee = unit.customization?.combatStyle === "melee";

    if (isMelee) {
      // Sword: adjacent ordinal only
      return getAdjacentOrdinalTiles(x, z).map(tile => ({
        ...tile,
        hasLOS: true  // Always has LOS for adjacent
      }));
    } else {
      // Gun: LOS but not adjacent
      const losResult: { x: number; z: number; hasLOS: boolean }[] = [];

      for (let tx = 0; tx < GRID_SIZE; tx++) {
        for (let tz = 0; tz < GRID_SIZE; tz++) {
          if (tx === x && tz === z) continue;

          const distance = Math.abs(tx - x) + Math.abs(tz - z);
          if (distance === 1) continue;  // Skip adjacent

          // Exclude the shooter from blocking their own LOS
          const hasLOS = hasLineOfSight(x, z, tx, tz, unit);
          losResult.push({ x: tx, z: tz, hasLOS });
        }
      }

      return losResult;
    }
  }

  // LOS-blocked material (gray for blocked targets)
  const blockedMaterial = new StandardMaterial("blockedMat", scene);
  blockedMaterial.diffuseColor = new Color3(0.4, 0.4, 0.4);

  // Export references for future use (prevents unused warnings)
  const _helpers = { getTilesInLOS, getValidAttackTiles, createShadowPreview, clearShadowPreview, shadowPosition: () => shadowPosition, highlightAttackTargets, getAttackableEnemiesWithLOS, showAttackPreview, clearAttackPreview, highlightHealTargets, toggleConceal, toggleCover, clearCoverVisualization };
  void _helpers;

  // ============================================
  // ANIMATED MOVEMENT
  // ============================================

  let isAnimatingMovement = false;

  function animateMovement(unit: Unit, targetX: number, targetZ: number, onComplete?: () => void): void {
    console.log(`[FACING] animateMovement: ${unit.team} ${unit.type} from (${unit.gridX},${unit.gridZ}) to (${targetX},${targetZ})`);
    if (!unit.modelRoot) {
      // Fallback to instant movement if no model
      moveUnit(unit, targetX, targetZ, gridOffset);
      onComplete?.();
      return;
    }

    isAnimatingMovement = true;

    // First, face the target (BEFORE updating gridX/gridZ)
    console.log(`[FACING] Setting facing before move...`);
    setUnitFacing(unit, targetX, targetZ);

    // Calculate world positions
    const startX = unit.gridX * TILE_SIZE - gridOffset;
    const startZ = unit.gridZ * TILE_SIZE - gridOffset;
    const endX = targetX * TILE_SIZE - gridOffset;
    const endZ = targetZ * TILE_SIZE - gridOffset;

    // Update grid position immediately (for game logic)
    console.log(`[FACING] Updating grid position from (${unit.gridX},${unit.gridZ}) to (${targetX},${targetZ})`);
    unit.gridX = targetX;
    unit.gridZ = targetZ;

    // Play run animation
    playAnimation(unit, "Run", true);

    // Animate over time
    const duration = 0.8;  // seconds (doubled for better visibility)
    let elapsed = 0;

    const moveObserver = scene.onBeforeRenderObservable.add(() => {
      elapsed += engine.getDeltaTime() / 1000;
      const t = Math.min(elapsed / duration, 1);

      // Smooth interpolation
      const easeT = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

      const currentX = startX + (endX - startX) * easeT;
      const currentZ = startZ + (endZ - startZ) * easeT;

      // Update all mesh positions
      unit.modelRoot!.position.x = currentX;
      unit.modelRoot!.position.z = currentZ;
      unit.mesh.position.x = currentX;
      unit.mesh.position.z = currentZ;

      if (t >= 1) {
        // Animation complete
        scene.onBeforeRenderObservable.remove(moveObserver);
        isAnimatingMovement = false;
        console.log(`[FACING] Movement animation complete. Unit now at grid (${unit.gridX},${unit.gridZ})`);

        // Snap to final position
        const finalX = endX;
        const finalZ = endZ;
        unit.modelRoot!.position.x = finalX;
        unit.modelRoot!.position.z = finalZ;
        unit.mesh.position.x = finalX;
        unit.mesh.position.z = finalZ;

        // Return to idle
        playIdleAnimation(unit);

        onComplete?.();
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
    shadowBaseMat.alpha = 0.4;
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
    shadowMat.alpha = 0.3;
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
  function createIntentIndicator(targetX: number, targetZ: number, color: Color3): Mesh {
    const indicator = MeshBuilder.CreateCylinder(
      "intent_indicator",
      { diameter: 0.9, height: 0.06, tessellation: 24 },
      scene
    );
    const indicatorMat = new StandardMaterial("intentMat", scene);
    indicatorMat.diffuseColor = color;
    indicatorMat.emissiveColor = color.scale(0.3);  // Slight glow effect
    indicatorMat.alpha = 0.5;
    indicator.material = indicatorMat;
    indicator.position = new Vector3(
      targetX * TILE_SIZE - gridOffset,
      0.12,  // Slightly above tile
      targetZ * TILE_SIZE - gridOffset
    );
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

    for (const action of turnState.pendingActions) {
      if (action.type === "attack" && action.targetUnit) {
        // Red indicator for attack
        const indicator = createIntentIndicator(
          action.targetUnit.gridX,
          action.targetUnit.gridZ,
          new Color3(0.9, 0.2, 0.2)  // Red
        );
        intentIndicators.push(indicator);
      } else if (action.type === "ability" && action.abilityName === "heal" && action.targetUnit) {
        // Green indicator for heal/support
        const indicator = createIntentIndicator(
          action.targetUnit.gridX,
          action.targetUnit.gridZ,
          new Color3(0.2, 0.9, 0.3)  // Green
        );
        intentIndicators.push(indicator);
      } else if (action.type === "ability" && (action.abilityName === "conceal" || action.abilityName === "cover") && action.targetUnit) {
        // Blue indicator for self-buff abilities
        const indicator = createIntentIndicator(
          action.targetUnit.gridX,
          action.targetUnit.gridZ,
          new Color3(0.2, 0.5, 0.9)  // Blue
        );
        intentIndicators.push(indicator);
      }
    }
  }

  // Starting positions for each team
  const player1Positions = [
    { x: 1, z: 1 },
    { x: 3, z: 0 },
    { x: 5, z: 1 },
  ];
  const player2Positions = [
    { x: 6, z: 6 },
    { x: 4, z: 7 },
    { x: 2, z: 6 },
  ];

  // Use loadout if provided, otherwise default setup
  const defaultUnits: UnitSelection[] = [{ type: "tank" }, { type: "damage" }, { type: "support" }];
  const player1Selections = loadout?.player1 ?? defaultUnits;
  const player2Selections = loadout?.player2 ?? defaultUnits;

  // Get team colors from loadout or use defaults
  const player1TeamColor = loadout?.player1TeamColor
    ? hexToColor3(loadout.player1TeamColor)
    : new Color3(0.2, 0.4, 0.9);  // Default blue
  const player2TeamColor = loadout?.player2TeamColor
    ? hexToColor3(loadout.player2TeamColor)
    : new Color3(0.9, 0.3, 0.2);  // Default red

  // Spawn units asynchronously
  async function spawnAllUnits(): Promise<void> {
    // Spawn player1 units
    for (let i = 0; i < player1Selections.length; i++) {
      const pos = player1Positions[i];
      const selection = player1Selections[i];
      const unit = await createUnit(
        selection.type,
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
        selection.type,
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

    // Enable facing debug now that initial setup is done
    enableFacingDebug();

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

  // Initiative system
  let currentUnit: Unit | null = null;
  let lastActingTeam: Team | null = null;
  let isFirstRound = true;
  let firstRoundQueue: Unit[] = [];
  const ACCUMULATOR_THRESHOLD = 10;

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

  // ============================================
  // ROTATION TESTING JIG
  // ============================================
  let rotationTestStrategy: "none" | "A" | "B" = "none";
  let rotationTestTime = 0;

  // Keyboard listener for rotation test
  window.addEventListener("keydown", (e) => {
    if (e.key === "1") {
      rotationTestStrategy = rotationTestStrategy === "A" ? "none" : "A";
      console.log(`Rotation strategy: ${rotationTestStrategy} (modelRoot.rotation.y)`);
    } else if (e.key === "2") {
      rotationTestStrategy = rotationTestStrategy === "B" ? "none" : "B";
      console.log(`Rotation strategy: ${rotationTestStrategy} (modelRoot.rotationQuaternion)`);
    }
  });

  // Continuous rotation in render loop
  scene.onBeforeRenderObservable.add(() => {
    if (rotationTestStrategy === "none") return;

    rotationTestTime += engine.getDeltaTime() / 1000;
    const angle = rotationTestTime * 2; // 2 radians per second

    for (const unit of units) {
      if (!unit.modelRoot) continue;

      if (rotationTestStrategy === "A") {
        // Strategy A: Direct rotation.y assignment
        unit.modelRoot.rotation.y = angle;
      } else if (rotationTestStrategy === "B") {
        // Strategy B: Clear quaternion first, then set rotation.y
        unit.modelRoot.rotationQuaternion = null;
        unit.modelRoot.rotation.y = angle;
      }
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
    console.log("startUnitTurn called for:", unit.type, unit.team);
    currentUnit = unit;
    unit.hasMoved = false;
    unit.hasAttacked = false;

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

    // Initialize turn state for preview/undo system
    turnState = {
      unit,
      actionsRemaining: 2,
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
    console.log("endCurrentUnitTurn called, currentUnit:", currentUnit?.type, currentUnit?.team);
    const unit = currentUnit;
    if (!unit) return;

    // Calculate speed bonus based on unused actions
    // Each unused action gives +0.5 speed bonus for next turn
    const unusedActions = turnState?.actionsRemaining ?? 0;
    unit.speedBonus = unusedActions * 0.5;

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

    // Get next unit
    const nextUnit = getNextUnit();
    console.log("getNextUnit returned:", nextUnit?.type, nextUnit?.team);
    if (nextUnit) {
      // Consume the speed bonus from previous turn (it only lasts one turn)
      // The bonus was already used in accumulator calculation, now clear it
      // Actually, we set it above for NEXT turn, so we consume it BEFORE their turn
      startUnitTurn(nextUnit);
      // After starting turn, clear the bonus (it was used for this turn's accumulation)
      nextUnit.speedBonus = 0;
    } else {
      console.log("No next unit found! Units remaining:", units.length, units.map(u => `${u.team}-${u.type}`));
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
    const valid: { x: number; z: number }[] = [];
    for (let x = 0; x < GRID_SIZE; x++) {
      for (let z = 0; z < GRID_SIZE; z++) {
        const distance = Math.abs(x - startX) + Math.abs(z - startZ);
        if (distance > 0 && distance <= unit.moveRange) {
          // Check if occupied (but exclude the unit's original position since they're moving from there)
          const occupied = units.some(u => u.gridX === x && u.gridZ === z && !(u === unit && fromX !== undefined));
          if (!occupied) {
            valid.push({ x, z });
          }
        }
      }
    }
    return valid;
  }

  function getAttackableEnemies(unit: Unit): Unit[] {
    if (!hasActionsRemaining()) return []; // No actions remaining
    return units.filter(u => {
      if (u.team === unit.team) return false;
      const distance = Math.abs(u.gridX - unit.gridX) + Math.abs(u.gridZ - unit.gridZ);
      return distance <= unit.attackRange;
    });
  }

  function getHealableAllies(unit: Unit): Unit[] {
    // Only support can heal, needs actions remaining
    // Heal is adjacent only (distance <= 1, including self)
    if (unit.healAmount <= 0 || !hasActionsRemaining()) return [];
    return units.filter(u => {
      if (u.team !== unit.team) return false; // Must be same team
      if (u.hp >= u.maxHp) return false; // Already at full health
      const distance = Math.abs(u.gridX - unit.gridX) + Math.abs(u.gridZ - unit.gridZ);
      return distance <= 1; // Self (0) or adjacent (1) only
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

    // Highlight attackable enemies (if hasn't attacked)
    attackableUnits = getAttackableEnemies(unit);
    for (const player2 of attackableUnits) {
      const tile = tiles[player2.gridX][player2.gridZ];
      tile.material = attackableMaterial;
      highlightedTiles.push(tile);
    }

    // Highlight healable allies (support only, if hasn't attacked)
    healableUnits = getHealableAllies(unit);
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
  function highlightHealTargets(unit: Unit, fromX?: number, fromZ?: number): void {
    clearHighlights();
    healableUnits = [];

    if (!hasActionsRemaining() || unit.healAmount <= 0) return;

    // Use shadow position if pending move, otherwise current position
    const effectiveX = fromX ?? shadowPosition?.x ?? unit.gridX;
    const effectiveZ = fromZ ?? shadowPosition?.z ?? unit.gridZ;

    // Can heal self or adjacent allies
    for (const ally of units) {
      if (ally.team !== unit.team) continue;
      if (ally.hp >= ally.maxHp) continue;  // Already at full health

      const distance = Math.abs(ally.gridX - effectiveX) + Math.abs(ally.gridZ - effectiveZ);
      if (distance <= 1) {  // Self (0) or adjacent (1)
        const tile = tiles[ally.gridX][ally.gridZ];
        tile.material = healableMaterial;
        highlightedTiles.push(tile);
        healableUnits.push(ally);
      }
    }

    // Highlight effective position
    const currentTile = tiles[effectiveX][effectiveZ];
    if (!highlightedTiles.includes(currentTile)) {
      currentTile.material = selectedMaterial;
      highlightedTiles.push(currentTile);
    }
  }

  // Toggle Conceal for Operator (damage type)
  function toggleConceal(unit: Unit): void {
    unit.isConcealed = !unit.isConcealed;

    if (unit.isConcealed) {
      // Make model semi-transparent
      if (unit.modelMeshes) {
        unit.modelMeshes.forEach(mesh => {
          if (mesh.material) {
            (mesh.material as PBRMaterial).alpha = 0.4;
          }
        });
      }

      console.log(`${unit.team} ${unit.type} activates Conceal!`);
    } else {
      // Restore full visibility
      if (unit.modelMeshes) {
        unit.modelMeshes.forEach(mesh => {
          if (mesh.material) {
            (mesh.material as PBRMaterial).alpha = 1.0;
          }
        });
      }

      console.log(`${unit.team} ${unit.type} deactivates Conceal.`);
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

  // Cover tiles tracking for visual display
  let coverTileMeshes: Mesh[] = [];

  // Toggle Cover for Soldier (tank type)
  function toggleCover(unit: Unit): void {
    unit.isCovering = !unit.isCovering;

    // Clear existing cover visualization
    clearCoverVisualization();

    if (unit.isCovering) {
      // Get covered tiles based on weapon type
      const isMelee = unit.customization?.combatStyle === "melee";
      let coveredTiles: { x: number; z: number }[];

      if (isMelee) {
        // Sword: Cover all 4 adjacent ordinal tiles
        coveredTiles = getAdjacentOrdinalTiles(unit.gridX, unit.gridZ);
      } else {
        // Gun: Cover all tiles in LOS that they could shoot (not adjacent)
        coveredTiles = getTilesInLOS(unit.gridX, unit.gridZ, true, unit);
      }

      // Create pulsing border visualization for covered tiles
      for (const { x, z } of coveredTiles) {
        createCoverBorder(x, z, unit.teamColor);
      }

      console.log(`${unit.team} ${unit.type} activates Cover! (${coveredTiles.length} tiles)`);
    } else {
      console.log(`${unit.team} ${unit.type} deactivates Cover.`);
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

  function createCoverBorder(tileX: number, tileZ: number, color: Color3): void {
    const borderThickness = 0.04;
    const borderHeight = 0.05;
    const tileHalf = (TILE_SIZE - TILE_GAP) / 2;

    const worldX = tileX * TILE_SIZE - gridOffset;
    const worldZ = tileZ * TILE_SIZE - gridOffset;

    const borderMat = new StandardMaterial(`coverBorderMat_${tileX}_${tileZ}`, scene);
    borderMat.diffuseColor = color;
    borderMat.emissiveColor = color.scale(0.6);
    borderMat.alpha = 0.8;

    // Create 4 border edges
    const edges = [
      { width: TILE_SIZE - TILE_GAP, depth: borderThickness, offsetX: 0, offsetZ: tileHalf },
      { width: TILE_SIZE - TILE_GAP, depth: borderThickness, offsetX: 0, offsetZ: -tileHalf },
      { width: borderThickness, depth: TILE_SIZE - TILE_GAP, offsetX: tileHalf, offsetZ: 0 },
      { width: borderThickness, depth: TILE_SIZE - TILE_GAP, offsetX: -tileHalf, offsetZ: 0 },
    ];

    for (const edge of edges) {
      const borderMesh = MeshBuilder.CreateBox(`coverBorder_${tileX}_${tileZ}`, {
        width: edge.width,
        height: borderHeight,
        depth: edge.depth,
      }, scene);
      borderMesh.material = borderMat;
      borderMesh.position = new Vector3(
        worldX + edge.offsetX,
        0.08,
        worldZ + edge.offsetZ
      );
      coverTileMeshes.push(borderMesh);
    }
  }

  function clearCoverVisualization(): void {
    for (const mesh of coverTileMeshes) {
      mesh.dispose();
    }
    coverTileMeshes = [];
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
    container.width = "400px";
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
      // Always update color based on current HP percentage
      if (hpPercent < 0.3) {
        unit.hpBar.background = "#ff4444";
      } else if (hpPercent < 0.6) {
        unit.hpBar.background = "#ffaa44";
      } else {
        unit.hpBar.background = "#44ff44";  // Green when healthy
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

    const unitName = currentUnit.type.charAt(0).toUpperCase() + currentUnit.type.slice(1);
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

    // Update intent indicators (blue for self-buff)
    updateIntentIndicators();

    // Update menu to show queued action
    updateCommandMenu();
  }

  // Execute all queued actions sequentially
  function executeQueuedActions(): void {
    console.log("executeQueuedActions called, pendingActions:", turnState?.pendingActions.length);
    if (!turnState || turnState.pendingActions.length === 0) {
      // No actions to execute, just end turn
      endCurrentUnitTurn();
      return;
    }

    isExecutingActions = true;
    const unit = turnState.unit;
    const actions = [...turnState.pendingActions];  // Copy the array

    // Clear previews, shadow position, and intent indicators
    clearShadowPreview();
    clearAttackPreview();
    clearIntentIndicators();
    shadowPosition = null;

    // Process actions sequentially
    function processNextAction(index: number): void {
      console.log(`[FACING] processNextAction index=${index}, total actions=${actions.length}`);
      if (index >= actions.length) {
        // All actions complete - face closest enemy before ending turn
        console.log(`[FACING] All actions complete, calling faceClosestEnemy for ${unit.team} ${unit.type}`);
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
          processNextAction(index + 1);
        });
      } else if (action.type === "attack" && action.targetUnit) {
        // Execute attack
        executeAttack(unit, action.targetUnit, () => {
          processNextAction(index + 1);
        });
      } else if (action.type === "ability" && action.abilityName === "heal" && action.targetUnit) {
        // Execute heal
        executeHeal(unit, action.targetUnit, () => {
          processNextAction(index + 1);
        });
      } else if (action.type === "ability" && action.abilityName === "conceal") {
        // Execute conceal
        executeConceal(unit, () => {
          processNextAction(index + 1);
        });
      } else if (action.type === "ability" && action.abilityName === "cover") {
        // Execute cover
        executeCover(unit, () => {
          processNextAction(index + 1);
        });
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
    // Face the defender
    console.log(`[FACING] executeAttack: ${attacker.team} ${attacker.type} at (${attacker.gridX},${attacker.gridZ}) attacking ${defender.team} ${defender.type} at (${defender.gridX},${defender.gridZ})`);
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
        if (defender.modelMeshes) {
          defender.modelMeshes.forEach(mesh => {
            if (mesh.material) {
              (mesh.material as PBRMaterial).alpha = 1.0;
            }
          });
        }
        console.log(`${defender.team} ${defender.type}'s Conceal was broken! Damage negated!`);
        if (attacker.type === "support") playSfx(sfx.hitLight);
        else if (attacker.type === "tank") playSfx(sfx.hitMedium);
        else if (attacker.type === "damage") playSfx(sfx.hitHeavy);

        playAnimation(defender, "HitRecieve", false, () => {
          playIdleAnimation(defender);
          onComplete();
        });
        return;
      }

      // Apply damage
      defender.hp -= attacker.attack;
      console.log(`${attacker.team} ${attacker.type} attacks ${defender.team} ${defender.type} for ${attacker.attack} damage! (${defender.hp}/${defender.maxHp} HP)`);

      if (attacker.type === "support") playSfx(sfx.hitLight);
      else if (attacker.type === "tank") playSfx(sfx.hitMedium);
      else if (attacker.type === "damage") playSfx(sfx.hitHeavy);

      updateHpBar(defender);

      if (defender.hp <= 0) {
        console.log(`${defender.team} ${defender.type} was defeated!`);
        if (defender.isCovering) {
          defender.isCovering = false;
          clearCoverVisualization();
        }

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
    }, 300); // 300ms delay for attack animation to reach impact
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
    console.log(`${healer.team} ${healer.type} heals ${target.team} ${target.type} for ${healedAmount} HP! (${target.hp}/${target.maxHp} HP)`);

    playSfx(sfx.heal);
    updateHpBar(target);
  }

  // Execute conceal ability (called during execution phase)
  function executeConceal(unit: Unit, onComplete: () => void): void {
    unit.isConcealed = !unit.isConcealed;

    if (unit.isConcealed) {
      // Make model semi-transparent
      if (unit.modelMeshes) {
        unit.modelMeshes.forEach(mesh => {
          if (mesh.material) {
            (mesh.material as PBRMaterial).alpha = 0.4;
          }
        });
      }
      console.log(`${unit.team} ${unit.type} activates Conceal!`);
    } else {
      // Restore full visibility
      if (unit.modelMeshes) {
        unit.modelMeshes.forEach(mesh => {
          if (mesh.material) {
            (mesh.material as PBRMaterial).alpha = 1.0;
          }
        });
      }
      console.log(`${unit.team} ${unit.type} deactivates Conceal.`);
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

  // Execute cover ability (called during execution phase)
  function executeCover(unit: Unit, onComplete: () => void): void {
    unit.isCovering = !unit.isCovering;

    // Clear existing cover visualization
    clearCoverVisualization();

    if (unit.isCovering) {
      // Get covered tiles based on weapon type
      const isMelee = unit.customization?.combatStyle === "melee";
      let coveredTiles: { x: number; z: number }[];

      if (isMelee) {
        // Sword: Cover all 4 adjacent ordinal tiles
        coveredTiles = getAdjacentOrdinalTiles(unit.gridX, unit.gridZ);
      } else {
        // Gun: Cover all tiles in LOS that they could shoot (not adjacent)
        coveredTiles = getTilesInLOS(unit.gridX, unit.gridZ, true, unit);
      }

      // Create pulsing border visualization for covered tiles
      for (const { x, z } of coveredTiles) {
        createCoverBorder(x, z, unit.teamColor);
      }

      console.log(`${unit.team} ${unit.type} activates Cover! (${coveredTiles.length} tiles)`);
    } else {
      console.log(`${unit.team} ${unit.type} deactivates Cover.`);
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

    // If it was a move, clear the shadow preview
    if (lastAction?.type === "move") {
      clearShadowPreview();
      shadowPosition = null;
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
          // Queue the move instead of executing immediately
          console.log(`Queueing move to (${gridX}, ${gridZ})`);
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
          console.log("Queueing attack action (via tile click)");
          queueAttackAction(selectedUnit, targetUnit);
        } else {
          // Clicked invalid tile, cancel attack mode
          clearHighlights();
          selectedUnit = null;
          currentActionMode = "none";
        }
      } else if (selectedUnit && currentActionMode === "ability") {
        // Check if there's a healable unit on this tile
        const targetUnit = healableUnits.find(u => u.gridX === gridX && u.gridZ === gridZ);
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
        // Check if clicking an attackable player2
        console.log(`Click on unit: mode=${currentActionMode}, attackableUnits=${attackableUnits.length}, includes=${attackableUnits.includes(clickedUnit)}`);
        if (attackableUnits.includes(clickedUnit) && currentActionMode === "attack") {
          console.log("Queueing attack action");
          queueAttackAction(selectedUnit, clickedUnit);
          return;
        }

        // Check if clicking a healable ally
        if (healableUnits.includes(clickedUnit) && currentActionMode === "ability") {
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
        console.log(`Selected ${clickedUnit.team} ${clickedUnit.type} (HP: ${clickedUnit.hp}/${clickedUnit.maxHp}, ATK: ${clickedUnit.attack})`);
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
    console.log(`Attack button clicked: currentUnit=${currentUnit?.type}, isAnimating=${isAnimatingMovement}, actionsRemaining=${turnState?.actionsRemaining}`);
    if (currentUnit && !isAnimatingMovement) {
      currentActionMode = "attack";
      selectedUnit = currentUnit;
      // Highlight attack targets from shadow position (if pending move) or current position
      const effectiveX = shadowPosition?.x ?? currentUnit.gridX;
      const effectiveZ = shadowPosition?.z ?? currentUnit.gridZ;
      highlightAttackTargets(currentUnit, effectiveX, effectiveZ);
      console.log(`Attack mode set, attackableUnits found: ${attackableUnits.length}`);
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
      if (currentUnit.type === "support") {
        // Heal mode - highlight healable allies
        currentActionMode = "ability";
        selectedUnit = currentUnit;
        highlightHealTargets(currentUnit);
      } else if (currentUnit.type === "damage") {
        // Conceal - queue as action
        queueConcealAction(currentUnit);
      } else if (currentUnit.type === "tank") {
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

    // Update unit name
    const unitNames: Record<string, string> = {
      tank: "SOLDIER",
      damage: "OPERATOR",
      support: "MEDIC"
    };
    menuUnitName.text = unitNames[currentUnit.type] || currentUnit.type.toUpperCase();

    // Update ability button based on unit type
    const abilityNames: Record<string, string> = {
      tank: "Cover",
      damage: "Conceal",
      support: "Heal"
    };
    if (abilityBtn.textBlock) {
      abilityBtn.textBlock.text = abilityNames[currentUnit.type] || "Ability";
    }

    // Update actions text from turnState
    const remaining = turnState?.actionsRemaining ?? 0;
    menuActionsText.text = `Actions: ${remaining}/2`;

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
          const targetName = action.targetUnit.type.charAt(0).toUpperCase() + action.targetUnit.type.slice(1);
          lines.push(`  Attack ${targetName}`);
        } else if (action.type === "ability" && action.abilityName === "heal" && action.targetUnit) {
          const targetName = action.targetUnit === currentUnit ? "self" : action.targetUnit.type;
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
function getModelFileName(type: UnitType, isMale: boolean): string {
  const gender = isMale ? "m" : "f";
  switch (type) {
    case "tank": return `soldier_${gender}.glb`;
    case "damage": return `operator_${gender}.glb`;
    case "support": return `medic_${gender}.glb`;
  }
}

async function createUnit(
  type: "tank" | "damage" | "support",
  team: Team,
  gridX: number,
  gridZ: number,
  scene: Scene,
  _materials: Record<string, StandardMaterial>,  // Kept for API compatibility
  gridOffset: number,
  gui: AdvancedDynamicTexture,
  loadoutIndex: number,
  teamColor: Color3,
  customization?: SupportCustomization
): Promise<Unit> {
  const stats = UNIT_STATS[type];

  // Default customization if not provided
  const c: SupportCustomization = customization ?? {
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
  const modelFile = getModelFileName(type, isMale);
  const result = await SceneLoader.ImportMeshAsync("", "/models/", modelFile, scene);

  const modelRoot = result.meshes[0];
  const modelMeshes = result.meshes;
  const animationGroups = result.animationGroups;

  // Hide model initially until facing is set (prevents wrong-direction flash)
  modelRoot.setEnabled(false);

  // Position and scale the model
  const modelScale = 0.5;
  modelRoot.position = new Vector3(
    gridX * TILE_SIZE - gridOffset,
    0.05,  // Lowered since base disc was removed
    gridZ * TILE_SIZE - gridOffset
  );
  modelRoot.scaling = new Vector3(
    c.handedness === "right" ? -modelScale : modelScale,
    modelScale,
    modelScale
  );

  // Apply customizations to the model
  // Head visibility
  for (let i = 0; i < 4; i++) {
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
    mesh.metadata = { type: "unit", unitType: type, team };
  });

  // Start idle animation
  animationGroups.forEach(ag => ag.stop());
  const idleAnim = isMelee
    ? animationGroups.find(ag => ag.name === "Idle_Sword")
    : animationGroups.find(ag => ag.name === "Idle_Gun");
  idleAnim?.start(true);

  // Create an invisible mesh for HP bar linkage (positioned at model's head height)
  const hpBarAnchor = MeshBuilder.CreateBox(`${team}_${type}_anchor_${gridX}_${gridZ}`, { size: 0.01 }, scene);
  hpBarAnchor.position = new Vector3(
    gridX * TILE_SIZE - gridOffset,
    1.2,  // Approximate head height
    gridZ * TILE_SIZE - gridOffset
  );
  hpBarAnchor.isVisible = false;
  hpBarAnchor.metadata = { type: "unit", unitType: type, team };

  // HP bar background
  const hpBarBg = new Rectangle();
  hpBarBg.width = "34px";
  hpBarBg.height = "6px";
  hpBarBg.background = "#333333";
  hpBarBg.thickness = 1;
  hpBarBg.color = "#000000";
  hpBarBg.isVisible = false;  // Hide until model is ready
  gui.addControl(hpBarBg);
  hpBarBg.linkWithMesh(hpBarAnchor);
  hpBarBg.linkOffsetY = -50;

  // HP bar fill
  const hpBar = new Rectangle();
  hpBar.width = "30px";
  hpBar.height = "4px";
  hpBar.background = "#44ff44";
  hpBar.horizontalAlignment = Rectangle.HORIZONTAL_ALIGNMENT_LEFT;
  hpBar.left = "2px";
  hpBarBg.addControl(hpBar);

  const originalColor = teamColor.clone();

  return {
    mesh: hpBarAnchor,  // Use anchor as the main "mesh" for positioning
    type,
    team,
    gridX,
    gridZ,
    moveRange: stats.moveRange,
    attackRange: stats.attackRange,
    hp: stats.hp,
    maxHp: stats.hp,
    attack: stats.attack,
    healAmount: stats.healAmount,
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

  // Move HP bar anchor
  unit.mesh.position = new Vector3(newPosX, 1.2, newPosZ);

  // Move 3D model
  if (unit.modelRoot) {
    unit.modelRoot.position = new Vector3(newPosX, 0.05, newPosZ);
  }
}
