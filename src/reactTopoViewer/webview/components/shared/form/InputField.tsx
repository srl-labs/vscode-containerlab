/**
 * InputField - Text or number input
 */
import React from 'react';

interface InputFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: 'text' | 'number';
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  disabled?: boolean;
}

export const InputField: React.FC<InputFieldProps> = ({
  id,
  value,
  onChange,
  placeholder,
  type = 'text',
  min,
  max,
  step,
  className = '',
  disabled
}) => (
  <input
    type={type}
    id={id}
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className={`input-field w-full ${className}`}
    placeholder={placeholder}
    min={min}
    max={max}
    step={step}
    disabled={disabled}
  />
);
