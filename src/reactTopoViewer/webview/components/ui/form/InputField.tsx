// Text or number input field.
import React from "react";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Tooltip from "@mui/material/Tooltip";
import InputAdornment from "@mui/material/InputAdornment";
import IconButton from "@mui/material/IconButton";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import ClearIcon from "@mui/icons-material/Clear";

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
  error?: boolean;
  /** Fixed text suffix shown inside the input (e.g. "seconds") */
  suffix?: string;
  /** Show a clear (×) button when the field has a value */
  clearable?: boolean;
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
  required,
  error,
  suffix,
  clearable
}) => {
  const showClear = clearable && value && !disabled;
  const hasEndAdornment = tooltip || suffix || showClear;

  return (
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
      error={error}
      helperText={helperText}
      slotProps={{
        htmlInput: {
          min,
          max,
          step
        },
        input: hasEndAdornment
          ? {
              endAdornment: (
                <InputAdornment position="end">
                  {suffix && (
                    <Typography color="text.secondary">
                      {suffix}
                    </Typography>
                  )}
                  {showClear && (
                    <IconButton size="small" onClick={() => onChange("")} edge="end" tabIndex={-1}>
                      <ClearIcon fontSize="small" />
                    </IconButton>
                  )}
                  {tooltip && (
                    <Tooltip title={tooltip} arrow>
                      <IconButton size="small" edge="end" tabIndex={-1}>
                        <InfoOutlinedIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                  )}
                </InputAdornment>
              )
            }
          : undefined
      }}
    />
  );
};
