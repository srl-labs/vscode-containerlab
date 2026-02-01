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
      styleOverrides: { root: { textTransform: "none", minWidth: 0 } },
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
      defaultProps: { size: "small" }
    },
    MuiInputBase: {
      styleOverrides: { root: { fontSize: "var(--vscode-font-size)" } }
    },
    MuiTooltip: {
      styleOverrides: { tooltip: { fontSize: 12 } }
    },
    MuiDivider: {
      styleOverrides: {
        root: {
          borderColor: "var(--vscode-panel-border)"
        }
      }
    }
  }
});
