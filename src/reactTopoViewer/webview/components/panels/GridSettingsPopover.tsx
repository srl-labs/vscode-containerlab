/**
 * GridSettingsPopover - MUI Popover for grid settings
 */
import React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Slider from "@mui/material/Slider";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Popover from "@mui/material/Popover";

import type { GridStyle } from "../../hooks/ui";

interface GridSettingsPopoverProps {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  gridLineWidth: number;
  onGridLineWidthChange: (width: number) => void;
  gridStyle: GridStyle;
  onGridStyleChange: (style: GridStyle) => void;
}

export const GridSettingsPopover: React.FC<GridSettingsPopoverProps> = ({
  anchorEl,
  onClose,
  gridLineWidth,
  onGridLineWidthChange,
  gridStyle,
  onGridStyleChange
}) => {
  const open = Boolean(anchorEl);

  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      transformOrigin={{ vertical: "top", horizontal: "center" }}
      data-testid="grid-settings-popover"
    >
      <Box sx={{ p: 2, width: 260 }}>
        <Typography variant="subtitle2" gutterBottom>
          Grid Settings
        </Typography>

        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
          Line Width
        </Typography>
        <Slider
          size="small"
          value={gridLineWidth}
          onChange={(_e, value) => onGridLineWidthChange(value as number)}
          min={0.00001}
          max={2}
          step={0.1}
          valueLabelDisplay="auto"
          sx={{ mb: 2 }}
        />

        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
          Grid Style
        </Typography>
        <ToggleButtonGroup
          value={gridStyle}
          exclusive
          onChange={(_e, value: GridStyle | null) => { if (value) onGridStyleChange(value); }}
          size="small"
          fullWidth
        >
          <ToggleButton value="dots">Dotted</ToggleButton>
          <ToggleButton value="lines">Quadratic</ToggleButton>
        </ToggleButtonGroup>
      </Box>
    </Popover>
  );
};
