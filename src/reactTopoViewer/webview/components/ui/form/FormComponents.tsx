// Shared form components for annotation editors.
import React from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import type { SxProps, Theme } from "@mui/material/styles";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import Typography from "@mui/material/Typography";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import Slider from "@mui/material/Slider";
import DeleteIcon from "@mui/icons-material/Delete";

/**
 * Toggle pill button
 */
export const Toggle: React.FC<{
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  sx?: SxProps<Theme>;
}> = ({ active, onClick, children, sx }) => (
  <Button
    variant={active ? "contained" : "outlined"}
    size="small"
    onClick={onClick}
    sx={{
      fontWeight: (theme) => theme.typography.fontWeightMedium,
      minWidth: 0,
      px: 1.5,
      py: 0.5,
      ...(sx as object)
    }}
  >
    {children}
  </Button>
);

/**
 * Number input with label and optional unit
 */
export const NumberInput: React.FC<{
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}> = ({ label, value, onChange, min = 0, max = 999, step = 1, unit }) => (
  <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
    <Typography variant="caption" color="text.secondary">
      {label}
    </Typography>
    <TextField
      type="number"
      size="small"
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      slotProps={{
        htmlInput: { min, max, step, style: { textAlign: "center" } },
        input: unit
          ? {
              endAdornment: (
                <InputAdornment position="end">
                  <Typography variant="caption" color="text.secondary">
                    {unit}
                  </Typography>
                </InputAdornment>
              )
            }
          : undefined
      }}
      sx={{ "& .MuiInputBase-input": { py: 0.75, px: 1 } }}
    />
  </Box>
);

/**
 * Text input with label
 */
export const TextInput: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}> = ({ label, value, onChange, placeholder }) => (
  <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
    <Typography variant="caption" color="text.secondary">
      {label}
    </Typography>
    <TextField
      size="small"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      sx={{ "& .MuiInputBase-input": { py: 0.75, px: 1 } }}
    />
  </Box>
);

/**
 * Select input with label
 */
export const SelectInput: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}> = ({ label, value, onChange, options }) => (
  <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
    <Typography variant="caption" color="text.secondary">
      {label}
    </Typography>
    <FormControl size="small">
      <Select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        sx={{ "& .MuiSelect-select": { py: 0.75, px: 1 } }}
      >
        {options.map((opt) => (
          <MenuItem key={opt.value} value={opt.value}>
            {opt.label}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  </Box>
);

/**
 * Range slider with label and value display
 */
export const RangeSlider: React.FC<{
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  unit?: string;
}> = ({ label, value, onChange, min = 0, max = 100, unit = "%" }) => (
  <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25, flex: 1, minWidth: 120 }}>
    <Box sx={{ display: "flex", justifyContent: "space-between" }}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {value}
        {unit}
      </Typography>
    </Box>
    <Box sx={{ display: "flex", alignItems: "center", height: 30, px: 0.5 }}>
      <Slider
        size="small"
        min={min}
        max={max}
        value={value}
        onChange={(_e, v) => onChange(v as number)}
      />
    </Box>
  </Box>
);

/**
 * Grid pattern background for previews (sx-compatible style object)
 */
export const PREVIEW_GRID_BG_SX = {
  backgroundImage:
    "url('data:image/svg+xml,%3Csvg%20width%3D%2220%22%20height%3D%2220%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cdefs%3E%3Cpattern%20id%3D%22grid%22%20width%3D%2220%22%20height%3D%2220%22%20patternUnits%3D%22userSpaceOnUse%22%3E%3Cpath%20d%3D%22M%200%200%20L%2020%200%2020%2020%22%20fill%3D%22none%22%20stroke%3D%22rgba(255%2C255%2C255%2C0.03)%22%20stroke-width%3D%221%22%2F%3E%3C%2Fpattern%3E%3C%2Fdefs%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20fill%3D%22url(%23grid)%22%2F%3E%3C%2Fsvg%3E')"
};

/**
 * Preview surface used by annotation editors.
 * Renders a bordered panel with a subtle grid background.
 */
export const PreviewSurface: React.FC<{
  minHeight?: number;
  padding?: number;
  gridOpacity?: number;
  children: React.ReactNode;
}> = ({ minHeight = 80, padding = 3, gridOpacity = 0.5, children }) => (
  <Box
    sx={{
      position: "relative",
      p: padding,
      borderRadius: 0.5,
      border: 1,
      minHeight,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden"
    }}
  >
    <Box sx={{ position: "absolute", inset: 0, opacity: gridOpacity, ...PREVIEW_GRID_BG_SX }} />
    {children}
  </Box>
);

export const DeleteActionButton: React.FC<{
  onClick: () => void;
  label?: string;
  alignSelf?: string;
}> = ({ onClick, label = "Delete", alignSelf = "flex-start" }) => (
  <Button
    variant="text"
    color="error"
    size="small"
    startIcon={<DeleteIcon />}
    onClick={onClick}
    sx={{ alignSelf }}
  >
    {label}
  </Button>
);
