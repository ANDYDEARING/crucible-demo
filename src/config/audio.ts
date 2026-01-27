/**
 * audio.ts
 *
 * Centralized audio configuration including file paths and volume settings.
 * All audio assets should be referenced through this file.
 */

// =============================================================================
// MUSIC TRACKS
// =============================================================================

const BASE = import.meta.env.BASE_URL;

export const MUSIC = {
  /** Title screen background music */
  title: `${BASE}audio/rise_above_loop_v3.m4a`,

  /** Loadout/team builder screen music */
  loadout: `${BASE}audio/Loadout.m4a`,

  /** Battle scene background music */
  battle: `${BASE}audio/battle_v2.m4a`,
} as const;

// =============================================================================
// SOUND EFFECTS
// =============================================================================

export const SFX = {
  /** Light hit sound (for conceal break, light damage) */
  hitLight: `${BASE}audio/effects/hit-light.flac`,

  /** Medium hit sound (for ranged attacks) */
  hitMedium: `${BASE}audio/effects/hit-medium.flac`,

  /** Heavy hit sound (for melee attacks) */
  hitHeavy: `${BASE}audio/effects/hit-heavy.flac`,

  /** Healing sound effect */
  heal: `${BASE}audio/effects/Cure1.wav`,
} as const;

// =============================================================================
// VOLUME SETTINGS
// =============================================================================

export const AUDIO_VOLUMES = {
  /** Default music volume (0-1) */
  music: 0.5,

  /** Default sound effects volume (0-1) */
  sfx: 0.6,
} as const;

// =============================================================================
// LOOP HANDLING
// =============================================================================

/**
 * Time before end of track to trigger manual loop (seconds)
 * This helps with seamless looping on tracks that don't loop perfectly
 */
export const LOOP_BUFFER_TIME = 0.5;

/**
 * Skip offset for testing loops (seconds before end)
 * Press 'S' in title/loadout screens to skip near end
 */
export const DEBUG_SKIP_OFFSET = 10;
