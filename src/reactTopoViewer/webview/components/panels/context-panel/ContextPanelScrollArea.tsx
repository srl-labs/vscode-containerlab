import React from "react";
import Box from "@mui/material/Box";

/** Shared style that resets browser fieldset chrome while preserving the disabled state. */
export const FIELDSET_RESET_STYLE: React.CSSProperties = {
  border: 0,
  margin: 0,
  padding: 0,
  minInlineSize: 0
};

export const ContextPanelScrollArea: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Box sx={{ p: 2, overflow: "auto", flex: 1 }}>{children}</Box>
);

/** Scroll area with a reset fieldset that disables inputs when readOnly. */
export const EditorFieldset: React.FC<{ readOnly: boolean; children: React.ReactNode }> = ({ readOnly, children }) => (
  <ContextPanelScrollArea>
    <fieldset disabled={readOnly} style={FIELDSET_RESET_STYLE}>
      {children}
    </fieldset>
  </ContextPanelScrollArea>
);

