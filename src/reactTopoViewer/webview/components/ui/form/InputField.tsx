/**
 * InputField - Text or number input
 */
import React from "react";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import InputAdornment from "@mui/material/InputAdornment";
import IconButton from "@mui/material/IconButton";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";

interface InputFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  type?: "text" | "number";
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  disabled?: boolean;
  helperText?: string;
  tooltip?: string;
  required?: boolean;
}

export const InputField: React.FC<InputFieldProps> = ({
  id,
  value,
  onChange,
  label,
  placeholder,
  type = "text",
  min,
  max,
  step,
  disabled,
  helperText,
  tooltip,
  required
}) => (
  <TextField
    id={id}
    type={type}
    value={value}
    onChange={(e) => onChange(e.target.value)}
    label={label}
    placeholder={placeholder}
    disabled={disabled}
    size="small"
    fullWidth
    required={required}
    helperText={helperText}
    inputProps={{
      min,
      max,
      step
    }}
    InputProps={
      tooltip
        ? {
            endAdornment: (
              <InputAdornment position="end">
                <Tooltip title={tooltip} arrow>
                  <IconButton size="small" edge="end" tabIndex={-1}>
                    <InfoOutlinedIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              </InputAdornment>
            )
          }
        : undefined
    }
  />
);
