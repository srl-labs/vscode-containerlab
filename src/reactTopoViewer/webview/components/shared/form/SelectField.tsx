/**
 * SelectField - Dropdown select
 */
import React from 'react';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export const SelectField: React.FC<SelectFieldProps> = ({
  id,
  value,
  onChange,
  options,
  placeholder,
  className = '',
  disabled
}) => (
  <select
    id={id}
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className={`input-field w-full ${className}`}
    disabled={disabled}
  >
    {placeholder && <option value="">{placeholder}</option>}
    {options.map((opt) => (
      <option key={opt.value} value={opt.value}>{opt.label}</option>
    ))}
  </select>
);
