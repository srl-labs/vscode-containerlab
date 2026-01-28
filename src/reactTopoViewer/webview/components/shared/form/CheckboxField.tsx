/**
 * CheckboxField - Checkbox with label
 */
import React from "react";

interface CheckboxFieldProps {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
  disabled?: boolean;
}

export const CheckboxField: React.FC<CheckboxFieldProps> = ({
  id,
  label,
  checked,
  onChange,
  className = "",
  disabled
}) => (
  <div className={`flex items-center ${className}`}>
    <input
      type="checkbox"
      id={id}
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="vscode-checkbox mr-2"
      disabled={disabled}
    />
    <label htmlFor={id} className="checkbox-label">
      {label}
    </label>
  </div>
);
