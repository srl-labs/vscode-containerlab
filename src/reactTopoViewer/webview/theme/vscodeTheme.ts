/**
 * VS Code theme factory — builds a MUI theme that delegates all colors
 * to VS Code's live CSS custom properties.
 */
import { createTheme } from "@mui/material/styles";

import { getBaseOverrides } from "./baseOverrides";
import type { ThemeColors } from "./baseOverrides";

/** Color mapping that resolves to VS Code CSS variables at runtime. */
const vscodeColors: ThemeColors = {
  editorBg: "var(--vscode-editor-background)",
  editorFg: "var(--vscode-editor-foreground)",
  sideBarBg: "var(--vscode-sideBar-background)",
  panelBorder: "var(--vscode-panel-border)",
  buttonBg: "var(--vscode-button-background)",
  buttonFg: "var(--vscode-button-foreground)",
  buttonHoverBg: "var(--vscode-button-hoverBackground)",
  buttonBorder: "var(--vscode-button-border, var(--vscode-panel-border))",
  buttonSecondaryFg: "var(--vscode-button-secondaryForeground, var(--vscode-foreground))",
  buttonSecondaryHoverBg: "var(--vscode-button-secondaryHoverBackground, var(--vscode-list-hoverBackground))",
  inputBg: "var(--vscode-input-background)",
  inputFg: "var(--vscode-input-foreground)",
  inputBorder: "var(--vscode-input-border, var(--vscode-panel-border))",
  inputPlaceholderFg: "var(--vscode-input-placeholderForeground)",
  focusBorder: "var(--vscode-focusBorder)",
  foreground: "var(--vscode-foreground)",
  descriptionFg: "var(--vscode-descriptionForeground)",
  errorFg: "var(--vscode-errorForeground)",
  iconFg: "var(--vscode-icon-foreground)",
  listHoverBg: "var(--vscode-list-hoverBackground)",
  listActiveSelectionBg: "var(--vscode-list-activeSelectionBackground)",
  listActiveSelectionFg: "var(--vscode-list-activeSelectionForeground)",
  badgeBg: "var(--vscode-badge-background)",
  badgeFg: "var(--vscode-badge-foreground)",
  textLinkFg: "var(--vscode-textLink-foreground)",
  textLinkActiveFg: "var(--vscode-textLink-activeForeground)",
  disabledFg: "var(--vscode-disabledForeground)",
  dropdownBg: "var(--vscode-dropdown-background)",
  dropdownFg: "var(--vscode-dropdown-foreground)",
  dropdownBorder: "var(--vscode-dropdown-border)",
  menuBg: "var(--vscode-menu-background, var(--vscode-dropdown-background))",
  menuBorder: "var(--vscode-menu-border, var(--vscode-dropdown-border))",
  menuFg: "var(--vscode-menu-foreground, var(--vscode-dropdown-foreground))",
  menuSelectionBg: "var(--vscode-menu-selectionBackground, var(--vscode-list-hoverBackground))",
  menuSelectionFg: "var(--vscode-menu-selectionForeground)",
  tabActiveBorderTop: "var(--vscode-tab-activeBorderTop, var(--vscode-focusBorder))",
  tabActiveFg: "var(--vscode-tab-activeForeground)",
  tabInactiveFg: "var(--vscode-tab-inactiveForeground)",
  tabHoverBg: "var(--vscode-tab-hoverBackground, var(--vscode-list-hoverBackground))",
  widgetShadow: "var(--vscode-widget-shadow)",
  widgetBg: "var(--vscode-editorWidget-background)",
  widgetFg: "var(--vscode-editorWidget-foreground)",
  widgetBorder: "var(--vscode-editorWidget-border, var(--vscode-panel-border))",
  validationErrorBg: "var(--vscode-inputValidation-errorBackground)",
  validationErrorBorder: "var(--vscode-inputValidation-errorBorder)",
  validationWarningBg: "var(--vscode-inputValidation-warningBackground)",
  validationWarningBorder: "var(--vscode-inputValidation-warningBorder)",
  validationInfoBg: "var(--vscode-inputValidation-infoBackground)",
  validationInfoBorder: "var(--vscode-inputValidation-infoBorder)",
  testingIconPassed: "var(--vscode-testing-iconPassed, var(--vscode-inputValidation-infoBorder))",
  checkboxBorder: "var(--vscode-checkbox-border, var(--vscode-icon-foreground))",
  progressBarBg: "var(--vscode-progressBar-background)",
  notificationsBg: "var(--vscode-notifications-background)",
  notificationsFg: "var(--vscode-notifications-foreground)",
  notificationsBorder: "var(--vscode-notifications-border)"
};

/**
 * Create a VS Code-integrated MUI theme for the given palette mode.
 * All colors delegate to `var(--vscode-*)` so they respond to
 * VS Code theme changes automatically.
 */
export function createVscodeTheme(mode: "light" | "dark") {
  return createTheme({
    palette: { mode },
    typography: {
      fontFamily: "var(--vscode-font-family)",
      fontSize: 13
    },
    shape: { borderRadius: 4 },
    components: getBaseOverrides(vscodeColors)
  });
}
