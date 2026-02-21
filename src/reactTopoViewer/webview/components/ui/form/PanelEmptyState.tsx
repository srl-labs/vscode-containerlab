import React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

interface PanelEmptyStateProps {
  icon: React.ReactNode;
  message: string;
}

export const PanelEmptyState: React.FC<PanelEmptyStateProps> = ({ icon, message }) => (
  <Box
    sx={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      height: "100%",
      gap: 2,
      color: "text.secondary",
      p: 4,
    }}
  >
    {icon}
    <Typography variant="body2" textAlign="center">
      {message}
    </Typography>
  </Box>
);
