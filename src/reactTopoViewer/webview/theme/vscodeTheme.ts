import { createTheme } from "@mui/material/styles";

export const theme = createTheme({
  palette: { mode: "dark" },
  typography: {
    fontFamily: "var(--vscode-font-family)",
    fontSize: 13
  },
  shape: { borderRadius: 4 },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: "var(--vscode-editor-background)",
          color: "var(--vscode-editor-foreground)"
        }
      }
    },
    MuiButton: {
      styleOverrides: {
        root: { textTransform: "none", minWidth: 0 },
        contained: {
          backgroundColor: "var(--vscode-button-background)",
          color: "var(--vscode-button-foreground)",
          "&:hover": {
            backgroundColor: "var(--vscode-button-hoverBackground)"
          },
          "&.Mui-disabled": {
            backgroundColor: "var(--vscode-button-background)",
            color: "var(--vscode-disabledForeground)",
            opacity: 0.5
          }
        },
        outlined: {
          borderColor: "var(--vscode-button-border, var(--vscode-panel-border))",
          color: "var(--vscode-button-secondaryForeground, var(--vscode-foreground))",
          "&:hover": {
            backgroundColor: "var(--vscode-button-secondaryHoverBackground, var(--vscode-list-hoverBackground))",
            borderColor: "var(--vscode-button-border, var(--vscode-panel-border))"
          },
          "&.Mui-disabled": {
            borderColor: "var(--vscode-panel-border)",
            color: "var(--vscode-disabledForeground)"
          }
        },
        text: {
          color: "var(--vscode-textLink-foreground)",
          "&:hover": {
            backgroundColor: "var(--vscode-list-hoverBackground)"
          },
          "&.Mui-disabled": {
            color: "var(--vscode-disabledForeground)"
          }
        }
      },
      defaultProps: { disableElevation: true }
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          color: "var(--vscode-icon-foreground)",
          "&:hover": { backgroundColor: "var(--vscode-list-hoverBackground)" },
          "&.Mui-disabled": {
            color: "var(--vscode-disabledForeground)"
          }
        }
      }
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          backgroundColor: "var(--vscode-editor-background)"
        }
      }
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: "var(--vscode-editor-background)",
          color: "var(--vscode-editor-foreground)"
        }
      }
    },
    MuiToolbar: {
      styleOverrides: {
        root: { borderBottom: "1px solid var(--vscode-panel-border)" }
      }
    },
    MuiTypography: {
      styleOverrides: {
        root: { color: "var(--vscode-editor-foreground)" }
      }
    },
    MuiTextField: {
      defaultProps: { size: "small", variant: "outlined" }
    },
    MuiSelect: {
      defaultProps: { size: "small" },
      styleOverrides: {
        root: {
          backgroundColor: "var(--vscode-input-background)",
          color: "var(--vscode-input-foreground)",
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: "var(--vscode-focusBorder)"
          },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
            borderColor: "var(--vscode-focusBorder)"
          }
        },
        icon: {
          color: "var(--vscode-icon-foreground)"
        }
      }
    },
    MuiInputBase: {
      styleOverrides: {
        root: {
          fontSize: "var(--vscode-font-size)",
          color: "var(--vscode-input-foreground)",
          "&.Mui-disabled": {
            color: "var(--vscode-disabledForeground)"
          }
        },
        input: {
          "&::placeholder": {
            color: "var(--vscode-input-placeholderForeground)",
            opacity: 1
          }
        }
      }
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: "var(--vscode-input-background)",
          color: "var(--vscode-input-foreground)",
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: "var(--vscode-focusBorder)"
          },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
            borderColor: "var(--vscode-focusBorder)"
          },
          "&.Mui-error .MuiOutlinedInput-notchedOutline": {
            borderColor: "var(--vscode-inputValidation-errorBorder)"
          },
          "&.Mui-disabled": {
            backgroundColor: "var(--vscode-input-background)",
            opacity: 0.5,
            "& .MuiOutlinedInput-notchedOutline": {
              borderColor: "var(--vscode-panel-border)"
            }
          }
        },
        notchedOutline: {
          borderColor: "var(--vscode-input-border, var(--vscode-panel-border))"
        },
        input: {
          "&::placeholder": {
            color: "var(--vscode-input-placeholderForeground)",
            opacity: 1
          }
        }
      }
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          color: "var(--vscode-foreground)",
          "&.Mui-focused": {
            color: "var(--vscode-focusBorder)"
          },
          "&.Mui-error": {
            color: "var(--vscode-errorForeground)"
          },
          "&.Mui-disabled": {
            color: "var(--vscode-disabledForeground)"
          }
        }
      }
    },
    MuiFormHelperText: {
      styleOverrides: {
        root: {
          color: "var(--vscode-descriptionForeground)",
          "&.Mui-error": {
            color: "var(--vscode-errorForeground)"
          },
          "&.Mui-disabled": {
            color: "var(--vscode-disabledForeground)"
          }
        }
      }
    },
    MuiCheckbox: {
      styleOverrides: {
        root: {
          color: "var(--vscode-checkbox-border, var(--vscode-icon-foreground))",
          "&.Mui-checked": {
            color: "var(--vscode-button-background)"
          },
          "&.Mui-disabled": {
            color: "var(--vscode-disabledForeground)"
          }
        }
      }
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          backgroundColor: "var(--vscode-menu-background, var(--vscode-dropdown-background))",
          border: "1px solid var(--vscode-menu-border, var(--vscode-dropdown-border))",
          boxShadow: "0 2px 8px var(--vscode-widget-shadow)"
        },
        list: {
          padding: "4px 0"
        }
      }
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          color: "var(--vscode-menu-foreground, var(--vscode-dropdown-foreground))",
          "&:hover": {
            backgroundColor: "var(--vscode-menu-selectionBackground, var(--vscode-list-hoverBackground))"
          },
          "&.Mui-selected": {
            backgroundColor: "var(--vscode-menu-selectionBackground)",
            color: "var(--vscode-menu-selectionForeground)",
            "&:hover": {
              backgroundColor: "var(--vscode-menu-selectionBackground)"
            }
          },
          "&.Mui-disabled": {
            color: "var(--vscode-disabledForeground)",
            opacity: 1
          }
        }
      }
    },
    MuiTabs: {
      styleOverrides: {
        root: {
          minHeight: 36
        },
        indicator: {
          backgroundColor: "var(--vscode-tab-activeBorderTop, var(--vscode-focusBorder))"
        }
      }
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: "none",
          minHeight: 36,
          color: "var(--vscode-tab-inactiveForeground)",
          "&:hover": {
            backgroundColor: "var(--vscode-tab-hoverBackground, var(--vscode-list-hoverBackground))"
          },
          "&.Mui-selected": {
            color: "var(--vscode-tab-activeForeground)"
          },
          "&.Mui-disabled": {
            color: "var(--vscode-disabledForeground)"
          }
        }
      }
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          backgroundColor: "var(--vscode-editor-background)",
          border: "1px solid var(--vscode-panel-border)",
          boxShadow: "0 4px 16px var(--vscode-widget-shadow)"
        }
      }
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: {
          color: "var(--vscode-foreground)",
          borderBottom: "1px solid var(--vscode-panel-border)"
        }
      }
    },
    MuiDialogContent: {
      styleOverrides: {
        root: {
          backgroundColor: "var(--vscode-editor-background)",
          color: "var(--vscode-foreground)"
        }
      }
    },
    MuiDialogActions: {
      styleOverrides: {
        root: {
          borderTop: "1px solid var(--vscode-panel-border)"
        }
      }
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          fontSize: 12,
          backgroundColor: "var(--vscode-editorWidget-background)",
          color: "var(--vscode-editorWidget-foreground)",
          border: "1px solid var(--vscode-editorWidget-border, var(--vscode-panel-border))"
        },
        arrow: {
          color: "var(--vscode-editorWidget-background)"
        }
      }
    },
    MuiChip: {
      styleOverrides: {
        root: {
          backgroundColor: "var(--vscode-badge-background)",
          color: "var(--vscode-badge-foreground)",
          border: "1px solid var(--vscode-panel-border)",
          "&.Mui-disabled": {
            opacity: 0.5
          }
        },
        deleteIcon: {
          color: "var(--vscode-badge-foreground)",
          "&:hover": {
            color: "var(--vscode-errorForeground)"
          }
        },
        outlined: {
          backgroundColor: "transparent",
          borderColor: "var(--vscode-panel-border)",
          color: "var(--vscode-foreground)"
        }
      }
    },
    MuiBadge: {
      styleOverrides: {
        badge: {
          backgroundColor: "var(--vscode-badge-background)",
          color: "var(--vscode-badge-foreground)"
        }
      }
    },
    MuiAutocomplete: {
      styleOverrides: {
        paper: {
          backgroundColor: "var(--vscode-dropdown-background)",
          border: "1px solid var(--vscode-dropdown-border)",
          boxShadow: "0 2px 8px var(--vscode-widget-shadow)"
        },
        listbox: {
          padding: "4px 0"
        },
        option: {
          color: "var(--vscode-dropdown-foreground)",
          "&:hover": {
            backgroundColor: "var(--vscode-list-hoverBackground)"
          },
          "&[aria-selected='true']": {
            backgroundColor: "var(--vscode-list-activeSelectionBackground)",
            color: "var(--vscode-list-activeSelectionForeground)"
          },
          "&.Mui-focused": {
            backgroundColor: "var(--vscode-list-hoverBackground)"
          }
        },
        clearIndicator: {
          color: "var(--vscode-icon-foreground)"
        },
        popupIndicator: {
          color: "var(--vscode-icon-foreground)"
        }
      }
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          border: "1px solid"
        },
        standardError: {
          backgroundColor: "var(--vscode-inputValidation-errorBackground)",
          borderColor: "var(--vscode-inputValidation-errorBorder)",
          color: "var(--vscode-foreground)"
        },
        standardWarning: {
          backgroundColor: "var(--vscode-inputValidation-warningBackground)",
          borderColor: "var(--vscode-inputValidation-warningBorder)",
          color: "var(--vscode-foreground)"
        },
        standardInfo: {
          backgroundColor: "var(--vscode-inputValidation-infoBackground)",
          borderColor: "var(--vscode-inputValidation-infoBorder)",
          color: "var(--vscode-foreground)"
        },
        standardSuccess: {
          backgroundColor: "var(--vscode-inputValidation-infoBackground)",
          borderColor: "var(--vscode-testing-iconPassed, var(--vscode-inputValidation-infoBorder))",
          color: "var(--vscode-foreground)"
        },
        icon: {
          color: "inherit"
        }
      }
    },
    MuiSwitch: {
      styleOverrides: {
        root: {
          width: 42,
          height: 26,
          padding: 0
        },
        switchBase: {
          padding: 1,
          "&.Mui-checked": {
            color: "var(--vscode-button-foreground)",
            transform: "translateX(16px)",
            "& + .MuiSwitch-track": {
              backgroundColor: "var(--vscode-button-background)",
              opacity: 1
            }
          },
          "&.Mui-disabled": {
            color: "var(--vscode-disabledForeground)",
            "& + .MuiSwitch-track": {
              opacity: 0.3
            }
          }
        },
        thumb: {
          backgroundColor: "var(--vscode-button-foreground)",
          width: 24,
          height: 24
        },
        track: {
          borderRadius: 13,
          backgroundColor: "var(--vscode-input-background)",
          border: "1px solid var(--vscode-input-border, var(--vscode-panel-border))",
          opacity: 1
        }
      }
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundColor: "var(--vscode-editor-background)",
          border: "1px solid var(--vscode-panel-border)",
          boxShadow: "none"
        }
      }
    },
    MuiCardHeader: {
      styleOverrides: {
        root: {
          borderBottom: "1px solid var(--vscode-panel-border)"
        },
        title: {
          color: "var(--vscode-foreground)"
        },
        subheader: {
          color: "var(--vscode-descriptionForeground)"
        }
      }
    },
    MuiCardContent: {
      styleOverrides: {
        root: {
          color: "var(--vscode-foreground)"
        }
      }
    },
    MuiLink: {
      styleOverrides: {
        root: {
          color: "var(--vscode-textLink-foreground)",
          "&:hover": {
            color: "var(--vscode-textLink-activeForeground)"
          }
        }
      }
    },
    MuiDivider: {
      styleOverrides: {
        root: {
          borderColor: "var(--vscode-panel-border)"
        }
      }
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: "var(--vscode-sideBar-background)",
          borderRight: "1px solid var(--vscode-panel-border)",
          color: "var(--vscode-editor-foreground)"
        }
      }
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          "&:hover": {
            backgroundColor: "var(--vscode-list-hoverBackground)"
          },
          "&.Mui-selected": {
            backgroundColor: "var(--vscode-list-activeSelectionBackground)",
            color: "var(--vscode-list-activeSelectionForeground)",
            "&:hover": {
              backgroundColor: "var(--vscode-list-activeSelectionBackground)"
            }
          }
        }
      }
    },
    MuiListItemIcon: {
      styleOverrides: {
        root: {
          color: "var(--vscode-icon-foreground)",
          minWidth: 36
        }
      }
    },
    MuiListItemText: {
      styleOverrides: {
        primary: {
          color: "var(--vscode-foreground)"
        },
        secondary: {
          color: "var(--vscode-descriptionForeground)"
        }
      }
    },
    MuiSlider: {
      styleOverrides: {
        root: {
          color: "var(--vscode-button-background)",
          "&.Mui-disabled": {
            color: "var(--vscode-disabledForeground)"
          }
        },
        track: {
          backgroundColor: "var(--vscode-button-background)"
        },
        rail: {
          backgroundColor: "var(--vscode-input-background)",
          opacity: 1
        },
        thumb: {
          backgroundColor: "var(--vscode-button-background)",
          "&:hover": {
            boxShadow: "0 0 0 8px var(--vscode-list-hoverBackground)"
          }
        }
      }
    },
    MuiRadio: {
      styleOverrides: {
        root: {
          color: "var(--vscode-icon-foreground)",
          "&.Mui-checked": {
            color: "var(--vscode-button-background)"
          },
          "&.Mui-disabled": {
            color: "var(--vscode-disabledForeground)"
          }
        }
      }
    },
    MuiFormControlLabel: {
      styleOverrides: {
        label: {
          fontSize: "0.875rem",
          color: "var(--vscode-foreground)",
          "&.Mui-disabled": {
            color: "var(--vscode-disabledForeground)"
          }
        }
      }
    },
    MuiFormLabel: {
      styleOverrides: {
        root: {
          color: "var(--vscode-foreground)",
          "&.Mui-focused": {
            color: "var(--vscode-focusBorder)"
          },
          "&.Mui-error": {
            color: "var(--vscode-errorForeground)"
          },
          "&.Mui-disabled": {
            color: "var(--vscode-disabledForeground)"
          }
        }
      }
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: {
          backgroundColor: "var(--vscode-progressBar-background)",
          borderRadius: 2
        },
        bar: {
          backgroundColor: "var(--vscode-button-background)"
        }
      }
    },
    MuiCircularProgress: {
      styleOverrides: {
        root: {
          color: "var(--vscode-button-background)"
        }
      }
    },
    MuiSkeleton: {
      styleOverrides: {
        root: {
          backgroundColor: "var(--vscode-input-background)"
        }
      }
    },
    MuiBackdrop: {
      styleOverrides: {
        root: {
          backgroundColor: "rgba(0, 0, 0, 0.5)"
        }
      }
    },
    MuiPopover: {
      styleOverrides: {
        paper: {
          backgroundColor: "var(--vscode-editor-background)",
          border: "1px solid var(--vscode-panel-border)",
          boxShadow: "0 2px 8px var(--vscode-widget-shadow)"
        }
      }
    },
    MuiSnackbarContent: {
      styleOverrides: {
        root: {
          backgroundColor: "var(--vscode-notifications-background)",
          color: "var(--vscode-notifications-foreground)",
          border: "1px solid var(--vscode-notifications-border)"
        }
      }
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderColor: "var(--vscode-panel-border)",
          color: "var(--vscode-foreground)"
        },
        head: {
          backgroundColor: "var(--vscode-editor-background)",
          fontWeight: 600
        }
      }
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          "&:hover": {
            backgroundColor: "var(--vscode-list-hoverBackground)"
          },
          "&.Mui-selected": {
            backgroundColor: "var(--vscode-list-activeSelectionBackground)",
            "&:hover": {
              backgroundColor: "var(--vscode-list-activeSelectionBackground)"
            }
          }
        }
      }
    },
    MuiAccordion: {
      styleOverrides: {
        root: {
          backgroundColor: "var(--vscode-editor-background)",
          border: "1px solid var(--vscode-panel-border)",
          "&:before": {
            display: "none"
          },
          "&.Mui-expanded": {
            margin: 0
          }
        }
      }
    },
    MuiAccordionSummary: {
      styleOverrides: {
        root: {
          color: "var(--vscode-foreground)",
          "&:hover": {
            backgroundColor: "var(--vscode-list-hoverBackground)"
          }
        },
        expandIconWrapper: {
          color: "var(--vscode-icon-foreground)"
        }
      }
    },
    MuiAccordionDetails: {
      styleOverrides: {
        root: {
          borderTop: "1px solid var(--vscode-panel-border)"
        }
      }
    }
  }
});
