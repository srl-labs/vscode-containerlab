/**
 * Frequency utilities for audio easter eggs
 *
 * Provides unified scale frequency lookup for different keys.
 */

import type { ScaleDefinition } from './types';

/**
 * Get frequency for a scale degree in the given scale
 *
 * @param scaleDegree - Scale degree 1-7
 * @param octave - Octave offset (0 = base octave)
 * @param scale - Scale definition mapping octave to frequencies
 * @param fallbackFreq - Fallback frequency if lookup fails (default: 440Hz)
 * @returns Frequency in Hz
 */
export function getScaleFrequency(
  scaleDegree: number,
  octave: number,
  scale: ScaleDefinition,
  fallbackFreq = 440
): number {
  const scaleIndex = scaleDegree - 1; // Convert 1-7 to 0-6
  const frequencies = scale[octave];
  if (!frequencies || scaleIndex < 0 || scaleIndex >= 7) {
    // Try base octave as fallback
    const baseFreqs = scale[0];
    if (baseFreqs && scaleIndex >= 0 && scaleIndex < 7) {
      return baseFreqs[scaleIndex];
    }
    return fallbackFreq;
  }
  return frequencies[scaleIndex];
}

/**
 * A minor scale frequencies
 * Scale degrees: 1=A, 2=B, 3=C, 4=D, 5=E, 6=F, 7=G
 */
export const A_MINOR_SCALE: ScaleDefinition = {
  [-2]: [55.0, 61.74, 65.41, 73.42, 82.41, 87.31, 98.0],
  [-1]: [110.0, 123.47, 130.81, 146.83, 164.81, 174.61, 196.0],
  [0]: [220.0, 246.94, 261.63, 293.66, 329.63, 349.23, 392.0],
  [1]: [440.0, 493.88, 523.25, 587.33, 659.25, 698.46, 783.99],
};

/**
 * B minor scale frequencies
 * Scale degrees: 1=B, 2=C#, 3=D, 4=E, 5=F#, 6=G, 7=A
 */
export const B_MINOR_SCALE: ScaleDefinition = {
  [-3]: [30.87, 34.65, 36.71, 41.20, 46.25, 49.00, 55.00],
  [-2]: [61.74, 69.30, 73.42, 82.41, 92.50, 98.00, 110.00],
  [-1]: [123.47, 138.59, 146.83, 164.81, 185.00, 196.00, 220.00],
  [0]: [246.94, 277.18, 293.66, 329.63, 369.99, 392.00, 440.00],
  [1]: [493.88, 554.37, 587.33, 659.25, 739.99, 783.99, 880.00],
  [2]: [987.77, 1108.73, 1174.66, 1318.51, 1479.98, 1567.98, 1760.00],
};

/**
 * C minor scale frequencies
 * Scale degrees: 1=C, 2=D, 3=Eb, 4=F, 5=G, 6=Ab, 7=Bb
 */
export const C_MINOR_SCALE: ScaleDefinition = {
  [3]: [130.81, 146.83, 155.56, 174.61, 196.0, 207.65, 233.08],
  [4]: [261.63, 293.66, 311.13, 349.23, 392.0, 415.30, 466.16],
  [5]: [523.25, 587.33, 622.25, 698.46, 783.99, 830.61, 932.33],
  [6]: [1046.50, 1174.66, 1244.51, 0, 0, 0, 1864.66], // Sparse - only some notes defined
};

/**
 * C minor specific note lookup (for Aquatic Ambience with different octave scheme)
 *
 * The original implementation uses octave offsets from 4 as base,
 * so we provide a wrapper that matches that behavior.
 */
export function getCMinorFrequency(scaleDegree: string | number, octaveOffset: number): number {
  const sd = typeof scaleDegree === 'string' ? parseInt(scaleDegree, 10) : scaleDegree;
  const baseOctave = 4;
  const actualOctave = baseOctave + octaveOffset;
  return getScaleFrequency(sd, actualOctave, C_MINOR_SCALE, 261.63);
}

/**
 * Get A minor frequency helper
 */
export function getAMinorFrequency(scaleDegree: number, octave: number): number {
  return getScaleFrequency(scaleDegree, octave, A_MINOR_SCALE, 220);
}

/**
 * Get B minor frequency helper
 */
export function getBMinorFrequency(scaleDegree: number, octave: number): number {
  return getScaleFrequency(scaleDegree, octave, B_MINOR_SCALE, 246.94);
}

/**
 * F# minor scale frequencies
 * Scale degrees: 1=F#, 2=G#, 3=A, 4=B, 5=C#, 6=D, 7=E
 */
export const F_SHARP_MINOR_SCALE: ScaleDefinition = {
  [-2]: [46.25, 51.91, 55.0, 61.74, 69.30, 73.42, 82.41],
  [-1]: [92.50, 103.83, 110.0, 123.47, 138.59, 146.83, 164.81],
  [0]: [185.0, 207.65, 220.0, 246.94, 277.18, 293.66, 329.63],
  [1]: [369.99, 415.30, 440.0, 493.88, 554.37, 587.33, 659.25],
  [2]: [739.99, 830.61, 880.0, 987.77, 1108.73, 1174.66, 1318.51],
};

/**
 * Get F# minor frequency helper
 */
export function getFSharpMinorFrequency(scaleDegree: number, octave: number): number {
  return getScaleFrequency(scaleDegree, octave, F_SHARP_MINOR_SCALE, 185.0);
}
