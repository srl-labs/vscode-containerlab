/**
 * Badge components for form fields
 */
import React from "react";
import Chip from "@mui/material/Chip";
import Box from "@mui/material/Box";

/**
 * Inheritance badge - shown when a field value comes from defaults, kinds, or groups
 */
export const InheritanceBadge: React.FC = () => (
  <Chip
    label="inherited"
    size="small"
    variant="outlined"
    sx={{
      ml: 1,
      height: 18,
      fontSize: "0.625rem",
      fontWeight: 500
    }}
  />
);

/**
 * Read-only badge for displaying non-editable values
 */
export const ReadOnlyBadge: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Box
    component="span"
    sx={{
      display: "inline-block",
      px: 1,
      py: 0.5,
      borderRadius: 0.5,
      bgcolor: "action.hover",
      fontSize: "1rem"
    }}
  >
    {children}
  </Box>
);
