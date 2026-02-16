// Grid settings controls for the settings drawer.
import React from "react";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import Slider from "@mui/material/Slider";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";

import type { GridStyle } from "../../../hooks/ui";

interface GridSettingsSectionProps {
  gridLineWidth: number;
  onGridLineWidthChange: (width: number) => void;
  gridStyle: GridStyle;
  onGridStyleChange: (style: GridStyle) => void;
}

export const GridSettingsSection: React.FC<GridSettingsSectionProps> = ({
  gridLineWidth,
  onGridLineWidthChange,
  gridStyle,
  onGridStyleChange
}) => {
  const handleSliderChange = (_event: Event, value: number | number[]) => {
    onGridLineWidthChange(value as number);
  };

  const handleStyleChange = (_event: React.MouseEvent<HTMLElement>, newStyle: GridStyle | null) => {
    if (newStyle !== null) {
      onGridStyleChange(newStyle);
    }
  };

  return (
    <Box>
      <Typography variant="subtitle1" sx={{ px: 2, pt: 2, mb: "1rem" }}>
        Grid Settings
      </Typography>

      {/* Grid Line Width */}
      <Divider />
      <Box sx={{ px: 2, py: 1 }}>
        <Typography variant="subtitle2">Line Width</Typography>
      </Box>
      <Divider />
      <Box sx={{ px: 3, py: 2 }}>
        <Slider
          value={gridLineWidth}
          onChange={handleSliderChange}
          min={0.00001}
          max={2}
          step={0.1}
          valueLabelDisplay="auto"
          valueLabelFormat={(value) => value.toFixed(1)}
          size="small"
        />
      </Box>

      {/* Grid Style */}
      <Divider />
      <Box sx={{ px: 2, py: 1 }}>
        <Typography variant="subtitle2">Style</Typography>
      </Box>
      <Divider />
      <Box sx={{ p: 2 }}>
        <ToggleButtonGroup
          value={gridStyle}
          exclusive
          onChange={handleStyleChange}
          size="small"
          fullWidth
        >
          <ToggleButton value="dotted">Dotted</ToggleButton>
          <ToggleButton value="quadratic">Quadratic</ToggleButton>
        </ToggleButtonGroup>
      </Box>
    </Box>
  );
};
