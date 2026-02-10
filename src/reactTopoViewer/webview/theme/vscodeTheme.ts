/**
 * VS Code MUI theme — single-file theme config.
 *
 * Exports:
 * - `vscodePalette`        – MUI palette slots mapped to CSS `var(--vscode-*)` strings
 * - `structuralOverrides`  – colour-free MUI component overrides (sizing, layout, defaults)
 * - `createVscodeTheme()`  – ready-to-use MUI theme for a VS Code webview
 *
 * Fork-friendly: import `vscodePalette` and/or `structuralOverrides` individually
 * and deep-merge your own additions via `createTheme(base, overrides)`.
 */
import { createTheme, type ThemeOptions } from "@mui/material/styles";

// ---------------------------------------------------------------------------
// Palette — every slot MUI would otherwise try to derive is filled explicitly
// so that no color-math runs on opaque var() strings.
// ---------------------------------------------------------------------------

/**
 * Full MUI palette backed by VS Code CSS custom properties.
 * Can be spread into `createTheme({ palette: { ...vscodePalette, mode } })`.
 */
export const vscodePalette = {
  divider: "var(--vscode-panel-border)",
  background: {
    default: "var(--vscode-editor-background)",
    paper: "var(--vscode-editor-background)"
  },
  text: {
    primary: "var(--vscode-foreground)",
    secondary: "var(--vscode-descriptionForeground)",
    disabled: "var(--vscode-disabledForeground)"
  },
  primary: {
    main: "var(--vscode-button-background)",
    dark: "var(--vscode-button-hoverBackground)",
    light: "var(--vscode-focusBorder)",
    contrastText: "var(--vscode-button-foreground)"
  },
  secondary: {
    main: "var(--vscode-badge-background)",
    dark: "var(--vscode-badge-background)",
    light: "var(--vscode-badge-background)",
    contrastText: "var(--vscode-badge-foreground)"
  },
  error: {
    main: "var(--vscode-errorForeground)",
    dark: "var(--vscode-errorForeground)",
    light: "var(--vscode-errorForeground)",
    contrastText: "var(--vscode-button-foreground)"
  },
  warning: {
    main: "var(--vscode-inputValidation-warningBorder)",
    dark: "var(--vscode-inputValidation-warningBorder)",
    light: "var(--vscode-inputValidation-warningBackground)",
    contrastText: "var(--vscode-foreground)"
  },
  info: {
    main: "var(--vscode-focusBorder)",
    dark: "var(--vscode-focusBorder)",
    light: "var(--vscode-inputValidation-infoBackground)",
    contrastText: "var(--vscode-button-foreground)"
  },
  success: {
    main: "var(--vscode-testing-iconPassed, var(--vscode-inputValidation-infoBorder))",
    dark: "var(--vscode-testing-iconPassed, var(--vscode-inputValidation-infoBorder))",
    light: "var(--vscode-testing-iconPassed, var(--vscode-inputValidation-infoBorder))",
    contrastText: "var(--vscode-button-foreground)"
  },
  action: {
    active: "var(--vscode-icon-foreground)",
    hover: "var(--vscode-list-hoverBackground)",
    selected: "var(--vscode-list-activeSelectionBackground)",
    disabled: "var(--vscode-disabledForeground)",
    disabledBackground: "var(--vscode-input-background)",
    focus: "var(--vscode-focusBorder)"
  }
} as const;

// ---------------------------------------------------------------------------
// Structural overrides — no colors, just sizing / layout / defaults
// ---------------------------------------------------------------------------

/**
 * Colour-free MUI component overrides shared between VS Code and dev themes.
 * Forks can import this and deep-merge their own additions.
 */
export const structuralOverrides: NonNullable<ThemeOptions["components"]> = {
  MuiCssBaseline: {
    styleOverrides: {
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
  MuiButton: {
    styleOverrides: {
      root: { textTransform: "none", minWidth: 0 },
      contained: { "&.Mui-disabled": { opacity: 0.5 } }
    },
    defaultProps: { disableElevation: true }
  },
  MuiPaper: {
    styleOverrides: {
      root: { backgroundImage: "none" }
    }
  },
  MuiTextField: {
    defaultProps: { size: "small", variant: "outlined" }
  },
  MuiSelect: {
    defaultProps: { size: "small" }
  },
  MuiInputBase: {
    styleOverrides: {
      root: { fontSize: "var(--vscode-font-size)" }
    }
  },
  MuiOutlinedInput: {
    styleOverrides: {
      root: { "&.Mui-disabled": { opacity: 0.5 } }
    }
  },
  MuiMenu: {
    styleOverrides: {
      list: { padding: "4px 0" }
    }
  },
  MuiMenuItem: {
    styleOverrides: {
      root: { "&.Mui-disabled": { opacity: 0.5 } }
    }
  },
  MuiTabs: {
    styleOverrides: {
      root: { minHeight: 36 }
    }
  },
  MuiTab: {
    styleOverrides: {
      root: { textTransform: "none", minHeight: 36 }
    }
  },
  MuiDialog: {
    defaultProps: {
      slotProps: {
        backdrop: { sx: { backgroundColor: "rgba(0, 0, 0, 0.5)" } }
      }
    }
  },
  MuiTooltip: {
    styleOverrides: {
      tooltip: { fontSize: 12 }
    }
  },
  MuiChip: {
    styleOverrides: {
      root: { "&.Mui-disabled": { opacity: 0.5 } }
    }
  },
  MuiAlert: {
    styleOverrides: {
      icon: { color: "inherit" }
    }
  },
  MuiSwitch: {
    styleOverrides: {
      root: { width: 42, height: 26, padding: 0 },
      switchBase: {
        padding: 1,
        "&.Mui-checked": {
          transform: "translateX(16px)",
          "& + .MuiSwitch-track": { opacity: 1 }
        },
        "&.Mui-disabled": { "& + .MuiSwitch-track": { opacity: 0.3 } }
      },
      thumb: { width: 24, height: 24 },
      track: { borderRadius: 13, opacity: 1 }
    }
  },
  MuiListItemIcon: {
    styleOverrides: { root: { minWidth: 36 } }
  },
  MuiFormControlLabel: {
    styleOverrides: { label: { fontSize: "0.875rem" } }
  },
  MuiLinearProgress: {
    styleOverrides: { root: { borderRadius: 2 } }
  },
  MuiBackdrop: {
    styleOverrides: { root: { backgroundColor: "transparent" } }
  },
  MuiTableCell: {
    styleOverrides: { head: { fontWeight: 600 } }
  },
  MuiAccordion: {
    styleOverrides: {
      root: { "&:before": { display: "none" }, "&.Mui-expanded": { margin: 0 } }
    }
  }
};

// ---------------------------------------------------------------------------
// Theme factory
// ---------------------------------------------------------------------------

/**
 * Create a VS Code-integrated MUI theme.
 *
 * @param mode   - "light" | "dark"
 * @param overrides - optional ThemeOptions deep-merged on top (for forks)
 */
export function createVscodeTheme(mode: "light" | "dark", overrides?: ThemeOptions) {
  const base = createTheme({
    palette: { ...vscodePalette, mode },
    typography: {
      fontFamily: "var(--vscode-font-family)",
      fontSize: 13
    },
    shape: { borderRadius: 4 },
    components: structuralOverrides
  });

  return overrides ? createTheme(base, overrides) : base;
}
