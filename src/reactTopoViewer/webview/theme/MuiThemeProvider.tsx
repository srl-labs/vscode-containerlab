// MUI ThemeProvider wrapper — static theme with CSS var() palette.
import React from "react";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import "@fontsource/roboto/300.css";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";

import { vscodeTheme } from "./vscodeTheme";

export const MuiThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ThemeProvider theme={vscodeTheme}>
    <CssBaseline enableColorScheme />
    {children}
  </ThemeProvider>
);
