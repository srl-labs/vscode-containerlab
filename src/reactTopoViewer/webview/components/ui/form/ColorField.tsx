// Color picker input with hex display and optional label.
import React, { useState, useRef, useCallback, useEffect } from "react";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import TextField from "@mui/material/TextField";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";

import { normalizeHexColor } from "../../../utils/color";

interface ColorFieldProps {
  id?: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

const SWATCH_SIZE = 22;

export const ColorField: React.FC<ColorFieldProps> = ({
  id,
  label,
  value,
  onChange,
  disabled,
  className = ""
}) => {
  const normalizedValue = normalizeHexColor(value);
  const colorInputRef = useRef<HTMLInputElement>(null);
  // Local state: hex digits only (no "#").
  const [hexText, setHexText] = useState(normalizedValue.slice(1));

  // Sync the color input imperatively (uncontrolled) to avoid React's
  // controlled-input machinery firing spurious change events on color inputs.
  useEffect(() => {
    if (colorInputRef.current) {
      colorInputRef.current.value = normalizedValue;
    }
  }, [normalizedValue]);

  // Debounced sync: update hex text after the value settles.
  // Skip if the current text already represents the same color (case-insensitive).
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    const target = normalizedValue.slice(1);
    debounceRef.current = setTimeout(() => {
      setHexText((prev) => (prev.toLowerCase() === target ? prev : target));
    }, 100);
    return () => clearTimeout(debounceRef.current);
  }, [normalizedValue]);

  const handleColorChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
    },
    [onChange]
  );

  const handleHexChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value.replace(/^#/, "");
      if (/^[0-9A-Fa-f]{0,6}$/.test(raw)) {
        setHexText(raw);
        if (raw.length === 6) {
          onChange("#" + raw);
        }
      }
    },
    [onChange]
  );

  const handleCopy = useCallback(() => {
    const clipboard = globalThis.navigator?.clipboard;
    if (!clipboard?.writeText) {
      return;
    }
    clipboard.writeText(normalizedValue).catch(() => undefined);
  }, [normalizedValue]);

  const openPicker = useCallback(() => {
    colorInputRef.current?.click();
  }, []);

  return (
    <Box className={className} sx={{ opacity: disabled ? 0.4 : 1 }}>
      {/* Hidden native color input — uncontrolled, updated via ref */}
      <input
        ref={colorInputRef}
        {...(id ? { id } : {})}
        type="color"
        defaultValue={normalizedValue}
        onChange={handleColorChange}
        disabled={disabled}
        style={{
          position: "absolute",
          width: 0,
          height: 0,
          overflow: "hidden",
          opacity: 0,
          pointerEvents: "none"
        }}
      />
      <TextField
        size="small"
        label={label}
        value={hexText}
        onChange={handleHexChange}
        placeholder="000000"
        disabled={disabled}
        fullWidth
        slotProps={{
          htmlInput: { maxLength: 7 },
          input: {
            startAdornment: (
              <InputAdornment position="start" sx={{ mr: 0.75 }}>
                <Box
                  onClick={disabled ? undefined : openPicker}
                  sx={{
                    width: SWATCH_SIZE,
                    height: SWATCH_SIZE,
                    borderRadius: 0.5,
                    backgroundColor: normalizedValue,
                    cursor: disabled ? "default" : "pointer",
                    flexShrink: 0
                  }}
                />
                <Box
                  component="span"
                  sx={{ ml: 0.75, color: "text.secondary", userSelect: "none" }}
                >
                  #
                </Box>
              </InputAdornment>
            ),
            endAdornment: (
              <InputAdornment position="end">
                <IconButton
                  size="small"
                  onClick={handleCopy}
                  disabled={disabled}
                  title="Copy hex color"
                  sx={{ p: 0.25 }}
                >
                  <ContentCopyIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            )
          }
        }}
      />
    </Box>
  );
};
