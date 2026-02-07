/**
 * SelectField - Dropdown select
 */
import React from "react";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import FormHelperText from "@mui/material/FormHelperText";

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  label?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  helperText?: string;
  required?: boolean;
}

export const SelectField: React.FC<SelectFieldProps> = ({
  id,
  value,
  onChange,
  options,
  label,
  placeholder,
  disabled,
  helperText,
  required
}) => (
  <FormControl fullWidth size="small" disabled={disabled} required={required}>
    {label && <InputLabel id={`${id}-label`}>{label}</InputLabel>}
    <Select
      id={id}
      labelId={label ? `${id}-label` : undefined}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      label={label}
      displayEmpty={!!placeholder && !label}
    >
      {placeholder && !label && (
        <MenuItem value="" disabled>
          <em>{placeholder}</em>
        </MenuItem>
      )}
      {options.map((opt) => (
        <MenuItem key={opt.value} value={opt.value}>
          {opt.label}
        </MenuItem>
      ))}
    </Select>
    {helperText && <FormHelperText>{helperText}</FormHelperText>}
  </FormControl>
);
