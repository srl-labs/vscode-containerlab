// Bordered section with title and optional inheritance badge.
import React from "react";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
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
  <>
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
        <Typography variant="overline">{title}</Typography>
        {inherited === true && <InheritanceBadge />}
      </Box>
      {children}
    </Box>
    {hasBorder && <Divider sx={{ my: 1.5 }} />}
  </>
);
