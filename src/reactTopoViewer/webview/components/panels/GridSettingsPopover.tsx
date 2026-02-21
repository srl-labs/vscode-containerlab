// Grid settings popover.
import React, { useCallback, useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Typography from "@mui/material/Typography";
import Slider from "@mui/material/Slider";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Popover from "@mui/material/Popover";
import RestartAltIcon from "@mui/icons-material/RestartAlt";

import type { GridStyle } from "../../hooks/ui";
import { ColorField } from "../ui/form/ColorField";
import { invertHexColor, resolveComputedColor } from "../../utils/color";

interface GridSettingsPopoverProps {
  anchorPosition: { top: number; left: number } | null;
  onClose: () => void;
  gridLineWidth: number;
  onGridLineWidthChange: (width: number) => void;
  gridStyle: GridStyle;
  onGridStyleChange: (style: GridStyle) => void;
  gridColor: string | null;
  onGridColorChange: (color: string | null) => void;
  gridBgColor: string | null;
  onGridBgColorChange: (color: string | null) => void;
  onResetColors: () => void;
}

export const GridSettingsPopover: React.FC<GridSettingsPopoverProps> = ({
  anchorPosition,
  onClose,
  gridLineWidth,
  onGridLineWidthChange,
  gridStyle,
  onGridStyleChange,
  gridColor,
  onGridColorChange,
  gridBgColor,
  onGridBgColorChange,
  onResetColors,
}) => {
  const open = Boolean(anchorPosition);
  const isGridStyle = (value: unknown): value is GridStyle =>
    value === "dotted" || value === "quadratic";

  const [themeBgColor, setThemeBgColor] = useState("#1e1e1e");

  useEffect(() => {
    if (open) {
      setThemeBgColor(resolveComputedColor("--vscode-editor-background", "#1e1e1e"));
    }
  }, [open]);

  const effectiveBg = gridBgColor ?? themeBgColor;
  const defaultGridColor = invertHexColor(effectiveBg);

  const hasCustomColors = gridColor !== null || gridBgColor !== null;

  const handleGridColorChange = useCallback(
    (value: string) => onGridColorChange(value),
    [onGridColorChange]
  );

  const handleBgColorChange = useCallback(
    (value: string) => onGridBgColorChange(value),
    [onGridBgColorChange]
  );

  return (
    <Popover
      open={open}
      onClose={onClose}
      anchorReference="anchorPosition"
      anchorPosition={anchorPosition ?? undefined}
      transformOrigin={{ vertical: "top", horizontal: "center" }}
      data-testid="grid-settings-popover"
    >
      <Box sx={{ width: 260 }}>
        <Typography variant="subtitle1" sx={{ px: 2, pt: 2, mb: "1rem" }}>
          Grid Settings
        </Typography>

        <Box sx={{ px: 2, pb: 1 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Stroke Width
          </Typography>
          <Slider
            size="small"
            value={gridLineWidth}
            onChange={(_e, value) => onGridLineWidthChange(value)}
            min={0.00001}
            max={2}
            step={0.1}
            valueLabelDisplay="auto"
          />
        </Box>

        <Divider />

        <Box sx={{ px: 2, py: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Grid Style
          </Typography>
          <ToggleButtonGroup
            value={gridStyle}
            exclusive
            onChange={(_e, value: string | null) => {
              if (isGridStyle(value)) onGridStyleChange(value);
            }}
            size="small"
            fullWidth
          >
            <ToggleButton value="dotted">Dotted</ToggleButton>
            <ToggleButton value="quadratic">Quadratic</ToggleButton>
          </ToggleButtonGroup>
        </Box>

        <Divider />

        <Box sx={{ px: 2, py: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Grid Color
          </Typography>
          <ColorField value={gridColor ?? defaultGridColor} onChange={handleGridColorChange} />
        </Box>

        <Divider />

        <Box sx={{ px: 2, py: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Background Color
          </Typography>
          <ColorField value={gridBgColor ?? themeBgColor} onChange={handleBgColorChange} />
        </Box>

        {hasCustomColors && (
          <>
            <Divider />
            <Box sx={{ px: 2, py: 1.5 }}>
              <Button
                size="small"
                variant="text"
                startIcon={<RestartAltIcon />}
                onClick={onResetColors}
                fullWidth
              >
                Reset to theme colors
              </Button>
            </Box>
          </>
        )}
      </Box>
    </Popover>
  );
};
