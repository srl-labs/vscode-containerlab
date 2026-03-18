export const TOPOVIEWER_FONT_SCALE_DEFAULT = 1;
export const TOPOVIEWER_FONT_SCALE_MIN = 0.85;
export const TOPOVIEWER_FONT_SCALE_MAX = 1.4;

export function clampTopoViewerFontScale(value: number): number {
  return Math.min(TOPOVIEWER_FONT_SCALE_MAX, Math.max(TOPOVIEWER_FONT_SCALE_MIN, value));
}

export function resolveTopoViewerFontScale(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return TOPOVIEWER_FONT_SCALE_DEFAULT;
  }

  return clampTopoViewerFontScale(value);
}
