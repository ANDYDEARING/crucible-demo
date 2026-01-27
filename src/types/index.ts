/**
 * types/index.ts
 *
 * Centralized type definitions for the game.
 * Organized by category for easy discovery.
 *
 * Note: The Unit interface currently includes Babylon.js visual types (Mesh, etc.).
 * For headless simulations, consider splitting into UnitData (pure data) and
 * UnitVisual (rendering) in a future refactor.
 */

import type { Mesh, AbstractMesh, AnimationGroup, Color3 } from "@babylonjs/core";
import type { Rectangle, TextBlock } from "@babylonjs/gui";

// =============================================================================
// SCENE NAVIGATION
// =============================================================================

/** Available scene names for navigation */
export type SceneName = "start" | "title" | "loadout" | "battle";

// =============================================================================
// UNIT CLASSES & CUSTOMIZATION
// =============================================================================

/** Available unit classes */
export type UnitClass = "soldier" | "operator" | "medic";

/** Body type options */
export type BodyType = "male" | "female";

/** Combat style determines weapon and attack range */
export type CombatStyle = "melee" | "ranged";

/** Handedness affects model orientation */
export type Handedness = "right" | "left";

/** Visual customization options for a unit */
export interface UnitCustomization {
  body: BodyType;
  combatStyle: CombatStyle;
  handedness: Handedness;
  head: number;       // 0-3 for Head_001 through Head_004
  hairColor: number;  // Index into HAIR_COLORS palette
  eyeColor: number;   // Index into EYE_COLORS palette
  skinTone: number;   // Index into SKIN_TONES palette
}

// =============================================================================
// GAME MODE
// =============================================================================

/** Game mode determines controller configuration */
export type GameMode = "local-pvp" | "local-pve";

// =============================================================================
// LOADOUT
// =============================================================================

/** A unit selected for a team in the loadout */
export interface UnitSelection {
  unitClass: UnitClass;
  customization?: UnitCustomization;
  boost?: number;  // Boost selection (0, 1, or 2) - feature coming soon
}

/** Complete loadout configuration for a battle */
export interface Loadout {
  player1: UnitSelection[];
  player2: UnitSelection[];
  player1TeamColor?: string;  // Hex color for player 1 team
  player2TeamColor?: string;  // Hex color for player 2 team
  gameMode: GameMode;         // PvP or PvE
  humanTeam?: "player1" | "player2";  // Which team is human in PvE
}

// =============================================================================
// CLASS DATA
// =============================================================================

/** Static data defining a unit class's stats and abilities */
export interface ClassData {
  id: UnitClass;
  name: string;
  description: string;
  hp: number;
  attack: number;
  moveRange: number;
  attackRange: number;
  healAmount: number;
  ability: string;
  modelFile: string;  // Base filename without gender suffix
}

/** Class definitions with base stats */
export const CLASS_DATA: Record<UnitClass, ClassData> = {
  soldier: {
    id: "soldier",
    name: "Soldier",
    description: "Frontline fighter. Uses Cover to protect allies.",
    hp: 75,
    attack: 20,
    moveRange: 3,
    attackRange: 2,
    healAmount: 0,
    ability: "Cover",
    modelFile: "soldier",
  },
  operator: {
    id: "operator",
    name: "Operator",
    description: "Stealth specialist. Uses Conceal to avoid damage.",
    hp: 75,
    attack: 20,
    moveRange: 3,
    attackRange: 2,
    healAmount: 0,
    ability: "Conceal",
    modelFile: "operator",
  },
  medic: {
    id: "medic",
    name: "Medic",
    description: "Support unit. Heals adjacent allies (requires LOS for diagonals).",
    hp: 75,
    attack: 20,
    moveRange: 3,
    attackRange: 2,
    healAmount: 25,
    ability: "Heal",
    modelFile: "medic",
  },
};

/** All available unit classes */
export const ALL_CLASSES: UnitClass[] = ["soldier", "operator", "medic"];

/** Helper to get class data by class ID */
export function getClassData(unitClass: UnitClass): ClassData {
  return CLASS_DATA[unitClass];
}

// =============================================================================
// BATTLE SYSTEM
// =============================================================================

/** Team identifier */
export type Team = "player1" | "player2";

/** Current action mode in the command menu */
export type ActionMode = "none" | "move" | "attack" | "ability";

/** A pending action in the action queue */
export interface PendingAction {
  type: "move" | "attack" | "ability";
  targetX?: number;
  targetZ?: number;
  targetUnit?: Unit;
  abilityName?: string;
}

/** State tracking for a unit's turn (for preview/undo system) */
export interface TurnState {
  unit: Unit;
  actionsRemaining: number;
  pendingActions: PendingAction[];
  originalPosition: { x: number; z: number };
  originalFacing: number;
}

/** Facing configuration for a unit's 3D model */
export interface FacingConfig {
  currentAngle: number;   // Current facing angle in radians
  baseOffset: number;     // Model's base rotation offset (model-specific)
  isFlipped: boolean;     // Whether model has negative X scale (right-handed)
}

// =============================================================================
// UNIT
// =============================================================================

/**
 * Runtime unit representation in battle.
 * Contains both data and Babylon.js visual references.
 *
 * TODO: For headless simulations, split into:
 * - UnitData: Pure data (stats, position, state)
 * - UnitVisual: Babylon.js references (mesh, animations, HP bar)
 */
export interface Unit {
  // Core identity
  mesh: Mesh;
  unitClass: UnitClass;
  team: Team;

  // Grid position
  gridX: number;
  gridZ: number;

  // Stats
  moveRange: number;
  attackRange: number;
  hp: number;
  maxHp: number;
  attack: number;
  healAmount: number;

  // Visual references (Babylon.js)
  hpBar?: Rectangle;
  hpBarBg?: Rectangle;
  designationLabel?: TextBlock;
  originalColor: Color3;
  modelRoot?: AbstractMesh;
  modelMeshes?: AbstractMesh[];
  animationGroups?: AnimationGroup[];
  customization?: UnitCustomization;
  teamColor: Color3;

  // Action tracking (legacy - will migrate to TurnState)
  hasMoved: boolean;
  hasAttacked: boolean;

  // Initiative system
  speed: number;
  speedBonus: number;   // Bonus from skipping, consumed after next turn
  accumulator: number;  // Builds up until >= threshold, then unit acts
  loadoutIndex: number; // Original position in loadout for tie-breaking
  boost: number;        // Boost index (0=HP, 1=Damage, 2=Speed)

  // Facing system
  facing: FacingConfig;

  // Ability states
  isConcealed: boolean;
  isCovering: boolean;
}
