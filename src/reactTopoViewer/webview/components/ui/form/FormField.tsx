// Label wrapper with optional tooltip and inheritance badge.
import React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Tooltip from "@mui/material/Tooltip";
import IconButton from "@mui/material/IconButton";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";

import { InheritanceBadge } from "./Badge";

interface FormFieldProps {
  label: string;
  children: React.ReactNode;
  className?: string;
  unit?: string;
  tooltip?: string;
  required?: boolean;
  /** When true, shows an "inherited" badge indicating the value comes from defaults/kinds/groups */
  inherited?: boolean;
}

export const FormField: React.FC<FormFieldProps> = ({
  label,
  children,
  unit,
  tooltip,
  required,
  inherited
}) => (
  <Box sx={{ mb: 1.5 }}>
    <Box sx={{ display: "flex", alignItems: "center", mb: 0.5 }}>
      <Typography
        component="label"
        variant="body2"
        sx={{
          fontWeight: (theme) => theme.typography.fontWeightMedium,
          textTransform: "uppercase",
          letterSpacing: 0.5
        }}
      >
        {label}
        {unit && (
          <Typography component="span" sx={{ ml: 0.5, textTransform: "none", fontWeight: 400 }}>
            ({unit})
          </Typography>
        )}
        {required && (
          <Typography component="span" color="error" sx={{ ml: 0.5 }}>
            *
          </Typography>
        )}
      </Typography>
      {inherited && <InheritanceBadge />}
      {tooltip && (
        <Tooltip title={tooltip} arrow placement="top">
          <IconButton size="small" sx={{ ml: 0.5, p: 0.25 }}>
            <InfoOutlinedIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
      )}
    </Box>
    {children}
  </Box>
);
