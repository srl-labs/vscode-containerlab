/**
 * Section - Bordered section with title and optional inheritance badge
 */
import React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

import { InheritanceBadge } from "./Badge";

interface SectionProps {
  title: string;
  children: React.ReactNode;
  className?: string;
  hasBorder?: boolean;
  /** When true, shows an "inherited" badge indicating the values come from defaults/kinds/groups */
  inherited?: boolean;
}

export const Section: React.FC<SectionProps> = ({
  title,
  children,
  hasBorder = true,
  inherited
}) => (
  <Box
    sx={
      hasBorder
        ? { borderBottom: 1, borderColor: "divider", pb: 1.5, mb: 1.5 }
        : undefined
    }
  >
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
      <Typography
        variant="caption"
        sx={{ fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.5 }}
      >
        {title}
      </Typography>
      {inherited && <InheritanceBadge />}
    </Box>
    {children}
  </Box>
);
