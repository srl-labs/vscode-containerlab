// VS Code MUI theme config.
// Palette values are CSS var() references — VS Code swaps them for light/dark.
import { createTheme, type ThemeOptions } from "@mui/material/styles";

const BUTTON_BACKGROUND = "var(--vscode-button-background)";
const BUTTON_SECONDARY_BACKGROUND = "var(--vscode-button-secondaryBackground)";
const EDITOR_ERROR_FOREGROUND = "var(--vscode-editorError-foreground)";
const EDITOR_WARNING_FOREGROUND = "var(--vscode-editorWarning-foreground)";
const EDITOR_INFO_FOREGROUND = "var(--vscode-editorInfo-foreground)";
const TESTING_ICON_PASSED = "var(--vscode-testing-iconPassed, var(--vscode-charts-green))";
const FOCUS_BORDER = "var(--vscode-focusBorder)";
const EXPLORER_FONT_FAMILY =
  "var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif)";
const EXPLORER_FONT_SIZE = "var(--vscode-font-size, 13px)";
const EXPLORER_SCOPE_SELECTORS = [
  "body[data-webview-kind='containerlab-explorer']",
  ".containerlab-explorer-root"
] as const;

const explorerScopedSelector = (suffix: string) =>
  EXPLORER_SCOPE_SELECTORS.map((selector) => `${selector}${suffix}`).join(", ");

const buildPaletteColor = (main: string, contrastText: string) => ({
  main,
  dark: main,
  light: main,
  contrastText
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
      [explorerScopedSelector("")]: {
        fontFamily: EXPLORER_FONT_FAMILY
      },
      [explorerScopedSelector(" .MuiTypography-root")]: {
        fontFamily: EXPLORER_FONT_FAMILY
      },
      [explorerScopedSelector(" .MuiInputBase-root")]: {
        fontFamily: EXPLORER_FONT_FAMILY
      },
      [explorerScopedSelector(" .MuiInputBase-input")]: {
        fontFamily: EXPLORER_FONT_FAMILY,
        fontSize: EXPLORER_FONT_SIZE
      },
      [explorerScopedSelector(" .explorer-node-label")]: {
        fontSize: EXPLORER_FONT_SIZE,
        fontWeight: 400,
        lineHeight: 1.2
      },
      [explorerScopedSelector(" .explorer-node-inline-icon")]: {
        fontSize: "13px",
        flex: "0 0 auto"
      },
      [explorerScopedSelector(" .explorer-node-inline-icon-button")]: {
        width: 16,
        height: 16,
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
        fontSize: EXPLORER_FONT_SIZE,
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
    fontFamily: "'Roboto', sans-serif",
    overline: { fontWeight: 500, letterSpacing: "0.5px" }
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
