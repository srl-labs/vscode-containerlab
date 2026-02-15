// VS Code MUI theme config.
// Palette values are CSS var() references — VS Code swaps them for light/dark.
import { createTheme, type ThemeOptions } from "@mui/material/styles";

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
  primary: {
    main: "var(--vscode-button-background)",
    dark: "var(--vscode-button-background)",
    light: "var(--vscode-button-background)",
    contrastText: "var(--vscode-button-foreground)"
  },
  secondary: {
    main: "var(--vscode-button-secondaryBackground)",
    dark: "var(--vscode-button-secondaryBackground)",
    light: "var(--vscode-button-secondaryBackground)",
    contrastText: "var(--vscode-button-secondaryForeground)"
  },
  error: {
    main: "var(--vscode-editorError-foreground)",
    dark: "var(--vscode-editorError-foreground)",
    light: "var(--vscode-editorError-foreground)",
    contrastText: "var(--vscode-inputValidation-errorForeground)"
  },
  warning: {
    main: "var(--vscode-editorWarning-foreground)",
    dark: "var(--vscode-editorWarning-foreground)",
    light: "var(--vscode-editorWarning-foreground)",
    contrastText: "var(--vscode-inputValidation-warningForeground)"
  },
  info: {
    main: "var(--vscode-editorInfo-foreground)",
    dark: "var(--vscode-editorInfo-foreground)",
    light: "var(--vscode-editorInfo-foreground)",
    contrastText: "var(--vscode-inputValidation-infoForeground)"
  },
  success: {
    main: "var(--vscode-testing-iconPassed, var(--vscode-charts-green))",
    dark: "var(--vscode-testing-iconPassed, var(--vscode-charts-green))",
    light: "var(--vscode-testing-iconPassed, var(--vscode-charts-green))",
    contrastText: "var(--vscode-button-foreground)"
  },
  action: {
    active: "var(--vscode-icon-foreground)",
    hover: "var(--vscode-list-hoverBackground)",
    selected: "var(--vscode-list-inactiveSelectionBackground)",
    disabled: "var(--vscode-disabledForeground)",
    disabledBackground: "var(--vscode-input-background)",
    focus: "var(--vscode-focusBorder)"
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
    styleOverrides: {
      root: {
        "&:hover .MuiOutlinedInput-notchedOutline": {
          borderColor: "var(--vscode-focusBorder)"
        },
        "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
          borderColor: "var(--vscode-focusBorder)"
        }
      },
      notchedOutline: {
        borderColor: "var(--vscode-input-border)"
      }
    }
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
baseTheme.alpha = (color: string, opacity: number | string) =>
  `color-mix(in srgb, ${color} ${typeof opacity === "number" ? `${Math.round(opacity * 100)}%` : opacity}, transparent)`;
baseTheme.lighten = (color: string) => color;
baseTheme.darken = (color: string) => color;
baseTheme.palette.getContrastText = () => vscodePalette.text.primary;

export const vscodeTheme = baseTheme;
