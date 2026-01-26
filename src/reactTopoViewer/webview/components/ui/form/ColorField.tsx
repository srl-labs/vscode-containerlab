/**
 * ColorField - Color picker input with hex display
 */
import React from "react";

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
    <div className={`flex items-center gap-2 ${className}`}>
      <input
        type="color"
        id={id}
        value={value || "#000000"}
        onChange={handleColorChange}
        className="input-field h-8 w-14 cursor-pointer border border-gray-500 p-1"
      />
      {showHex && (
        <input
          type="text"
          value={value || ""}
          onChange={handleHexChange}
          className="input-field flex-1"
          placeholder="#000000"
          maxLength={7}
        />
      )}
    </div>
  );
};
