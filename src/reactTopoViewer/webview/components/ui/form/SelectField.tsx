/**
 * SelectField - Dropdown select
 */
import React from "react";
import Box from "@mui/material/Box";
import FormControl from "@mui/material/FormControl";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import InputLabel from "@mui/material/InputLabel";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import FormHelperText from "@mui/material/FormHelperText";
import ClearIcon from "@mui/icons-material/Clear";

export interface SelectOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
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
  clearable?: boolean;
}

const INLINE_FLEX_DISPLAY = "inline-flex";
const INLINE_FLEX_ALIGN_SX = {
  display: INLINE_FLEX_DISPLAY,
  alignItems: "center",
} as const;

function renderOptionLabel(
  label: string,
  icon: React.ReactNode | undefined,
  gap = 1
): React.ReactElement {
  if (icon === undefined || icon === null) {
    return <span>{label}</span>;
  }

  return (
    <Box sx={{ ...INLINE_FLEX_ALIGN_SX, gap }}>
      <Box component="span" sx={INLINE_FLEX_ALIGN_SX}>
        {icon}
      </Box>
      <span>{label}</span>
    </Box>
  );
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
  required,
  clearable,
}) => {
  const hasLabel = label !== undefined && label.length > 0;
  const hasPlaceholder = placeholder !== undefined && placeholder.length > 0;
  const hasHelperText = helperText !== undefined && helperText.length > 0;
  const showClear = clearable === true && value.length > 0 && disabled !== true;

  return (
    <FormControl fullWidth size="small" disabled={disabled} required={required}>
      {hasLabel ? <InputLabel id={`${id}-label`}>{label}</InputLabel> : null}
      <Select
        id={id}
        labelId={hasLabel ? `${id}-label` : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        label={label}
        displayEmpty={hasPlaceholder && !hasLabel}
        renderValue={(selected): React.ReactElement => {
          const selectedValue = String(selected);
          const option = options.find((opt) => opt.value === selectedValue);
          if (!option) {
            return <span>{selectedValue}</span>;
          }

          return renderOptionLabel(option.label, option.icon, 0.75);
        }}
        endAdornment={
          showClear ? (
            <InputAdornment position="end" sx={{ mr: 2 }}>
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange("");
                }}
                edge="end"
              >
                <ClearIcon fontSize="small" />
              </IconButton>
            </InputAdornment>
          ) : undefined
        }
      >
        {hasPlaceholder && !hasLabel && (
          <MenuItem value="" disabled>
            <em>{placeholder}</em>
          </MenuItem>
        )}
        {options.map((opt) => (
          <MenuItem key={opt.value} value={opt.value}>
            {renderOptionLabel(opt.label, opt.icon)}
          </MenuItem>
        ))}
      </Select>
      {hasHelperText ? <FormHelperText>{helperText}</FormHelperText> : null}
    </FormControl>
  );
};
