import React from "react";
import Box from "@mui/material/Box";

export const ContextPanelScrollArea: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Box sx={{ p: 2, overflow: "auto", flex: 1 }}>{children}</Box>
);

