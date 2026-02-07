/**
 * ColorField - Color picker input with hex display
 */
import React from "react";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";

interface ColorFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  showHex?: boolean;
}

export const ColorField: React.FC<ColorFieldProps> = ({
  id,
  value,
  onChange,
  className = "",
  showHex = true
}) => {
  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  };

  const handleHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const hex = e.target.value;
    if (/^#[0-9A-Fa-f]{0,6}$/.test(hex)) {
      onChange(hex);
    }
  };

  return (
    <Box className={className} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
      <Box
        component="input"
        type="color"
        id={id}
        value={value || "#000000"}
        onChange={handleColorChange}
        sx={{
          height: 32,
          width: 56,
          cursor: "pointer",
          border: 1,
          borderColor: "divider",
          borderRadius: 0.5,
          p: 0.5
        }}
      />
      {showHex && (
        <TextField
          size="small"
          value={value || ""}
          onChange={handleHexChange}
          placeholder="#000000"
          slotProps={{ htmlInput: { maxLength: 7 } }}
          sx={{ flex: 1, "& .MuiInputBase-input": { fontSize: "0.75rem" } }}
        />
      )}
    </Box>
  );
};
