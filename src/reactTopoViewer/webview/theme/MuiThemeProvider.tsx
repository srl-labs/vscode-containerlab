/**
 * MuiThemeProvider — environment-aware wrapper.
 *
 * - Detects whether we're running inside a real VS Code webview or the
 *   Vite dev view, and selects the appropriate theme factory.
 * - Detects light/dark mode by sampling --vscode-editor-background.
 * - Watches for theme changes via MutationObserver and re-renders.
 */
import React, { useState, useMemo, useEffect } from "react";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";

import { parseLuminance } from "../utils/color";

import { createVscodeTheme } from "./vscodeTheme";
import { createDevTheme } from "./devTheme";

type ColorMode = "light" | "dark";

/**
 * Detect whether we are running inside a real VS Code webview.
 * In dev mode the mock sets `window.vscode.__isDevMock__ = true`.
 */
function isRealVscodeWebview(): boolean {
  try {
    const vscode = (window as unknown as Record<string, unknown>).vscode;
    if (!vscode) return false;
    if ((vscode as Record<string, unknown>).__isDevMock__) return false;
    return true;
  } catch {
    return false;
  }
}


/**
 * Detect the current color scheme.
 *
 * Two completely separate strategies are used depending on the environment:
 *
 * - **Dev view**: The `html.light` class is the sole source of truth.
 *   CSS variables are injected by React / CssBaseline and lag behind the
 *   synchronous class toggle, so reading them at MutationObserver time
 *   would return the *previous* theme's value.
 *
 * - **VS Code webview**: The `--vscode-editor-background` CSS variable is
 *   authoritative — VS Code sets it on the body before the webview renders.
 */
function detectColorScheme(): ColorMode {
  if (!isRealVscodeWebview()) {
    // Dev view: html.light class toggled synchronously by dev toolbar
    return document.documentElement.classList.contains("light") ? "light" : "dark";
  }

  // VS Code webview: sample --vscode-editor-background
  try {
    const bg = window.getComputedStyle(document.body).getPropertyValue("--vscode-editor-background").trim();
    if (bg) {
      const lum = parseLuminance(bg);
      if (lum !== null) return lum > 0.5 ? "light" : "dark";
    }
  } catch {
    /* fall through */
  }

  return "dark";
}

export const MuiThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setMode] = useState<ColorMode>(detectColorScheme);
  const inVscode = useMemo(isRealVscodeWebview, []);

  // Watch for theme changes via MutationObserver
  useEffect(() => {
    const recheck = () => {
      const next = detectColorScheme();
      setMode((prev) => (prev !== next ? next : prev));
    };

    // VS Code updates body attributes; dev view toggles html.light on documentElement
    const observer = new MutationObserver(recheck);
    observer.observe(document.body, { attributes: true, attributeFilter: ["class", "style"] });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });

    return () => observer.disconnect();
  }, []);

  const theme = useMemo(
    () => (inVscode ? createVscodeTheme(mode) : createDevTheme(mode)),
    [inVscode, mode]
  );

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline enableColorScheme />
      {children}
    </ThemeProvider>
  );
};
