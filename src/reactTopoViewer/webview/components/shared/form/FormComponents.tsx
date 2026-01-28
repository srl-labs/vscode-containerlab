/**
 * Shared form components for annotation editors
 * Used by FreeShape, FreeText, and Group editors
 */
import React from "react";

/**
 * Toggle pill button
 */
export const Toggle: React.FC<{
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className={`px-3 py-1.5 text-[11px] font-medium rounded-sm transition-all duration-150 ${
      active
        ? "bg-[var(--accent)] text-white shadow-sm"
        : "bg-white/5 text-[var(--vscode-foreground)] hover:bg-white/10 border border-white/10"
    }`}
  >
    {children}
  </button>
);

/**
 * Color swatch input with label
 */
export const ColorSwatch: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}> = ({ label, value, onChange, disabled }) => (
  <div className="flex flex-col gap-0.5">
    <span className="field-label">{label}</span>
    <div
      className={`relative w-[30px] h-[30px] rounded-sm overflow-hidden border border-white/10 hover:border-white/20 transition-colors ${disabled ? "opacity-40" : ""}`}
    >
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="absolute inset-0 w-[150%] h-[150%] -top-1/4 -left-1/4 cursor-pointer border-0"
      />
    </div>
  </div>
);

/**
 * Number input with label and optional unit
 */
export const NumberInput: React.FC<{
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}> = ({ label, value, onChange, min = 0, max = 999, step = 1, unit }) => (
  <div className="flex flex-col gap-0.5">
    <span className="field-label">{label}</span>
    <div className="relative">
      <input
        type="number"
        className="w-full px-2 py-1.5 bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-white/10 rounded-sm text-xs text-center hover:border-white/20 transition-colors"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        min={min}
        max={max}
        step={step}
      />
      {unit && (
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[var(--vscode-descriptionForeground)] pointer-events-none">
          {unit}
        </span>
      )}
    </div>
  </div>
);

/**
 * Text input with label
 */
export const TextInput: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}> = ({ label, value, onChange, placeholder }) => (
  <div className="flex flex-col gap-0.5">
    <span className="field-label">{label}</span>
    <input
      type="text"
      className="w-full px-2 py-1.5 bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-white/10 rounded-sm text-xs hover:border-white/20 transition-colors"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  </div>
);

/**
 * Select input with label
 */
export const SelectInput: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}> = ({ label, value, onChange, options }) => (
  <div className="flex flex-col gap-0.5">
    <span className="field-label">{label}</span>
    <select
      className="w-full px-2 py-1.5 bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-white/10 rounded-sm text-xs cursor-pointer hover:border-white/20 transition-colors"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  </div>
);

/**
 * Range slider with label and value display
 */
export const RangeSlider: React.FC<{
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  unit?: string;
}> = ({ label, value, onChange, min = 0, max = 100, unit = "%" }) => (
  <div className="flex flex-col gap-0.5 flex-1 min-w-[120px]">
    <div className="flex justify-between">
      <span className="field-label">{label}</span>
      <span className="field-label">
        {value}
        {unit}
      </span>
    </div>
    <div className="flex items-center h-[30px]">
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="w-full h-2 bg-white/10 rounded-sm appearance-none cursor-pointer"
      />
    </div>
  </div>
);

/**
 * Grid pattern background for previews
 */
export const PREVIEW_GRID_BG =
  "bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2220%22%20height%3D%2220%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cdefs%3E%3Cpattern%20id%3D%22grid%22%20width%3D%2220%22%20height%3D%2220%22%20patternUnits%3D%22userSpaceOnUse%22%3E%3Cpath%20d%3D%22M%200%200%20L%2020%200%2020%2020%22%20fill%3D%22none%22%20stroke%3D%22rgba(255%2C255%2C255%2C0.03)%22%20stroke-width%3D%221%22%2F%3E%3C%2Fpattern%3E%3C%2Fdefs%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20fill%3D%22url(%23grid)%22%2F%3E%3C%2Fsvg%3E')]";
