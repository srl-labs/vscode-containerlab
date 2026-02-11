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

const VSCODE_BUTTON_FOREGROUND = "var(--vscode-button-foreground)";
const VSCODE_FOCUS_BORDER = "var(--vscode-focusBorder)";
const VSCODE_BADGE_BACKGROUND = "var(--vscode-badge-background)";
const VSCODE_ERROR_FOREGROUND = "var(--vscode-errorForeground)";
const VSCODE_SUCCESS_FOREGROUND =
  "var(--vscode-testing-iconPassed, var(--vscode-inputValidation-infoBorder))";

type ColorManipulator = (color: string, coefficient: number | string) => string;

function toCssPercent(coefficient: number | string): string {
  if (typeof coefficient === "number") {
    return `${Math.round(coefficient * 100)}%`;
  }
  return `calc((${coefficient}) * 100%)`;
}

function wrapColorManipulator(
  base: ColorManipulator,
  fallback: ColorManipulator
): ColorManipulator {
  return (color: string, coefficient: number | string) => {
    try {
      return base(color, coefficient);
    } catch {
      return fallback(color, coefficient);
    }
  };
}

/**
 * Patch MUI color manipulation helpers so CSS variable colors are handled
 * through CSS (`color-mix`) instead of JS parsing.
 */
function patchThemeColorManipulators(theme: ReturnType<typeof createTheme>) {
  const baseAlpha = theme.alpha.bind(theme) as ColorManipulator;
  const baseLighten = theme.lighten.bind(theme) as ColorManipulator;
  const baseDarken = theme.darken.bind(theme) as ColorManipulator;

  theme.alpha = wrapColorManipulator(baseAlpha, (color, coefficient) => {
    return `color-mix(in srgb, ${color} ${toCssPercent(coefficient)}, transparent)`;
  });

  theme.lighten = wrapColorManipulator(baseLighten, (color, coefficient) => {
    return `color-mix(in srgb, ${color}, #fff ${toCssPercent(coefficient)})`;
  });

  theme.darken = wrapColorManipulator(baseDarken, (color, coefficient) => {
    return `color-mix(in srgb, ${color}, #000 ${toCssPercent(coefficient)})`;
  });
}

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
    paper:
      "var(--topoviewer-surface-panel, var(--vscode-editorWidget-background, var(--vscode-editor-background)))"
  },
  text: {
    primary: "var(--vscode-foreground)",
    secondary: "var(--vscode-descriptionForeground)",
    disabled: "var(--vscode-disabledForeground)"
  },
  primary: {
    main: "var(--vscode-button-background)",
    dark: "var(--vscode-button-hoverBackground)",
    light: VSCODE_FOCUS_BORDER,
    contrastText: VSCODE_BUTTON_FOREGROUND
  },
  secondary: {
    main: VSCODE_BADGE_BACKGROUND,
    dark: VSCODE_BADGE_BACKGROUND,
    light: VSCODE_BADGE_BACKGROUND,
    contrastText: "var(--vscode-badge-foreground)"
  },
  error: {
    main: VSCODE_ERROR_FOREGROUND,
    dark: VSCODE_ERROR_FOREGROUND,
    light: VSCODE_ERROR_FOREGROUND,
    contrastText: VSCODE_BUTTON_FOREGROUND
  },
  warning: {
    main: "var(--vscode-inputValidation-warningBorder)",
    dark: "var(--vscode-inputValidation-warningBorder)",
    light: "var(--vscode-inputValidation-warningBackground)",
    contrastText: "var(--vscode-foreground)"
  },
  info: {
    main: VSCODE_FOCUS_BORDER,
    dark: VSCODE_FOCUS_BORDER,
    light: "var(--vscode-inputValidation-infoBackground)",
    contrastText: VSCODE_BUTTON_FOREGROUND
  },
  success: {
    main: VSCODE_SUCCESS_FOREGROUND,
    dark: VSCODE_SUCCESS_FOREGROUND,
    light: VSCODE_SUCCESS_FOREGROUND,
    contrastText: VSCODE_BUTTON_FOREGROUND
  },
  action: {
    active: "var(--vscode-icon-foreground)",
    hover: "var(--vscode-list-hoverBackground)",
    selected: "var(--vscode-list-inactiveSelectionBackground, var(--vscode-list-hoverBackground))",
    disabled: "var(--vscode-disabledForeground)",
    disabledBackground: "var(--vscode-input-background)",
    focus: VSCODE_FOCUS_BORDER
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
      ":root": {
        "--topoviewer-surface-panel":
          "color-mix(in srgb, var(--vscode-sideBar-background) 72%, var(--vscode-editor-background) 28%)",
        "--topoviewer-surface-elevated":
          "color-mix(in srgb, var(--vscode-editorWidget-background, var(--vscode-sideBar-background)) 75%, var(--vscode-editor-background) 25%)",
        "--topoviewer-grid-color": "color-mix(in srgb, var(--vscode-foreground) 24%, transparent)",
        "--topoviewer-node-label-background":
          "var(--vscode-badge-background, color-mix(in srgb, var(--vscode-editor-background) 30%, var(--vscode-foreground) 70%))",
        "--topoviewer-node-label-foreground":
          "var(--vscode-badge-foreground, var(--vscode-foreground))",
        "--topoviewer-node-label-outline":
          "color-mix(in srgb, var(--vscode-editor-background) 85%, transparent)",
        "--topoviewer-edge-label-background":
          "color-mix(in srgb, var(--vscode-editor-background) 88%, var(--vscode-foreground) 12%)",
        "--topoviewer-edge-label-foreground": "var(--vscode-foreground)",
        "--topoviewer-edge-label-outline":
          "color-mix(in srgb, var(--vscode-editor-background) 78%, transparent)",
        "--topoviewer-network-node-background":
          "color-mix(in srgb, var(--vscode-editor-background) 84%, var(--vscode-foreground) 16%)"
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
  MuiAppBar: {
    styleOverrides: {
      root: {
        backgroundColor: "var(--topoviewer-surface-panel)",
        color: "var(--vscode-foreground)"
      }
    }
  },
  MuiDrawer: {
    styleOverrides: {
      paper: {
        backgroundColor: "var(--topoviewer-surface-panel)",
        color: "var(--vscode-foreground)"
      }
    }
  },
  MuiTextField: {
    defaultProps: { size: "small", variant: "outlined" }
  },
  MuiSelect: {
    defaultProps: { size: "small" }
  },
  MuiInputBase: {},
  MuiOutlinedInput: {
    styleOverrides: {
      root: {
        backgroundColor: "var(--vscode-input-background)",
        "&.Mui-disabled": { opacity: 0.5 }
      }
    }
  },
  MuiMenu: {
    styleOverrides: {
      paper: {
        backgroundColor: "var(--topoviewer-surface-elevated)",
        color: "var(--vscode-foreground)",
        border: "1px solid var(--vscode-menu-border)"
      },
      list: { padding: "4px 0" }
    }
  },
  MuiPopover: {
    styleOverrides: {
      paper: {
        backgroundColor: "var(--topoviewer-surface-elevated)",
        color: "var(--vscode-foreground)",
        border: "1px solid var(--vscode-panel-border)"
      }
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
    styleOverrides: {
      paper: {
        backgroundColor: "var(--topoviewer-surface-elevated)",
        color: "var(--vscode-foreground)",
        border: "1px solid var(--vscode-panel-border)"
      }
    },
    defaultProps: {
      slotProps: {
        backdrop: { sx: { backgroundColor: "rgba(0, 0, 0, 0.5)" } }
      }
    }
  },
  MuiTooltip: {
    styleOverrides: {
      tooltip: {}
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
    styleOverrides: { label: {} }
  },
  MuiLinearProgress: {
    styleOverrides: { root: { borderRadius: 2 } }
  },
  MuiBackdrop: {
    styleOverrides: { root: { backgroundColor: "transparent" } }
  },
  MuiTableCell: {
    styleOverrides: { head: {} }
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
    typography: {},
    shape: { borderRadius: 4 },
    components: structuralOverrides
  });
  const theme = overrides ? createTheme(base, overrides) : base;
  patchThemeColorManipulators(theme);
  return theme;
}
