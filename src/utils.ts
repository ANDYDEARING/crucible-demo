/**
 * utils.ts
 *
 * Shared utility functions used across multiple scenes.
 * This eliminates code duplication and provides a single source of truth.
 */

import { Color3 } from "@babylonjs/core";

// =============================================================================
// COLOR CONVERSION
// =============================================================================

/**
 * Convert a hex color string to a Babylon.js Color3
 *
 * @param hex - Hex color string (e.g., "#FF0000" or "#ff0000")
 * @returns Color3 with RGB values in 0-1 range
 *
 * @example
 * const red = hexToColor3("#FF0000"); // Color3(1, 0, 0)
 * const blue = hexToColor3("#0000ff"); // Color3(0, 0, 1)
 */
export function hexToColor3(hex: string): Color3 {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return new Color3(r, g, b);
}

/**
 * Convert a Color3 to a hex color string
 *
 * @param color - Babylon.js Color3
 * @returns Hex color string (e.g., "#ff0000")
 *
 * @example
 * const hex = color3ToHex(new Color3(1, 0, 0)); // "#ff0000"
 */
export function color3ToHex(color: Color3): string {
  const r = Math.round(color.r * 255)
    .toString(16)
    .padStart(2, "0");
  const g = Math.round(color.g * 255)
    .toString(16)
    .padStart(2, "0");
  const b = Math.round(color.b * 255)
    .toString(16)
    .padStart(2, "0");
  return `#${r}${g}${b}`;
}

/**
 * Convert RGB object (0-1 range) to Color3
 *
 * @param rgb - Object with r, g, b properties in 0-1 range
 * @returns Babylon.js Color3
 *
 * @example
 * const color = rgbToColor3({ r: 0.5, g: 0.5, b: 0.5 });
 */
export function rgbToColor3(rgb: { r: number; g: number; b: number }): Color3 {
  return new Color3(rgb.r, rgb.g, rgb.b);
}

// =============================================================================
// MATH UTILITIES
// =============================================================================

/**
 * Clamp a value between min and max
 *
 * @param value - Value to clamp
 * @param min - Minimum allowed value
 * @param max - Maximum allowed value
 * @returns Clamped value
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Linear interpolation between two values
 *
 * @param start - Starting value
 * @param end - Ending value
 * @param t - Interpolation factor (0-1)
 * @returns Interpolated value
 */
export function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

/**
 * Smoothstep easing function (smooth transition at both ends)
 *
 * @param t - Input value (0-1)
 * @returns Eased value (0-1)
 */
export function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * Ease-in-out quadratic function
 *
 * @param t - Input value (0-1)
 * @returns Eased value (0-1)
 */
export function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// =============================================================================
// GRID UTILITIES
// =============================================================================

/**
 * Create a grid coordinate key string for use in Maps/Sets
 *
 * @param x - X coordinate
 * @param z - Z coordinate
 * @returns String key (e.g., "3,5")
 */
export function gridKey(x: number, z: number): string {
  return `${x},${z}`;
}

/**
 * Parse a grid coordinate key back into x,z values
 *
 * @param key - Grid key string (e.g., "3,5")
 * @returns Tuple of [x, z] coordinates
 */
export function parseGridKey(key: string): [number, number] {
  const [x, z] = key.split(",").map(Number);
  return [x, z];
}

/**
 * Calculate Manhattan distance between two grid positions
 *
 * @param x1 - First position X
 * @param z1 - First position Z
 * @param x2 - Second position X
 * @param z2 - Second position Z
 * @returns Manhattan distance
 */
export function manhattanDistance(
  x1: number,
  z1: number,
  x2: number,
  z2: number
): number {
  return Math.abs(x2 - x1) + Math.abs(z2 - z1);
}

/**
 * Check if a position is within grid bounds
 *
 * @param x - X coordinate
 * @param z - Z coordinate
 * @param gridSize - Size of grid (assumes square)
 * @returns True if position is in bounds
 */
export function isInBounds(x: number, z: number, gridSize: number): boolean {
  return x >= 0 && x < gridSize && z >= 0 && z < gridSize;
}

// =============================================================================
// AUDIO UTILITIES
// =============================================================================

/**
 * Create and configure an audio element for music playback
 *
 * @param src - Audio file path
 * @param volume - Volume level (0-1)
 * @param loop - Whether to loop the audio
 * @param loopBuffer - Time before end to trigger manual loop (seconds)
 * @returns Configured HTMLAudioElement
 */
export function createMusicPlayer(
  src: string,
  volume: number,
  loop: boolean = true,
  loopBuffer: number = 0.5
): HTMLAudioElement {
  const audio = new Audio(src);
  audio.loop = loop;
  audio.volume = volume;

  // Manual loop handling for seamless playback
  if (loop && loopBuffer > 0) {
    audio.addEventListener("timeupdate", () => {
      if (audio.duration && audio.currentTime >= audio.duration - loopBuffer) {
        audio.currentTime = 0;
      }
    });
  }

  return audio;
}

/**
 * Play a sound effect from the beginning
 *
 * @param audio - Audio element to play
 */
export function playSfx(audio: HTMLAudioElement): void {
  audio.currentTime = 0;
  audio.play();
}

// =============================================================================
// RANDOM UTILITIES
// =============================================================================

/**
 * Get a random integer between min and max (inclusive)
 *
 * @param min - Minimum value
 * @param max - Maximum value
 * @returns Random integer
 */
export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Get a random element from an array
 *
 * @param array - Array to pick from
 * @returns Random element
 */
export function randomElement<T>(array: readonly T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

/**
 * Shuffle an array in place (Fisher-Yates algorithm)
 *
 * @param array - Array to shuffle
 * @returns The shuffled array (same reference)
 */
export function shuffle<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}
