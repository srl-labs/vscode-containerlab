/**
 * Shared color utilities for annotation components
 */

/**
 * Apply alpha transparency to a color.
 * Supports hex colors (#RRGGBB). Falls back to returning original color for other formats.
 */
export function applyAlphaToColor(color: string, alpha: number): string {
  const normalizedAlpha = Math.min(1, Math.max(0, alpha));
  const hexMatch = /^#([0-9a-f]{6})$/i.exec(color);
  if (hexMatch) {
    const r = parseInt(hexMatch[1].slice(0, 2), 16);
    const g = parseInt(hexMatch[1].slice(2, 4), 16);
    const b = parseInt(hexMatch[1].slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${normalizedAlpha})`;
  }
  return color;
}
