/**
 * Shared CSS variable constants and style objects for consistent theming.
 */
import type React from "react";

// CSS Variable Constants
export const CSS_BG_QUOTE = "var(--vscode-textBlockQuote-background)";
export const CSS_BORDER_QUOTE = "var(--vscode-textBlockQuote-border)";
export const CSS_PANEL_BORDER = "var(--vscode-panel-border)";
export const CSS_FOREGROUND = "var(--vscode-foreground)";
export const CSS_DESCRIPTION = "var(--vscode-descriptionForeground)";
export const CSS_INPUT_BG = "var(--vscode-input-background)";
export const CSS_INPUT_FG = "var(--vscode-input-foreground)";

// Reusable style objects
export const quoteBlockStyle: React.CSSProperties = {
  backgroundColor: CSS_BG_QUOTE,
  border: `1px solid ${CSS_BORDER_QUOTE}`
};

export const sectionBorderStyle: React.CSSProperties = {
  borderColor: CSS_PANEL_BORDER
};
