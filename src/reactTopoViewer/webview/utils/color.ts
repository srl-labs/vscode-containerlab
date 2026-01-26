/**
 * Color normalization helpers for form inputs and annotation persistence.
 */
import type { FreeShapeAnnotation } from "../../shared/types/topology";

function clampByte(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(255, Math.max(0, value));
}

function toHexByte(value: number): string {
  return clampByte(value).toString(16).padStart(2, "0");
}

function expandShortHex(value: string): string {
  const hex = value.replace("#", "");
  return `#${hex
    .split("")
    .map((ch) => `${ch}${ch}`)
    .join("")}`;
}

function parseRgb(value: string): { hex: string; alpha?: number } | null {
  const match = value.match(
    /^rgba?\(\s*([0-9]+)\s*,\s*([0-9]+)\s*,\s*([0-9]+)\s*(?:,\s*([0-9]*\.?[0-9]+)\s*)?\)$/i
  );
  if (!match) return null;
  const r = parseInt(match[1], 10);
  const g = parseInt(match[2], 10);
  const b = parseInt(match[3], 10);
  const alphaRaw = match[4] !== undefined ? parseFloat(match[4]) : undefined;
  const alpha = alphaRaw !== undefined ? Math.min(1, Math.max(0, alphaRaw)) : undefined;
  return { hex: `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}`, alpha };
}

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

export function normalizeHexColor(value: string | undefined, fallback = "#000000"): string {
  if (!value) return fallback;
  const trimmed = value.trim();
  if (trimmed.startsWith("#")) {
    const hex = trimmed.toLowerCase();
    if (hex.length === 4) return expandShortHex(hex);
    if (hex.length === 7) return hex;
    if (hex.length === 9) return hex.slice(0, 7);
    if (hex.length === 5) return expandShortHex(hex.slice(0, 4));
    return fallback;
  }
  const rgb = parseRgb(trimmed);
  if (rgb) return rgb.hex;
  return fallback;
}

export function normalizeShapeAnnotationColors(
  annotation: FreeShapeAnnotation
): FreeShapeAnnotation {
  const hasFillColor = annotation.fillColor !== undefined;
  const fill = hasFillColor && annotation.fillColor ? parseRgb(annotation.fillColor) : null;
  const fillColor = hasFillColor
    ? normalizeHexColor(annotation.fillColor, "#ffffff")
    : annotation.fillColor;
  const fillOpacity = annotation.fillOpacity ?? fill?.alpha;

  return {
    ...annotation,
    fillColor,
    fillOpacity,
    borderColor: annotation.borderColor
      ? normalizeHexColor(annotation.borderColor, "#000000")
      : annotation.borderColor
  };
}
