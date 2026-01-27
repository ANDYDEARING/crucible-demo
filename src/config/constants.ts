/**
 * constants.ts
 *
 * Centralized configuration for all magic numbers and game constants.
 * Organized by category for easy discovery and modification.
 *
 * When adding new constants:
 * 1. Place them in the appropriate category
 * 2. Add a descriptive comment explaining the value
 * 3. Use SCREAMING_SNAKE_CASE for naming
 */

// =============================================================================
// GRID & TERRAIN
// =============================================================================

/** Number of tiles along each axis (creates GRID_SIZE x GRID_SIZE grid) */
export const GRID_SIZE = 8;

/** Size of each tile in world units */
export const TILE_SIZE = 1;

/** Gap between tiles for visual separation */
export const TILE_GAP = 0.05;

/** Number of random terrain cubes to generate */
export const TERRAIN_COUNT = 10;

// =============================================================================
// SPAWN POSITIONS
// =============================================================================

/** Starting positions for Player 1 units (bottom-left quadrant) */
export const PLAYER1_SPAWN_POSITIONS = [
  { x: 1, z: 1 },
  { x: 3, z: 0 },
  { x: 5, z: 1 },
] as const;

/** Starting positions for Player 2 units (top-right quadrant) */
export const PLAYER2_SPAWN_POSITIONS = [
  { x: 6, z: 6 },
  { x: 4, z: 7 },
  { x: 2, z: 6 },
] as const;

// =============================================================================
// CAMERA (BATTLE SCENE)
// =============================================================================

/** Initial horizontal rotation angle (radians) */
export const BATTLE_CAMERA_ALPHA = Math.PI / 4;

/** Initial vertical rotation angle (radians) */
export const BATTLE_CAMERA_BETA = Math.PI / 3;

/** Initial distance from target */
export const BATTLE_CAMERA_RADIUS = 12;

/** Minimum vertical angle (prevents looking from below) */
export const BATTLE_CAMERA_LOWER_BETA_LIMIT = 0.3;

/** Maximum vertical angle (prevents looking straight down) */
export const BATTLE_CAMERA_UPPER_BETA_LIMIT = Math.PI / 2.2;

/** Minimum zoom distance */
export const BATTLE_CAMERA_LOWER_RADIUS_LIMIT = 8;

/** Maximum zoom distance */
export const BATTLE_CAMERA_UPPER_RADIUS_LIMIT = 20;

// =============================================================================
// CAMERA (LOADOUT SCENE - PREVIEW)
// =============================================================================

/** Preview camera horizontal angle */
export const PREVIEW_CAMERA_ALPHA = 4.1;

/** Preview camera vertical angle */
export const PREVIEW_CAMERA_BETA = Math.PI / 2.5;

/** Size of the render target texture for 3D preview (square) */
export const PREVIEW_RTT_SIZE = 768;

/**
 * Zoom presets for loadout preview camera
 * Each preset defines radius (distance) and targetY (focus height)
 */
export const PREVIEW_ZOOM_PRESETS = [
  { radius: 3, targetY: 0.7, name: "Full Body" },
  { radius: 1.7, targetY: 1.0, name: "Torso & Head" },
] as const;

/** Interpolation speed for smooth camera zoom transitions (0-1, higher = faster) */
export const PREVIEW_ZOOM_LERP_SPEED = 0.08;

/** Offset to position preview models (keeps them out of main camera view) */
export const PREVIEW_MODEL_OFFSET = 100;

// =============================================================================
// ANIMATION TIMING
// =============================================================================

/** Seconds to traverse one tile during movement */
export const MOVEMENT_DURATION_PER_TILE = 0.3;

/** Delay before applying damage after attack animation starts (ms) */
export const ATTACK_IMPACT_DELAY_MS = 300;

/** Title screen fade-in duration (seconds) */
export const TITLE_FADE_IN_DURATION = 1.5;

/** Delay before title fade-in starts (seconds) */
export const TITLE_FADE_IN_DELAY = 0.3;

/** Corner indicator pulse frequency (pulses per second) */
export const CORNER_PULSE_FREQUENCY = 4;

/** Execute button pulse frequency when actions queued (pulses per second) */
export const EXECUTE_BUTTON_PULSE_FREQUENCY = 4;

/** RTT update frequency divisor (updates every Nth frame, 3 = ~20fps) */
export const RTT_UPDATE_FRAME_DIVISOR = 3;

// =============================================================================
// COMBAT & TURN SYSTEM
// =============================================================================

/** Number of actions each unit gets per turn */
export const ACTIONS_PER_TURN = 2;

/** Accumulator value required to take a turn */
export const ACCUMULATOR_THRESHOLD = 10;

/** Speed bonus granted per unused action (encourages ending turn early) */
export const SPEED_BONUS_PER_UNUSED_ACTION = 0.25;

/** Default unit speed value */
export const BASE_UNIT_SPEED = 1;

/** Damage multiplier for melee attacks (vs ranged) */
export const MELEE_DAMAGE_MULTIPLIER = 2;

/** Multiplier for loadout boosts (HP, Damage, Speed) - 0.25 = 25% bonus */
export const BOOST_MULTIPLIER = 0.25;

// =============================================================================
// HP BAR THRESHOLDS
// =============================================================================

/** HP percentage below which bar turns red */
export const HP_LOW_THRESHOLD = 0.3;

/** HP percentage below which bar turns orange (above this is green) */
export const HP_MEDIUM_THRESHOLD = 0.6;

// =============================================================================
// VISUAL DIMENSIONS
// =============================================================================

/** Model scale for battle units */
export const BATTLE_MODEL_SCALE = 0.5;

/** Model scale for loadout preview */
export const PREVIEW_MODEL_SCALE = 0.9;

/** Height of HP bar anchor above ground */
export const HP_BAR_ANCHOR_HEIGHT = 1.2;

/** Y position for model root in battle */
export const BATTLE_MODEL_Y_POSITION = 0.05;

// =============================================================================
// COVER SYSTEM VISUAL DIMENSIONS
// =============================================================================

/** Size of L-shaped corner markers */
export const COVER_CORNER_SIZE = 0.12;

/** Thickness of corner marker arms */
export const COVER_CORNER_THICKNESS = 0.05;

/** Height of corner marker boxes */
export const COVER_CORNER_HEIGHT = 0.08;

// =============================================================================
// SHADOW PREVIEW DIMENSIONS
// =============================================================================

/** Diameter of shadow base disc */
export const SHADOW_BASE_DIAMETER = 0.8;

/** Height of shadow base disc */
export const SHADOW_BASE_HEIGHT = 0.08;

/** Diameter of shadow unit silhouette */
export const SHADOW_UNIT_DIAMETER = 0.5;

/** Height of shadow unit silhouette */
export const SHADOW_UNIT_HEIGHT = 1.0;

// =============================================================================
// INTENT INDICATOR DIMENSIONS
// =============================================================================

/** Diameter of intent indicator disc */
export const INTENT_INDICATOR_DIAMETER = 0.9;

/** Height of intent indicator disc */
export const INTENT_INDICATOR_HEIGHT = 0.06;

/** Vertical offset between stacked indicators */
export const INTENT_INDICATOR_STACK_OFFSET = 0.08;

// =============================================================================
// CORNER INDICATOR DIMENSIONS
// =============================================================================

/** Length of corner indicator arms */
export const ACTIVE_CORNER_LENGTH = 0.2;

/** Width/thickness of corner indicator arms */
export const ACTIVE_CORNER_WIDTH = 0.06;

// =============================================================================
// LOS (LINE OF SIGHT) SYSTEM
// =============================================================================

/** Epsilon for floating point comparisons in LOS calculations */
export const LOS_EPSILON = 0.0001;

// =============================================================================
// UNIT CUSTOMIZATION
// =============================================================================

/** Number of head variants available (Head_001 through Head_004) */
export const HEAD_VARIANT_COUNT = 4;

/** Maximum number of colors to display in color chooser UI */
export const MAX_DISPLAY_COLORS = 8;

// =============================================================================
// UI LAYOUT - COMMAND MENU
// =============================================================================

/** Width of the command menu panel */
export const COMMAND_MENU_WIDTH = "200px";

/** Height of the command menu panel */
export const COMMAND_MENU_HEIGHT = "340px";

/** Horizontal offset from screen edge */
export const COMMAND_MENU_EDGE_OFFSET = "20px";

/** Vertical offset from bottom of screen */
export const COMMAND_MENU_BOTTOM_OFFSET = "-20px";

// =============================================================================
// UI LAYOUT - BUTTONS
// =============================================================================

/** Standard action button height */
export const ACTION_BUTTON_HEIGHT = "28px";

/** Rotation button size (circular) */
export const ROTATION_BUTTON_SIZE = "50px";

/** Start battle button dimensions */
export const START_BUTTON_WIDTH = "200px";
export const START_BUTTON_HEIGHT = "50px";

// =============================================================================
// LOADOUT SCENE
// =============================================================================

/** Required number of units per team */
export const UNITS_PER_TEAM = 3;

/** Total number of team color options */
export const TEAM_COLOR_COUNT = 7;

/** Default team color indices (into TEAM_COLORS array) */
export const DEFAULT_PLAYER1_COLOR_INDEX = 2; // Blue
export const DEFAULT_PLAYER2_COLOR_INDEX = 0; // Red
