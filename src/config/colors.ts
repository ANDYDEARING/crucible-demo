/**
 * colors.ts
 *
 * Centralized color definitions for the entire application.
 * This is the SINGLE SOURCE OF TRUTH for all colors.
 *
 * Categories:
 * - Character customization palettes (skin, hair, eyes)
 * - Team colors (selectable by players)
 * - Tile/grid colors
 * - UI colors (HP bars, buttons, etc.)
 * - Scene background colors
 */

// =============================================================================
// CHARACTER CUSTOMIZATION PALETTES
// =============================================================================

/**
 * Skin tone options for character customization
 * Ordered from lightest to darkest
 */
export const SKIN_TONES = [
  "#FFDFC4", // Light
  "#E8C0A0",
  "#D0A080",
  "#B08060",
  "#906040",
  "#704828",
  "#503418",
  "#352210",
  "#1E1208",
  "#0A0604", // Near black
] as const;

/**
 * Hair color options for character customization
 * Mix of natural and fantasy colors
 */
export const HAIR_COLORS = [
  "#0A0A0A", // Black
  "#4A3728", // Brown
  "#E5C8A8", // Blond
  "#B55239", // Reddish-orange
  "#C0C0C0", // Silver
  "#FF2222", // Bright red
  "#FF66AA", // Bright pink
  "#9933FF", // Purple
  "#22CC44", // Green
  "#2288FF", // Blue
] as const;

/**
 * Eye color options for character customization
 * Mix of natural and fantasy colors
 */
export const EYE_COLORS = [
  "#2288FF", // Blue
  "#22AA44", // Green
  "#634E34", // Brown
  "#DD2222", // Red
  "#9933FF", // Purple
  "#FFFFFF", // White
  "#0A0A0A", // Black
  "#FF8800", // Orange
] as const;

// =============================================================================
// TEAM COLORS
// =============================================================================

/**
 * Team color options with display names
 * Players select from these for their team identity
 */
export const TEAM_COLORS = [
  { name: "Red", hex: "#DD3333" },
  { name: "Orange", hex: "#FF8800" },
  { name: "Blue", hex: "#3366DD" },
  { name: "Green", hex: "#33AA44" },
  { name: "Purple", hex: "#8833CC" },
  { name: "Pink", hex: "#DD66AA" },
  { name: "Yellow", hex: "#DDBB22" },
] as const;

/**
 * Default team colors when no selection is made
 * RGB values (0-1 range) for Babylon.js Color3
 */
export const DEFAULT_TEAM_COLORS = {
  player1: { r: 0.2, g: 0.4, b: 0.9 }, // Blue
  player2: { r: 0.9, g: 0.3, b: 0.2 }, // Red
} as const;

// =============================================================================
// TILE & GRID COLORS (RGB 0-1 range for Color3)
// =============================================================================

/** Light tile color (checkerboard pattern) */
export const TILE_COLOR_LIGHT = { r: 0.18, g: 0.22, b: 0.17 };

/** Dark tile color (checkerboard pattern) */
export const TILE_COLOR_DARK = { r: 0.12, g: 0.15, b: 0.11 };

/** Terrain block color (obstacles) */
export const TERRAIN_COLOR = { r: 0.4, g: 0.35, b: 0.3 };

// =============================================================================
// TILE HIGHLIGHT COLORS (RGB 0-1 range for Color3)
// =============================================================================

/** Selected/current position highlight (yellow) */
export const HIGHLIGHT_SELECTED = { r: 0.8, g: 0.8, b: 0.2 };

/** Valid move destination highlight (blue) */
export const HIGHLIGHT_VALID_MOVE = { r: 0.3, g: 0.6, b: 0.9 };

/** Attackable enemy highlight (red) */
export const HIGHLIGHT_ATTACKABLE = { r: 0.9, g: 0.3, b: 0.3 };

/** Healable ally highlight (green) */
export const HIGHLIGHT_HEALABLE = { r: 0.3, g: 0.9, b: 0.5 };

/** Blocked/no-LOS target highlight (gray) */
export const HIGHLIGHT_BLOCKED = { r: 0.4, g: 0.4, b: 0.4 };

// =============================================================================
// HP BAR COLORS (hex for GUI)
// =============================================================================

/** HP bar color when health > 60% */
export const HP_BAR_GREEN = "#44ff44";

/** HP bar color when health 30-60% */
export const HP_BAR_ORANGE = "#ffaa44";

/** HP bar color when health < 30% */
export const HP_BAR_RED = "#ff4444";

/** HP bar background */
export const HP_BAR_BACKGROUND = "#333333";

/** HP bar border */
export const HP_BAR_BORDER = "#000000";

// =============================================================================
// INTENT INDICATOR COLORS (RGB 0-1 range for Color3)
// =============================================================================

/** Attack intent indicator (red) */
export const INTENT_COLOR_ATTACK = { r: 0.9, g: 0.2, b: 0.2 };

/** Heal intent indicator (green) */
export const INTENT_COLOR_HEAL = { r: 0.2, g: 0.9, b: 0.3 };

/** Self-buff intent indicator (blue) - conceal/cover */
export const INTENT_COLOR_BUFF = { r: 0.2, g: 0.5, b: 0.9 };

// =============================================================================
// UNIT CLASS COLORS (RGB 0-1 range for Color3)
// Used for placeholder materials when models aren't loaded
// =============================================================================

export const UNIT_CLASS_COLORS = {
  soldier: { r: 0.3, g: 0.3, b: 0.8 },
  operator: { r: 0.8, g: 0.2, b: 0.2 },
  medic: { r: 0.2, g: 0.8, b: 0.3 },
} as const;

// =============================================================================
// SHADOW/PREVIEW ALPHA VALUES
// =============================================================================

/** Alpha for shadow base disc */
export const SHADOW_BASE_ALPHA = 0.4;

/** Alpha for shadow unit silhouette */
export const SHADOW_UNIT_ALPHA = 0.3;

/** Alpha for intent indicators */
export const INTENT_INDICATOR_ALPHA = 0.5;

/** Alpha for active cover borders */
export const COVER_ACTIVE_ALPHA = 0.4;

/** Alpha for cover preview borders */
export const COVER_PREVIEW_ALPHA = 0.2;

/** Alpha for concealed units */
export const CONCEAL_ALPHA = 0.4;

/** Emissive scale for concealed units */
export const CONCEAL_EMISSIVE_SCALE = 0.4;

// =============================================================================
// UI COLORS (hex strings for GUI)
// =============================================================================

export const UI_COLORS = {
  // Panel backgrounds
  panelBackground: "#1a1a2e",
  panelBackgroundLight: "#2a2a4e",
  previewBackground: "#3a3a4a",

  // Borders
  borderDefault: "#555588",
  borderSeparator: "#333355",

  // Button backgrounds
  buttonDefault: "#444444",
  buttonMove: "#335588",
  buttonAttack: "#883333",
  buttonAbility: "#338855",
  buttonConfirm: "#338833",
  buttonCancel: "#442222",
  buttonRandom: "#224466",

  // Text colors
  textPrimary: "#ffffff",
  textSecondary: "#aaaaaa",
  textMuted: "#888888",
  textError: "#ff6666",
  textSuccess: "#44ff44",

  // Player colors (for UI, not team selection)
  player1Accent: "#4488ff",
  player2Accent: "#ff8844",

  // Disabled state
  disabledAlpha: 0.3,
} as const;

// =============================================================================
// SCENE BACKGROUND COLORS (RGBA 0-1 range for Color4)
// =============================================================================

export const SCENE_BACKGROUNDS = {
  /** Start scene - deep blue-black */
  start: { r: 0.05, g: 0.05, b: 0.1, a: 1 },

  /** Title scene - warm black with subtle undertone */
  title: { r: 0.02, g: 0.01, b: 0.01, a: 1 },

  /** Loadout scene - dark blue-gray */
  loadout: { r: 0.08, g: 0.08, b: 0.12, a: 1 },

  /** Battle scene - dark blue-gray */
  battle: { r: 0.1, g: 0.1, b: 0.15, a: 1 },

  /** RTT preview background - lighter to see dark elements */
  rttPreview: { r: 0.3, g: 0.32, b: 0.38, a: 1 },
} as const;

// =============================================================================
// TITLE SCENE EMBER/FIRE COLORS
// =============================================================================

export const TITLE_HEAT_COLORS = [
  { r: 180, g: 50, b: 0 }, // Deep orange-red
  { r: 255, g: 80, b: 0 }, // Bright orange
  { r: 255, g: 120, b: 20 }, // Amber
] as const;

export const TITLE_TEXT_COLORS = {
  /** Main title line color (muted gold) */
  titleLine1: "rgba(232, 196, 160, 1)",

  /** Subtitle color (warm orange) */
  titleLine2: "rgba(255, 179, 102, 1)",

  /** Button text color */
  buttonText: "#b89070",

  /** Button hover text */
  buttonHover: "#ffd0a0",
} as const;
