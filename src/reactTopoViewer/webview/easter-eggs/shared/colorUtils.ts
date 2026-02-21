/**
 * Shared color utilities for Easter Egg modes
 */

import type { RGBColor } from "./types";

/**
 * Interpolate between two colors
 */
export function lerpColor(c1: RGBColor, c2: RGBColor, t: number): RGBColor {
  return {
    r: Math.round(c1.r + (c2.r - c1.r) * t),
    g: Math.round(c1.g + (c2.g - c1.g) * t),
    b: Math.round(c1.b + (c2.b - c1.b) * t)
  };
}
