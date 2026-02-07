/**
 * Standalone dev theme — uses real hex values instead of CSS variables.
 * Injects --vscode-* CSS custom properties via CssBaseline :root overrides
 * so that sx props referencing var(--vscode-*) still resolve correctly
 * in the Vite dev view.
 */
import { createTheme, type ThemeOptions } from "@mui/material/styles";
import deepmerge from "@mui/utils/deepmerge";

import { getBaseOverrides } from "./baseOverrides";
import type { ThemeColors } from "./baseOverrides";

/** Map of --vscode-* variable name → value, per mode. */
interface VarMap {
  [cssVar: string]: string;
}

// ---------------------------------------------------------------------------
// Dark palette
// ---------------------------------------------------------------------------
const DARK_VARS: VarMap = {
  "--vscode-editor-background": "#1e1e1e",
  "--vscode-editor-foreground": "#cccccc",
  "--vscode-sideBar-background": "#252526",
  "--vscode-sideBar-foreground": "#cccccc",
  "--vscode-panel-background": "#1e1e1e",
  "--vscode-panel-border": "#3c3c3c",
  "--vscode-button-background": "#0e639c",
  "--vscode-button-foreground": "#ffffff",
  "--vscode-button-hoverBackground": "#1177bb",
  "--vscode-button-secondaryBackground": "#3a3d41",
  "--vscode-button-secondaryForeground": "#ffffff",
  "--vscode-button-secondaryHoverBackground": "#45494e",
  "--vscode-input-background": "#3c3c3c",
  "--vscode-input-foreground": "#cccccc",
  "--vscode-input-border": "#3c3c3c",
  "--vscode-input-placeholderForeground": "#a6a6a6",
  "--vscode-dropdown-background": "#3c3c3c",
  "--vscode-dropdown-foreground": "#f0f0f0",
  "--vscode-dropdown-border": "#3c3c3c",
  "--vscode-focusBorder": "#007fd4",
  "--vscode-foreground": "#cccccc",
  "--vscode-descriptionForeground": "#9d9d9d",
  "--vscode-errorForeground": "#f48771",
  "--vscode-icon-foreground": "#c5c5c5",
  "--vscode-list-hoverBackground": "#2a2d2e",
  "--vscode-list-activeSelectionBackground": "#094771",
  "--vscode-list-activeSelectionForeground": "#ffffff",
  "--vscode-badge-background": "#4d4d4d",
  "--vscode-badge-foreground": "#ffffff",
  "--vscode-scrollbarSlider-background": "rgba(121, 121, 121, 0.4)",
  "--vscode-scrollbarSlider-hoverBackground": "rgba(100, 100, 100, 0.7)",
  "--vscode-scrollbarSlider-activeBackground": "rgba(191, 191, 191, 0.4)",
  "--vscode-statusBar-background": "#007acc",
  "--vscode-statusBar-foreground": "#ffffff",
  "--vscode-tab-activeBackground": "#1e1e1e",
  "--vscode-tab-activeForeground": "#ffffff",
  "--vscode-tab-inactiveBackground": "#2d2d2d",
  "--vscode-tab-inactiveForeground": "#ffffff80",
  "--vscode-tab-activeBorderTop": "#007fd4",
  "--vscode-tab-hoverBackground": "#2a2d2e",
  "--vscode-textLink-foreground": "#3794ff",
  "--vscode-textLink-activeForeground": "#3794ff",
  "--vscode-textCodeBlock-background": "#2d2d2d",
  "--vscode-settings-textInputBackground": "#292929",
  "--vscode-settings-textInputForeground": "#cccccc",
  "--vscode-settings-textInputBorder": "transparent",
  "--vscode-notifications-background": "#252526",
  "--vscode-notifications-foreground": "#cccccc",
  "--vscode-notifications-border": "#3c3c3c",
  "--vscode-disabledForeground": "#6a6a6a",
  "--vscode-checkbox-border": "#c5c5c5",
  "--vscode-editorWidget-background": "#252526",
  "--vscode-editorWidget-foreground": "#cccccc",
  "--vscode-editorWidget-border": "#3c3c3c",
  "--vscode-widget-shadow": "rgba(0, 0, 0, 0.36)",
  "--vscode-menu-background": "#3c3c3c",
  "--vscode-menu-foreground": "#f0f0f0",
  "--vscode-menu-border": "#3c3c3c",
  "--vscode-menu-selectionBackground": "#094771",
  "--vscode-menu-selectionForeground": "#ffffff",
  "--vscode-inputValidation-errorBackground": "#5a1d1d",
  "--vscode-inputValidation-errorBorder": "#be1100",
  "--vscode-inputValidation-warningBackground": "#352a05",
  "--vscode-inputValidation-warningBorder": "#9d8600",
  "--vscode-inputValidation-infoBackground": "#063b49",
  "--vscode-inputValidation-infoBorder": "#007acc",
  "--vscode-testing-iconPassed": "#73c991",
  "--vscode-progressBar-background": "#0e70c0",
  "--vscode-editorError-foreground": "#f48771",
  "--vscode-font-family": "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  "--vscode-font-size": "13px"
};

// ---------------------------------------------------------------------------
// Light palette
// ---------------------------------------------------------------------------
const LIGHT_VARS: VarMap = {
  "--vscode-editor-background": "#ffffff",
  "--vscode-editor-foreground": "#333333",
  "--vscode-sideBar-background": "#f3f3f3",
  "--vscode-sideBar-foreground": "#333333",
  "--vscode-panel-background": "#ffffff",
  "--vscode-panel-border": "#e7e7e7",
  "--vscode-button-background": "#007acc",
  "--vscode-button-foreground": "#ffffff",
  "--vscode-button-hoverBackground": "#0062a3",
  "--vscode-button-secondaryBackground": "#5f6a79",
  "--vscode-button-secondaryForeground": "#ffffff",
  "--vscode-button-secondaryHoverBackground": "#4c5561",
  "--vscode-input-background": "#ffffff",
  "--vscode-input-foreground": "#333333",
  "--vscode-input-border": "#cecece",
  "--vscode-input-placeholderForeground": "#767676",
  "--vscode-dropdown-background": "#ffffff",
  "--vscode-dropdown-foreground": "#333333",
  "--vscode-dropdown-border": "#cecece",
  "--vscode-focusBorder": "#0090f1",
  "--vscode-foreground": "#333333",
  "--vscode-descriptionForeground": "#717171",
  "--vscode-errorForeground": "#a1260d",
  "--vscode-icon-foreground": "#424242",
  "--vscode-list-hoverBackground": "#e8e8e8",
  "--vscode-list-activeSelectionBackground": "#0060c0",
  "--vscode-list-activeSelectionForeground": "#ffffff",
  "--vscode-badge-background": "#c4c4c4",
  "--vscode-badge-foreground": "#333333",
  "--vscode-scrollbarSlider-background": "rgba(100, 100, 100, 0.4)",
  "--vscode-scrollbarSlider-hoverBackground": "rgba(100, 100, 100, 0.7)",
  "--vscode-scrollbarSlider-activeBackground": "rgba(0, 0, 0, 0.6)",
  "--vscode-statusBar-background": "#007acc",
  "--vscode-statusBar-foreground": "#ffffff",
  "--vscode-tab-activeBackground": "#ffffff",
  "--vscode-tab-activeForeground": "#333333",
  "--vscode-tab-inactiveBackground": "#ececec",
  "--vscode-tab-inactiveForeground": "#33333380",
  "--vscode-tab-activeBorderTop": "#0090f1",
  "--vscode-tab-hoverBackground": "#e8e8e8",
  "--vscode-textLink-foreground": "#006ab1",
  "--vscode-textLink-activeForeground": "#006ab1",
  "--vscode-textCodeBlock-background": "#f3f3f3",
  "--vscode-settings-textInputBackground": "#ffffff",
  "--vscode-settings-textInputForeground": "#333333",
  "--vscode-settings-textInputBorder": "#cecece",
  "--vscode-notifications-background": "#f3f3f3",
  "--vscode-notifications-foreground": "#333333",
  "--vscode-notifications-border": "#e7e7e7",
  "--vscode-disabledForeground": "#999999",
  "--vscode-checkbox-border": "#424242",
  "--vscode-editorWidget-background": "#f3f3f3",
  "--vscode-editorWidget-foreground": "#333333",
  "--vscode-editorWidget-border": "#cecece",
  "--vscode-widget-shadow": "rgba(0, 0, 0, 0.16)",
  "--vscode-menu-background": "#ffffff",
  "--vscode-menu-foreground": "#333333",
  "--vscode-menu-border": "#cecece",
  "--vscode-menu-selectionBackground": "#0060c0",
  "--vscode-menu-selectionForeground": "#ffffff",
  "--vscode-inputValidation-errorBackground": "#fce4e4",
  "--vscode-inputValidation-errorBorder": "#be1100",
  "--vscode-inputValidation-warningBackground": "#fefce4",
  "--vscode-inputValidation-warningBorder": "#9d8600",
  "--vscode-inputValidation-infoBackground": "#e6f3fb",
  "--vscode-inputValidation-infoBorder": "#007acc",
  "--vscode-testing-iconPassed": "#388a34",
  "--vscode-progressBar-background": "#007acc",
  "--vscode-editorError-foreground": "#a1260d",
  "--vscode-font-family": "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  "--vscode-font-size": "13px"
};

/** Convert a VarMap to ThemeColors by reading the concrete values. */
function buildColors(vars: VarMap): ThemeColors {
  return {
    editorBg: vars["--vscode-editor-background"],
    editorFg: vars["--vscode-editor-foreground"],
    sideBarBg: vars["--vscode-sideBar-background"],
    panelBorder: vars["--vscode-panel-border"],
    buttonBg: vars["--vscode-button-background"],
    buttonFg: vars["--vscode-button-foreground"],
    buttonHoverBg: vars["--vscode-button-hoverBackground"],
    buttonBorder: vars["--vscode-panel-border"],
    buttonSecondaryFg: vars["--vscode-foreground"],
    buttonSecondaryHoverBg: vars["--vscode-list-hoverBackground"],
    inputBg: vars["--vscode-input-background"],
    inputFg: vars["--vscode-input-foreground"],
    inputBorder: vars["--vscode-input-border"],
    inputPlaceholderFg: vars["--vscode-input-placeholderForeground"],
    focusBorder: vars["--vscode-focusBorder"],
    foreground: vars["--vscode-foreground"],
    descriptionFg: vars["--vscode-descriptionForeground"],
    errorFg: vars["--vscode-errorForeground"],
    iconFg: vars["--vscode-icon-foreground"],
    listHoverBg: vars["--vscode-list-hoverBackground"],
    listActiveSelectionBg: vars["--vscode-list-activeSelectionBackground"],
    listActiveSelectionFg: vars["--vscode-list-activeSelectionForeground"],
    badgeBg: vars["--vscode-badge-background"],
    badgeFg: vars["--vscode-badge-foreground"],
    textLinkFg: vars["--vscode-textLink-foreground"],
    textLinkActiveFg: vars["--vscode-textLink-activeForeground"],
    disabledFg: vars["--vscode-disabledForeground"],
    dropdownBg: vars["--vscode-dropdown-background"],
    dropdownFg: vars["--vscode-dropdown-foreground"],
    dropdownBorder: vars["--vscode-dropdown-border"],
    menuBg: vars["--vscode-menu-background"],
    menuBorder: vars["--vscode-menu-border"],
    menuFg: vars["--vscode-menu-foreground"],
    menuSelectionBg: vars["--vscode-menu-selectionBackground"],
    menuSelectionFg: vars["--vscode-menu-selectionForeground"],
    tabActiveBorderTop: vars["--vscode-tab-activeBorderTop"],
    tabActiveFg: vars["--vscode-tab-activeForeground"],
    tabInactiveFg: vars["--vscode-tab-inactiveForeground"],
    tabHoverBg: vars["--vscode-tab-hoverBackground"],
    widgetShadow: vars["--vscode-widget-shadow"],
    widgetBg: vars["--vscode-editorWidget-background"],
    widgetFg: vars["--vscode-editorWidget-foreground"],
    widgetBorder: vars["--vscode-editorWidget-border"],
    validationErrorBg: vars["--vscode-inputValidation-errorBackground"],
    validationErrorBorder: vars["--vscode-inputValidation-errorBorder"],
    validationWarningBg: vars["--vscode-inputValidation-warningBackground"],
    validationWarningBorder: vars["--vscode-inputValidation-warningBorder"],
    validationInfoBg: vars["--vscode-inputValidation-infoBackground"],
    validationInfoBorder: vars["--vscode-inputValidation-infoBorder"],
    testingIconPassed: vars["--vscode-testing-iconPassed"],
    checkboxBorder: vars["--vscode-checkbox-border"],
    progressBarBg: vars["--vscode-progressBar-background"],
    notificationsBg: vars["--vscode-notifications-background"],
    notificationsFg: vars["--vscode-notifications-foreground"],
    notificationsBorder: vars["--vscode-notifications-border"],
    scrollbarSliderBg: vars["--vscode-scrollbarSlider-background"],
    scrollbarSliderHoverBg: vars["--vscode-scrollbarSlider-hoverBackground"],
    scrollbarSliderActiveBg: vars["--vscode-scrollbarSlider-activeBackground"]
  };
}

/** Build a CSS-property object for `:root` injection from a VarMap. */
function buildRootVarStyles(vars: VarMap): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(vars)) {
    out[k] = v;
  }
  return out;
}

/**
 * Create a standalone dev theme for the Vite HMR dev view.
 * Injects `--vscode-*` custom properties via CssBaseline `:root` overrides
 * so that component sx props referencing CSS variables still resolve.
 */
export function createDevTheme(mode: "light" | "dark") {
  const vars = mode === "light" ? LIGHT_VARS : DARK_VARS;
  const colors = buildColors(vars);
  const baseOverrides = getBaseOverrides(colors);

  // Deep-merge CssBaseline to add :root CSS variable injection
  const baseStyleOverrides =
    (baseOverrides.MuiCssBaseline as Record<string, unknown>)?.styleOverrides ?? {};
  const cssBaselineOverride: ThemeOptions["components"] = {
    MuiCssBaseline: {
      styleOverrides: deepmerge(
        baseStyleOverrides as Record<string, unknown>,
        { ":root": buildRootVarStyles(vars) }
      ) as Record<string, unknown>
    }
  };

  return createTheme({
    palette: { mode },
    typography: {
      fontFamily: vars["--vscode-font-family"],
      fontSize: 13
    },
    shape: { borderRadius: 4 },
    components: deepmerge(baseOverrides, cssBaselineOverride) as ThemeOptions["components"]
  });
}
