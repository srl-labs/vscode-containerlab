/**
 * Shared MUI component overrides that are the same regardless of color source.
 * Both vscodeTheme and devTheme call getBaseOverrides(colors) and deep-merge
 * with any theme-specific additions.
 */
import type { ThemeOptions } from "@mui/material/styles";

/**
 * Semantic color mapping consumed by component overrides.
 * In VS Code mode these resolve to CSS variables; in dev mode to real hex values.
 */
export interface ThemeColors {
  editorBg: string;
  editorFg: string;
  sideBarBg: string;
  panelBorder: string;
  buttonBg: string;
  buttonFg: string;
  buttonHoverBg: string;
  buttonBorder: string;
  buttonSecondaryFg: string;
  buttonSecondaryHoverBg: string;
  inputBg: string;
  inputFg: string;
  inputBorder: string;
  inputPlaceholderFg: string;
  focusBorder: string;
  foreground: string;
  descriptionFg: string;
  errorFg: string;
  iconFg: string;
  listHoverBg: string;
  listActiveSelectionBg: string;
  listActiveSelectionFg: string;
  badgeBg: string;
  badgeFg: string;
  textLinkFg: string;
  textLinkActiveFg: string;
  disabledFg: string;
  dropdownBg: string;
  dropdownFg: string;
  dropdownBorder: string;
  menuBg: string;
  menuBorder: string;
  menuFg: string;
  menuSelectionBg: string;
  menuSelectionFg: string;
  tabActiveBorderTop: string;
  tabActiveFg: string;
  tabInactiveFg: string;
  tabHoverBg: string;
  widgetShadow: string;
  widgetBg: string;
  widgetFg: string;
  widgetBorder: string;
  validationErrorBg: string;
  validationErrorBorder: string;
  validationWarningBg: string;
  validationWarningBorder: string;
  validationInfoBg: string;
  validationInfoBorder: string;
  testingIconPassed: string;
  checkboxBorder: string;
  progressBarBg: string;
  notificationsBg: string;
  notificationsFg: string;
  notificationsBorder: string;
}

/**
 * Returns structural/behavioral MUI component overrides parameterised by colors.
 */
export function getBaseOverrides(c: ThemeColors): NonNullable<ThemeOptions["components"]> {
  return {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: c.editorBg,
          color: c.editorFg
        },
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
        contained: {
          backgroundColor: c.buttonBg,
          color: c.buttonFg,
          "&:hover": { backgroundColor: c.buttonHoverBg },
          "&.Mui-disabled": {
            backgroundColor: c.buttonBg,
            color: c.disabledFg,
            opacity: 0.5
          }
        },
        outlined: {
          borderColor: c.buttonBorder,
          color: c.buttonSecondaryFg,
          "&:hover": {
            backgroundColor: c.buttonSecondaryHoverBg,
            borderColor: c.buttonBorder
          },
          "&.Mui-disabled": {
            borderColor: c.panelBorder,
            color: c.disabledFg
          }
        },
        text: {
          color: c.textLinkFg,
          "&:hover": { backgroundColor: c.listHoverBg },
          "&.Mui-disabled": { color: c.disabledFg }
        }
      },
      defaultProps: { disableElevation: true }
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          color: c.iconFg,
          "&:hover": { backgroundColor: c.listHoverBg },
          "&.Mui-disabled": { color: c.disabledFg }
        }
      }
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: "none", backgroundColor: c.editorBg }
      }
    },
    MuiAppBar: {
      styleOverrides: {
        root: { backgroundColor: c.editorBg, color: c.editorFg }
      }
    },
    MuiToolbar: {
      styleOverrides: {
        root: { borderBottom: `1px solid ${c.panelBorder}` }
      }
    },
    MuiTypography: {
      styleOverrides: {
        root: { color: c.editorFg }
      }
    },
    MuiTextField: {
      defaultProps: { size: "small", variant: "outlined" }
    },
    MuiSelect: {
      defaultProps: { size: "small" },
      styleOverrides: {
        root: {
          backgroundColor: c.inputBg,
          color: c.inputFg,
          "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: c.focusBorder },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: c.focusBorder }
        },
        icon: { color: c.iconFg }
      }
    },
    MuiInputBase: {
      styleOverrides: {
        root: {
          fontSize: "var(--vscode-font-size)",
          color: c.inputFg,
          "&.Mui-disabled": { color: c.disabledFg }
        },
        input: {
          "&::placeholder": { color: c.inputPlaceholderFg, opacity: 1 }
        }
      }
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: c.inputBg,
          color: c.inputFg,
          "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: c.focusBorder },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: c.focusBorder },
          "&.Mui-error .MuiOutlinedInput-notchedOutline": { borderColor: c.validationErrorBorder },
          "&.Mui-disabled": {
            backgroundColor: c.inputBg,
            opacity: 0.5,
            "& .MuiOutlinedInput-notchedOutline": { borderColor: c.panelBorder }
          }
        },
        notchedOutline: { borderColor: c.inputBorder },
        input: {
          "&::placeholder": { color: c.inputPlaceholderFg, opacity: 1 }
        }
      }
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          color: c.foreground,
          "&.Mui-focused": { color: c.focusBorder },
          "&.Mui-error": { color: c.errorFg },
          "&.Mui-disabled": { color: c.disabledFg }
        }
      }
    },
    MuiFormHelperText: {
      styleOverrides: {
        root: {
          color: c.descriptionFg,
          "&.Mui-error": { color: c.errorFg },
          "&.Mui-disabled": { color: c.disabledFg }
        }
      }
    },
    MuiCheckbox: {
      styleOverrides: {
        root: {
          color: c.checkboxBorder,
          "&.Mui-checked": { color: c.buttonBg },
          "&.Mui-disabled": { color: c.disabledFg }
        }
      }
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          backgroundColor: c.menuBg,
          border: `1px solid ${c.menuBorder}`,
          boxShadow: `0 2px 8px ${c.widgetShadow}`
        },
        list: { padding: "4px 0" }
      }
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          color: c.menuFg,
          "&:hover": { backgroundColor: c.menuSelectionBg },
          "&.Mui-selected": {
            backgroundColor: c.menuSelectionBg,
            color: c.menuSelectionFg,
            "&:hover": { backgroundColor: c.menuSelectionBg }
          },
          "&.Mui-disabled": { color: c.disabledFg, opacity: 1 }
        }
      }
    },
    MuiTabs: {
      styleOverrides: {
        root: { minHeight: 36 },
        indicator: { backgroundColor: c.tabActiveBorderTop }
      }
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: "none",
          minHeight: 36,
          color: c.tabInactiveFg,
          "&:hover": { backgroundColor: c.tabHoverBg },
          "&.Mui-selected": { color: c.tabActiveFg },
          "&.Mui-disabled": { color: c.disabledFg }
        }
      }
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          backgroundColor: c.editorBg,
          border: `1px solid ${c.panelBorder}`,
          boxShadow: `0 4px 16px ${c.widgetShadow}`
        }
      }
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: { color: c.foreground, borderBottom: `1px solid ${c.panelBorder}` }
      }
    },
    MuiDialogContent: {
      styleOverrides: {
        root: { backgroundColor: c.editorBg, color: c.foreground }
      }
    },
    MuiDialogActions: {
      styleOverrides: {
        root: { borderTop: `1px solid ${c.panelBorder}` }
      }
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          fontSize: 12,
          backgroundColor: c.widgetBg,
          color: c.widgetFg,
          border: `1px solid ${c.widgetBorder}`
        },
        arrow: { color: c.widgetBg }
      }
    },
    MuiChip: {
      styleOverrides: {
        root: {
          backgroundColor: c.badgeBg,
          color: c.badgeFg,
          border: `1px solid ${c.panelBorder}`,
          "&.Mui-disabled": { opacity: 0.5 }
        },
        deleteIcon: {
          color: c.badgeFg,
          "&:hover": { color: c.errorFg }
        },
        outlined: {
          backgroundColor: "transparent",
          borderColor: c.panelBorder,
          color: c.foreground
        }
      }
    },
    MuiBadge: {
      styleOverrides: {
        badge: { backgroundColor: c.badgeBg, color: c.badgeFg }
      }
    },
    MuiAutocomplete: {
      styleOverrides: {
        paper: {
          backgroundColor: c.dropdownBg,
          border: `1px solid ${c.dropdownBorder}`,
          boxShadow: `0 2px 8px ${c.widgetShadow}`
        },
        listbox: { padding: "4px 0" },
        option: {
          color: c.dropdownFg,
          "&:hover": { backgroundColor: c.listHoverBg },
          "&[aria-selected='true']": {
            backgroundColor: c.listActiveSelectionBg,
            color: c.listActiveSelectionFg
          },
          "&.Mui-focused": { backgroundColor: c.listHoverBg }
        },
        clearIndicator: { color: c.iconFg },
        popupIndicator: { color: c.iconFg }
      }
    },
    MuiAlert: {
      styleOverrides: {
        root: { border: "1px solid" },
        standardError: {
          backgroundColor: c.validationErrorBg,
          borderColor: c.validationErrorBorder,
          color: c.foreground
        },
        standardWarning: {
          backgroundColor: c.validationWarningBg,
          borderColor: c.validationWarningBorder,
          color: c.foreground
        },
        standardInfo: {
          backgroundColor: c.validationInfoBg,
          borderColor: c.validationInfoBorder,
          color: c.foreground
        },
        standardSuccess: {
          backgroundColor: c.validationInfoBg,
          borderColor: c.testingIconPassed,
          color: c.foreground
        },
        icon: { color: "inherit" }
      }
    },
    MuiSwitch: {
      styleOverrides: {
        root: { width: 42, height: 26, padding: 0 },
        switchBase: {
          padding: 1,
          "&.Mui-checked": {
            color: c.buttonFg,
            transform: "translateX(16px)",
            "& + .MuiSwitch-track": { backgroundColor: c.buttonBg, opacity: 1 }
          },
          "&.Mui-disabled": {
            color: c.disabledFg,
            "& + .MuiSwitch-track": { opacity: 0.3 }
          }
        },
        thumb: { backgroundColor: c.buttonFg, width: 24, height: 24 },
        track: {
          borderRadius: 13,
          backgroundColor: c.inputBg,
          border: `1px solid ${c.inputBorder}`,
          opacity: 1
        }
      }
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundColor: c.editorBg,
          border: `1px solid ${c.panelBorder}`,
          boxShadow: "none"
        }
      }
    },
    MuiCardHeader: {
      styleOverrides: {
        root: { borderBottom: `1px solid ${c.panelBorder}` },
        title: { color: c.foreground },
        subheader: { color: c.descriptionFg }
      }
    },
    MuiCardContent: {
      styleOverrides: {
        root: { color: c.foreground }
      }
    },
    MuiLink: {
      styleOverrides: {
        root: {
          color: c.textLinkFg,
          "&:hover": { color: c.textLinkActiveFg }
        }
      }
    },
    MuiDivider: {
      styleOverrides: {
        root: { borderColor: c.panelBorder }
      }
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: c.sideBarBg,
          borderRight: `1px solid ${c.panelBorder}`,
          color: c.editorFg
        }
      }
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          "&:hover": { backgroundColor: c.listHoverBg },
          "&.Mui-selected": {
            backgroundColor: c.listActiveSelectionBg,
            color: c.listActiveSelectionFg,
            "&:hover": { backgroundColor: c.listActiveSelectionBg }
          }
        }
      }
    },
    MuiListItemIcon: {
      styleOverrides: {
        root: { color: c.iconFg, minWidth: 36 }
      }
    },
    MuiListItemText: {
      styleOverrides: {
        primary: { color: c.foreground },
        secondary: { color: c.descriptionFg }
      }
    },
    MuiSlider: {
      styleOverrides: {
        root: {
          color: c.buttonBg,
          "&.Mui-disabled": { color: c.disabledFg }
        },
        track: { backgroundColor: c.buttonBg },
        rail: { backgroundColor: c.inputBg, opacity: 1 },
        thumb: {
          backgroundColor: c.buttonBg,
          "&:hover": { boxShadow: `0 0 0 8px ${c.listHoverBg}` }
        }
      }
    },
    MuiRadio: {
      styleOverrides: {
        root: {
          color: c.iconFg,
          "&.Mui-checked": { color: c.buttonBg },
          "&.Mui-disabled": { color: c.disabledFg }
        }
      }
    },
    MuiFormControlLabel: {
      styleOverrides: {
        label: {
          fontSize: "0.875rem",
          color: c.foreground,
          "&.Mui-disabled": { color: c.disabledFg }
        }
      }
    },
    MuiFormLabel: {
      styleOverrides: {
        root: {
          color: c.foreground,
          "&.Mui-focused": { color: c.focusBorder },
          "&.Mui-error": { color: c.errorFg },
          "&.Mui-disabled": { color: c.disabledFg }
        }
      }
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: { backgroundColor: c.progressBarBg, borderRadius: 2 },
        bar: { backgroundColor: c.buttonBg }
      }
    },
    MuiCircularProgress: {
      styleOverrides: {
        root: { color: c.buttonBg }
      }
    },
    MuiSkeleton: {
      styleOverrides: {
        root: { backgroundColor: c.inputBg }
      }
    },
    MuiBackdrop: {
      styleOverrides: {
        root: { backgroundColor: "rgba(0, 0, 0, 0.5)" }
      }
    },
    MuiPopover: {
      styleOverrides: {
        paper: {
          backgroundColor: c.editorBg,
          border: `1px solid ${c.panelBorder}`,
          boxShadow: `0 2px 8px ${c.widgetShadow}`
        }
      }
    },
    MuiSnackbarContent: {
      styleOverrides: {
        root: {
          backgroundColor: c.notificationsBg,
          color: c.notificationsFg,
          border: `1px solid ${c.notificationsBorder}`
        }
      }
    },
    MuiTableCell: {
      styleOverrides: {
        root: { borderColor: c.panelBorder, color: c.foreground },
        head: { backgroundColor: c.editorBg, fontWeight: 600 }
      }
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          "&:hover": { backgroundColor: c.listHoverBg },
          "&.Mui-selected": {
            backgroundColor: c.listActiveSelectionBg,
            "&:hover": { backgroundColor: c.listActiveSelectionBg }
          }
        }
      }
    },
    MuiAccordion: {
      styleOverrides: {
        root: {
          backgroundColor: c.editorBg,
          border: `1px solid ${c.panelBorder}`,
          "&:before": { display: "none" },
          "&.Mui-expanded": { margin: 0 }
        }
      }
    },
    MuiAccordionSummary: {
      styleOverrides: {
        root: {
          color: c.foreground,
          "&:hover": { backgroundColor: c.listHoverBg }
        },
        expandIconWrapper: { color: c.iconFg }
      }
    },
    MuiAccordionDetails: {
      styleOverrides: {
        root: { borderTop: `1px solid ${c.panelBorder}` }
      }
    }
  };
}
