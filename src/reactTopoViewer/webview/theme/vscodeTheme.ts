// VS Code MUI theme config.
// Palette values are CSS var() references — VS Code swaps them for light/dark.
import { createTheme, type ThemeOptions } from "@mui/material/styles";
import { TOPOVIEWER_FONT_SCALE_DEFAULT } from "../../shared/constants/topoViewerFontScale";

import {
  TOPOVIEWER_FONT_FAMILY_CSS_VAR,
  TOPOVIEWER_FONT_SCALE_CSS_VAR,
  TOPOVIEWER_FONT_SIZE_CSS_VARS,
  topoViewerTypography
} from "./topoViewerTypography";

const BUTTON_BACKGROUND = "var(--vscode-button-background)";
const BUTTON_SECONDARY_BACKGROUND = "var(--vscode-button-secondaryBackground)";
const EDITOR_ERROR_FOREGROUND = "var(--vscode-editorError-foreground)";
const EDITOR_WARNING_FOREGROUND = "var(--vscode-editorWarning-foreground)";
const EDITOR_INFO_FOREGROUND = "var(--vscode-editorInfo-foreground)";
const TESTING_ICON_PASSED = "var(--vscode-testing-iconPassed, var(--vscode-charts-green))";
const FOCUS_BORDER = "var(--vscode-focusBorder)";
const EXPLORER_FONT_FAMILY =
  "var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif)";
const EXPLORER_FONT_SIZE_BASE = "var(--vscode-font-size, 13px)";
const EXPLORER_FONT_SIZE_SCALED = `calc(${EXPLORER_FONT_SIZE_BASE} * var(${TOPOVIEWER_FONT_SCALE_CSS_VAR}, ${TOPOVIEWER_FONT_SCALE_DEFAULT}))`;
const EXPLORER_BODY_SCOPE_SELECTORS = ["body[data-webview-kind='containerlab-explorer']"] as const;
const EXPLORER_SCOPE_SELECTORS = [
  "body[data-webview-kind='containerlab-explorer']",
  ".containerlab-explorer-root"
] as const;
const TOPOVIEWER_SCOPE_SELECTORS = ["body[data-webview-kind='containerlab-topoviewer']"] as const;

const explorerBodyScopedSelector = (suffix: string) =>
  EXPLORER_BODY_SCOPE_SELECTORS.map((selector) => `${selector}${suffix}`).join(", ");
const explorerScopedSelector = (suffix: string) =>
  EXPLORER_SCOPE_SELECTORS.map((selector) => `${selector}${suffix}`).join(", ");
const topoviewerScopedSelector = (suffix: string) =>
  TOPOVIEWER_SCOPE_SELECTORS.map((selector) => `${selector}${suffix}`).join(", ");

const buildPaletteColor = (main: string, contrastText: string) => ({
  main,
  dark: main,
  light: main,
  contrastText
});

const buildScopedFontSizeVars = (baseSize: string) => ({
  [TOPOVIEWER_FONT_SIZE_CSS_VARS.base]: baseSize,
  [TOPOVIEWER_FONT_SIZE_CSS_VARS.body]: `var(${TOPOVIEWER_FONT_SIZE_CSS_VARS.base})`,
  [TOPOVIEWER_FONT_SIZE_CSS_VARS.bodySmall]: `calc(var(${TOPOVIEWER_FONT_SIZE_CSS_VARS.base}) * 0.95)`,
  [TOPOVIEWER_FONT_SIZE_CSS_VARS.caption]: `calc(var(${TOPOVIEWER_FONT_SIZE_CSS_VARS.base}) * 0.92)`,
  [TOPOVIEWER_FONT_SIZE_CSS_VARS.label]: `var(${TOPOVIEWER_FONT_SIZE_CSS_VARS.base})`,
  [TOPOVIEWER_FONT_SIZE_CSS_VARS.sectionTitle]: `calc(var(${TOPOVIEWER_FONT_SIZE_CSS_VARS.base}) * 1.08)`,
  [TOPOVIEWER_FONT_SIZE_CSS_VARS.dialogTitle]: `calc(var(${TOPOVIEWER_FONT_SIZE_CSS_VARS.base}) * 1.15)`,
  [TOPOVIEWER_FONT_SIZE_CSS_VARS.menu]: `calc(var(${TOPOVIEWER_FONT_SIZE_CSS_VARS.base}) * 0.96)`,
  [TOPOVIEWER_FONT_SIZE_CSS_VARS.nodeLabel]: `calc(var(${TOPOVIEWER_FONT_SIZE_CSS_VARS.base}) * 0.95)`,
  [TOPOVIEWER_FONT_SIZE_CSS_VARS.edgeLabel]: `calc(var(${TOPOVIEWER_FONT_SIZE_CSS_VARS.base}) * 0.95)`,
  [TOPOVIEWER_FONT_SIZE_CSS_VARS.iconInline]: `calc(var(${TOPOVIEWER_FONT_SIZE_CSS_VARS.base}) * 1.15)`,
  [TOPOVIEWER_FONT_SIZE_CSS_VARS.overline]: `var(${TOPOVIEWER_FONT_SIZE_CSS_VARS.caption})`,
  [TOPOVIEWER_FONT_SIZE_CSS_VARS.h6]: `calc(var(${TOPOVIEWER_FONT_SIZE_CSS_VARS.base}) * 1.46)`,
  [TOPOVIEWER_FONT_SIZE_CSS_VARS.h5]: `calc(var(${TOPOVIEWER_FONT_SIZE_CSS_VARS.base}) * 1.69)`
});

// Palette — single source of truth for all colors.
// dark/light repeat main to prevent createTheme from deriving them (crashes on CSS vars).
export const vscodePalette = {
  divider: "var(--vscode-panel-border)",
  background: {
    default: "var(--vscode-editor-background)",
    paper: "var(--vscode-sideBar-background)"
  },
  text: {
    primary: "var(--vscode-foreground)",
    secondary: "var(--vscode-descriptionForeground)",
    disabled: "var(--vscode-disabledForeground)"
  },
  primary: buildPaletteColor(BUTTON_BACKGROUND, "var(--vscode-button-foreground)"),
  secondary: buildPaletteColor(
    BUTTON_SECONDARY_BACKGROUND,
    "var(--vscode-button-secondaryForeground)"
  ),
  error: buildPaletteColor(
    EDITOR_ERROR_FOREGROUND,
    "var(--vscode-inputValidation-errorForeground)"
  ),
  warning: buildPaletteColor(
    EDITOR_WARNING_FOREGROUND,
    "var(--vscode-inputValidation-warningForeground)"
  ),
  info: buildPaletteColor(EDITOR_INFO_FOREGROUND, "var(--vscode-inputValidation-infoForeground)"),
  success: buildPaletteColor(TESTING_ICON_PASSED, "var(--vscode-button-foreground)"),
  action: {
    active: "var(--vscode-icon-foreground)",
    hover: "var(--vscode-list-hoverBackground)",
    selected: "var(--vscode-list-inactiveSelectionBackground)",
    disabled: "var(--vscode-disabledForeground)",
    disabledBackground: "var(--vscode-input-background)",
    focus: FOCUS_BORDER
  }
} as const;

// Component overrides
export const structuralOverrides: NonNullable<ThemeOptions["components"]> = {
  MuiCssBaseline: {
    styleOverrides: {
      // Bridge vars for non-MUI components (React Flow canvas)
      ":root": {
        "--topoviewer-surface-panel": vscodePalette.background.paper,
        "--topoviewer-surface-elevated": vscodePalette.background.paper,
        "--topoviewer-grid-color": vscodePalette.divider,
        "--topoviewer-node-label-background": "var(--vscode-badge-background)",
        "--topoviewer-node-label-foreground": vscodePalette.text.primary,
        "--topoviewer-node-label-outline": vscodePalette.background.default,
        "--topoviewer-edge-label-background": vscodePalette.background.default,
        "--topoviewer-edge-label-foreground": vscodePalette.text.primary,
        "--topoviewer-edge-label-outline": vscodePalette.background.default,
        "--topoviewer-network-node-background": vscodePalette.background.paper
      },
      "*::-webkit-scrollbar": { width: 8, height: 8 },
      "*::-webkit-scrollbar-track": { background: "transparent" },
      "*::-webkit-scrollbar-thumb": { borderRadius: 4 },
      "*::-webkit-scrollbar-corner": { background: "transparent" },
      [topoviewerScopedSelector("")]: {
        [TOPOVIEWER_FONT_FAMILY_CSS_VAR]: EXPLORER_FONT_FAMILY,
        [TOPOVIEWER_FONT_SCALE_CSS_VAR]: String(TOPOVIEWER_FONT_SCALE_DEFAULT),
        ...buildScopedFontSizeVars(
          `calc(${EXPLORER_FONT_SIZE_BASE} * var(${TOPOVIEWER_FONT_SCALE_CSS_VAR}, ${TOPOVIEWER_FONT_SCALE_DEFAULT}))`
        ),
        fontFamily: topoViewerTypography.fontFamily,
        fontSize: topoViewerTypography.base
      },
      [topoviewerScopedSelector(" .MuiTypography-root")]: {
        fontFamily: topoViewerTypography.fontFamily
      },
      [topoviewerScopedSelector(" .MuiDialogTitle-root")]: {
        fontFamily: topoViewerTypography.fontFamily,
        fontSize: topoViewerTypography.dialogTitle,
        lineHeight: 1.2
      },
      [topoviewerScopedSelector(" .MuiButton-root")]: {
        fontFamily: topoViewerTypography.fontFamily
      },
      [topoviewerScopedSelector(" .MuiTab-root")]: {
        fontSize: topoViewerTypography.label
      },
      [topoviewerScopedSelector(" .MuiMenuItem-root")]: {
        fontSize: topoViewerTypography.menu
      },
      [topoviewerScopedSelector(" .MuiInputBase-root")]: {
        fontFamily: topoViewerTypography.fontFamily,
        fontSize: topoViewerTypography.base
      },
      [topoviewerScopedSelector(" .MuiInputBase-input")]: {
        fontSize: topoViewerTypography.base
      },
      [topoviewerScopedSelector(" .MuiFormLabel-root")]: {
        fontFamily: topoViewerTypography.fontFamily,
        fontSize: topoViewerTypography.label
      },
      [topoviewerScopedSelector(" .MuiFormHelperText-root")]: {
        fontSize: topoViewerTypography.caption
      },
      [topoviewerScopedSelector(" .MuiTooltip-tooltip")]: {
        fontSize: topoViewerTypography.caption
      },
      [explorerScopedSelector("")]: {
        [TOPOVIEWER_FONT_FAMILY_CSS_VAR]: EXPLORER_FONT_FAMILY,
        ...buildScopedFontSizeVars(EXPLORER_FONT_SIZE_SCALED),
        fontFamily: EXPLORER_FONT_FAMILY,
        fontSize: `var(${TOPOVIEWER_FONT_SIZE_CSS_VARS.base})`
      },
      [explorerBodyScopedSelector("")]: {
        [TOPOVIEWER_FONT_SCALE_CSS_VAR]: String(TOPOVIEWER_FONT_SCALE_DEFAULT)
      },
      [explorerScopedSelector(" .MuiTypography-root")]: {
        fontFamily: EXPLORER_FONT_FAMILY
      },
      [explorerScopedSelector(" .MuiInputBase-root")]: {
        fontFamily: EXPLORER_FONT_FAMILY
      },
      [explorerScopedSelector(" .MuiInputBase-input")]: {
        fontFamily: EXPLORER_FONT_FAMILY,
        fontSize: `var(${TOPOVIEWER_FONT_SIZE_CSS_VARS.base})`
      },
      [explorerScopedSelector(" .explorer-node-label")]: {
        fontSize: `var(${TOPOVIEWER_FONT_SIZE_CSS_VARS.nodeLabel})`,
        fontWeight: 500,
        lineHeight: 1.15
      },
      [explorerScopedSelector(" .explorer-node-inline-icon")]: {
        fontSize: `var(${TOPOVIEWER_FONT_SIZE_CSS_VARS.iconInline})`,
        flex: "0 0 auto"
      },
      [explorerScopedSelector(" .explorer-node-inline-icon-button")]: {
        width: 20,
        height: 20,
        padding: 0,
        color: "inherit"
      },
      [explorerScopedSelector(" .explorer-node-inline-icon-favorite")]: {
        color: "var(--vscode-charts-yellow, var(--vscode-editorWarning-foreground))"
      },
      [explorerScopedSelector(" .explorer-node-inline-icon-shared")]: {
        color: "var(--vscode-icon-foreground, var(--vscode-foreground))"
      },
      [explorerScopedSelector(" .explorer-section-title")]: {
        fontSize: `var(${TOPOVIEWER_FONT_SIZE_CSS_VARS.sectionTitle})`,
        fontWeight: 500,
        lineHeight: 1.2
      },
      "@keyframes shortcutFade": {
        "0%": { opacity: 0, transform: "translateY(8px) scale(0.95)" },
        "15%": { opacity: 1, transform: "translateY(0) scale(1)" },
        "85%": { opacity: 1, transform: "translateY(0) scale(1)" },
        "100%": { opacity: 0, transform: "translateY(-4px) scale(0.98)" }
      }
    }
  },
  MuiButton: { defaultProps: { disableElevation: true, variant: "contained" } },
  MuiTabs: { styleOverrides: { root: { minHeight: 36 } } },
  MuiTab: { styleOverrides: { root: { minHeight: 36, padding: "6px 12px" } } },
  MuiPaper: { styleOverrides: { root: { backgroundImage: "none" } } },
  MuiAppBar: {
    styleOverrides: {
      root: { backgroundColor: vscodePalette.background.paper, color: vscodePalette.text.primary }
    }
  },
  MuiDrawer: {
    styleOverrides: {
      paper: { backgroundColor: vscodePalette.background.paper, color: vscodePalette.text.primary }
    }
  },
  MuiInputBase: {
    styleOverrides: {
      root: {
        color: "var(--vscode-input-foreground)"
      }
    }
  },
  MuiOutlinedInput: {
    defaultProps: {
      notched: true
    },
    styleOverrides: {
      root: {
        "&:hover .MuiOutlinedInput-notchedOutline": {
          borderColor: FOCUS_BORDER
        },
        "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
          borderColor: FOCUS_BORDER
        }
      },
      notchedOutline: {
        borderColor: "var(--vscode-input-border)"
      }
    }
  },
  MuiInputLabel: {
    defaultProps: { shrink: true }
  },
  MuiTextField: { defaultProps: { size: "small", variant: "outlined" } },
  MuiSelect: { defaultProps: { size: "small" } },
  MuiMenu: {
    styleOverrides: {
      paper: {
        backgroundColor: vscodePalette.background.paper,
        color: vscodePalette.text.primary,
        border: `1px solid ${vscodePalette.divider}`
      }
    }
  },
  MuiPopover: {
    styleOverrides: {
      paper: {
        backgroundColor: vscodePalette.background.paper,
        color: vscodePalette.text.primary,
        border: `1px solid ${vscodePalette.divider}`
      }
    }
  },
  MuiDialog: {
    styleOverrides: {
      paper: {
        backgroundColor: vscodePalette.background.paper,
        color: vscodePalette.text.primary,
        border: `1px solid ${vscodePalette.divider}`
      }
    },
    defaultProps: {
      slotProps: { backdrop: { sx: { backgroundColor: "rgba(0, 0, 0, 0.5)" } } }
    }
  },
  MuiBackdrop: { styleOverrides: { root: { backgroundColor: "transparent" } } }
};

// Theme instance
const baseTheme = createTheme({
  palette: { ...vscodePalette },
  typography: {
    fontFamily: topoViewerTypography.fontFamily,
    body1: { fontSize: topoViewerTypography.body },
    body2: { fontSize: topoViewerTypography.bodySmall },
    button: { fontSize: topoViewerTypography.label },
    caption: { fontSize: topoViewerTypography.caption },
    h5: { fontSize: topoViewerTypography.h5 },
    h6: { fontSize: topoViewerTypography.h6 },
    overline: {
      fontSize: topoViewerTypography.overline,
      fontWeight: 500,
      letterSpacing: "0.5px"
    },
    subtitle1: { fontSize: topoViewerTypography.sectionTitle },
    subtitle2: { fontSize: topoViewerTypography.label }
  },
  shape: { borderRadius: 4 },
  components: structuralOverrides
});

// Patch MUI color utils — default implementations crash on CSS var() strings.
// alpha uses color-mix so hover/focus overlays resolve correctly at runtime.
baseTheme.alpha = (color: string, opacity: number | string) => {
  const opacityValue = typeof opacity === "number" ? `${Math.round(opacity * 100)}%` : opacity;
  return `color-mix(in srgb, ${color} ${opacityValue}, transparent)`;
};
baseTheme.lighten = (color: string) => color;
baseTheme.darken = (color: string) => color;
baseTheme.palette.getContrastText = () => vscodePalette.text.primary;

export const vscodeTheme = baseTheme;
