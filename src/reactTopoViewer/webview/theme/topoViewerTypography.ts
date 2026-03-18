// Shared TopoViewer typography tokens and helpers.
// These centralize semantic font sizes so UI chrome and canvas code can
// align to the same VS Code-derived baseline.

export const TOPOVIEWER_FONT_FAMILY_CSS_VAR = "--topoviewer-font-family" as const;
export const TOPOVIEWER_FONT_SCALE_CSS_VAR = "--topoviewer-font-scale" as const;

export const TOPOVIEWER_FONT_SIZE_CSS_VARS = {
  base: "--topoviewer-font-size-base",
  body: "--topoviewer-font-size-body",
  bodySmall: "--topoviewer-font-size-body-small",
  caption: "--topoviewer-font-size-caption",
  label: "--topoviewer-font-size-label",
  sectionTitle: "--topoviewer-font-size-section-title",
  dialogTitle: "--topoviewer-font-size-dialog-title",
  menu: "--topoviewer-font-size-menu",
  nodeLabel: "--topoviewer-font-size-node-label",
  edgeLabel: "--topoviewer-font-size-edge-label",
  iconInline: "--topoviewer-font-size-icon-inline",
  h6: "--topoviewer-font-size-h6",
  h5: "--topoviewer-font-size-h5",
  overline: "--topoviewer-font-size-overline"
} as const;

export type TopoViewerFontSizeToken = keyof typeof TOPOVIEWER_FONT_SIZE_CSS_VARS;

export const TOPOVIEWER_FONT_SIZE_FALLBACK_PX: Record<TopoViewerFontSizeToken, number> = {
  base: 13,
  body: 13,
  bodySmall: 12.35,
  caption: 11.96,
  label: 13,
  sectionTitle: 14.04,
  dialogTitle: 14.95,
  menu: 12.48,
  nodeLabel: 12.35,
  edgeLabel: 12.35,
  iconInline: 14.95,
  h6: 18.98,
  h5: 21.97,
  overline: 11.96
};

function toCssPx(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return `${rounded}px`;
}

function cssVarWithFallback(cssVar: string, fallback: string): string {
  return `var(${cssVar}, ${fallback})`;
}

function readCssVarValue(cssVar: string): string {
  if (typeof window === "undefined") return "";
  const bodyValue = window.getComputedStyle(document.body).getPropertyValue(cssVar).trim();
  if (bodyValue.length > 0) return bodyValue;
  return window.getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
}

function resolveCssLengthPx(value: string): number | null {
  const trimmedValue = value.trim();
  const parsed = Number.parseFloat(value);
  if (Number.isFinite(parsed) && /^-?\d*\.?\d+px$/.test(trimmedValue)) {
    return parsed;
  }

  if (typeof window === "undefined" || typeof document === "undefined") {
    return null;
  }

  const target = document.body;

  const probe = document.createElement("div");
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  probe.style.pointerEvents = "none";
  probe.style.overflow = "hidden";
  probe.style.height = "0";
  probe.style.width = value;
  target.appendChild(probe);
  const resolved = Number.parseFloat(window.getComputedStyle(probe).width);
  target.removeChild(probe);

  return Number.isFinite(resolved) ? resolved : null;
}

export function getTopoViewerFontSizeVar(token: TopoViewerFontSizeToken): string {
  return TOPOVIEWER_FONT_SIZE_CSS_VARS[token];
}

export function getTopoViewerFontSizeCssValue(token: TopoViewerFontSizeToken): string {
  return cssVarWithFallback(
    getTopoViewerFontSizeVar(token),
    toCssPx(TOPOVIEWER_FONT_SIZE_FALLBACK_PX[token])
  );
}

export function readTopoViewerFontSizePx(
  token: TopoViewerFontSizeToken,
  fallback = TOPOVIEWER_FONT_SIZE_FALLBACK_PX[token]
): number {
  const resolved = resolveCssLengthPx(readCssVarValue(getTopoViewerFontSizeVar(token)));
  return resolved ?? fallback;
}

export const topoViewerFontFamilies = {
  ui: cssVarWithFallback(TOPOVIEWER_FONT_FAMILY_CSS_VAR, "'Roboto', sans-serif"),
  mono: "var(--vscode-editor-font-family, Consolas, Monaco, 'Courier New', monospace)"
} as const;

export const topoViewerTypography = {
  fontFamily: topoViewerFontFamilies.ui,
  base: getTopoViewerFontSizeCssValue("base"),
  body: getTopoViewerFontSizeCssValue("body"),
  bodySmall: getTopoViewerFontSizeCssValue("bodySmall"),
  caption: getTopoViewerFontSizeCssValue("caption"),
  label: getTopoViewerFontSizeCssValue("label"),
  sectionTitle: getTopoViewerFontSizeCssValue("sectionTitle"),
  dialogTitle: getTopoViewerFontSizeCssValue("dialogTitle"),
  menu: getTopoViewerFontSizeCssValue("menu"),
  nodeLabel: getTopoViewerFontSizeCssValue("nodeLabel"),
  edgeLabel: getTopoViewerFontSizeCssValue("edgeLabel"),
  iconInline: getTopoViewerFontSizeCssValue("iconInline"),
  h6: getTopoViewerFontSizeCssValue("h6"),
  h5: getTopoViewerFontSizeCssValue("h5"),
  overline: getTopoViewerFontSizeCssValue("overline")
} as const;
