// Searchable dropdown with keyboard navigation.
import React from "react";
import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import Box from "@mui/material/Box";

export interface FilterableDropdownOption {
  value: string;
  label: string;
}

interface FilterableDropdownProps {
  id: string;
  options: FilterableDropdownOption[];
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  allowFreeText?: boolean;
  className?: string;
  disabled?: boolean;
  renderOption?: (option: FilterableDropdownOption) => React.ReactNode;
  menuClassName?: string;
  helperText?: string;
  required?: boolean;
}

export const FilterableDropdown: React.FC<FilterableDropdownProps> = ({
  id,
  options,
  value,
  onChange,
  label,
  placeholder = "Type to filter...",
  allowFreeText = false,
  disabled = false,
  renderOption,
  helperText,
  required
}) => {
  const selectedOption = options.find((opt) => opt.value === value) || null;

  return (
    <Autocomplete
      id={id}
      options={options}
      value={selectedOption}
      onChange={(_event, newValue) => {
        if (newValue) {
          onChange(typeof newValue === "string" ? newValue : newValue.value);
        } else {
          onChange("");
        }
      }}
      onInputChange={(_event, newInputValue, reason) => {
        if (allowFreeText && reason === "input") {
          onChange(newInputValue);
        }
      }}
      inputValue={allowFreeText ? value : undefined}
      getOptionLabel={(option) => {
        if (typeof option === "string") return option;
        return option.label;
      }}
      isOptionEqualToValue={(option, val) => option.value === val.value}
      freeSolo={allowFreeText}
      disabled={disabled}
      size="small"
      fullWidth
      renderOption={
        renderOption
          ? (props, option) => {
              const { key, ...otherProps } = props as React.HTMLAttributes<HTMLLIElement> & {
                key: React.Key;
              };
              return (
                <Box component="li" key={key} {...otherProps}>
                  {renderOption(option)}
                </Box>
              );
            }
          : undefined
      }
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder={placeholder}
          helperText={helperText}
          required={required}
        />
      )}
      slotProps={{
        listbox: {
          sx: { maxHeight: 200 }
        }
      }}
    />
  );
};
