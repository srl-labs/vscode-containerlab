/**
 * GridSettingsSection - Grid settings controls for the Settings Drawer
 */
import React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Slider from "@mui/material/Slider";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import FormLabel from "@mui/material/FormLabel";

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

  const handleStyleChange = (
    _event: React.MouseEvent<HTMLElement>,
    newStyle: GridStyle | null
  ) => {
    if (newStyle !== null) {
      onGridStyleChange(newStyle);
    }
  };

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        Grid Settings
      </Typography>

      {/* Grid Line Width */}
      <Box sx={{ mb: 3 }}>
        <FormLabel sx={{ display: "block", mb: 1, fontSize: "0.875rem" }}>
          Grid Line Width
        </FormLabel>
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
        <Typography variant="caption" color="text.secondary">
          Adjust the thickness of grid lines (0 = hidden, 2 = maximum)
        </Typography>
      </Box>

      {/* Grid Style */}
      <Box>
        <FormLabel sx={{ display: "block", mb: 1, fontSize: "0.875rem" }}>
          Grid Style
        </FormLabel>
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
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
          Choose between dotted grid pattern or quadratic (lines)
        </Typography>
      </Box>
    </Box>
  );
};
