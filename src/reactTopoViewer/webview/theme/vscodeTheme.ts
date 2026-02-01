import { createTheme } from "@mui/material/styles";

const editorBackground = "var(--vscode-editor-background)";

export const theme = createTheme({
  palette: {
    background: {
      default: editorBackground,
      paper: editorBackground
    },
    text: {
      primary: "var(--vscode-editor-foreground)",
      secondary: "var(--vscode-descriptionForeground)"
    },
    primary: {
      main: "var(--vscode-button-background)",
      contrastText: "var(--vscode-button-foreground)"
    },
    secondary: {
      main: "var(--vscode-button-secondaryBackground)",
      contrastText: "var(--vscode-button-secondaryForeground)"
    },
    divider: "var(--vscode-panel-border)",
    action: { hover: "var(--vscode-list-hoverBackground)" }
  },
  typography: {
    fontFamily: "var(--vscode-font-family)",
    fontSize: 13
  },
  shape: { borderRadius: 4 },
  components: {
    MuiCssBaseline: {
      styleOverrides: { body: { backgroundColor: editorBackground } }
    },
    MuiButton: {
      styleOverrides: { root: { textTransform: "none", minWidth: 0 } },
      defaultProps: { disableElevation: true }
    },
    MuiPaper: {
      styleOverrides: { root: { backgroundImage: "none" } }
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
    }
  }
});
