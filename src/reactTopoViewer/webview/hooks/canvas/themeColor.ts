export function readThemeColor(cssVar: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const bodyColor = window.getComputedStyle(document.body).getPropertyValue(cssVar).trim();
  if (bodyColor) return bodyColor;
  const rootColor = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue(cssVar)
    .trim();
  return rootColor || fallback;
}
