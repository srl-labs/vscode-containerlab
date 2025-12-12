/**
 * GroupFormContent - Form for group editor panel
 * Allows editing group name, level, and visual styles
 */
import React from 'react';
import type { GroupStyleAnnotation } from '../../../../shared/types/topology';
import type { GroupEditorData } from '../../../hooks/groups/groupTypes';
import { GROUP_LABEL_POSITIONS } from '../../../hooks/groups/groupTypes';

interface Props {
  formData: GroupEditorData;
  updateField: <K extends keyof GroupEditorData>(field: K, value: GroupEditorData[K]) => void;
  updateStyle: <K extends keyof GroupStyleAnnotation>(field: K, value: GroupStyleAnnotation[K]) => void;
  onDelete?: () => void;
}

// Color swatch with label
const ColorSwatch: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}> = ({ label, value, onChange, disabled }) => (
  <div className="flex flex-col items-center gap-1">
    <div className={`relative w-10 h-10 rounded-xl overflow-hidden shadow-sm border-2 border-white/20 ${disabled ? 'opacity-40' : ''}`}>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="absolute inset-0 w-[150%] h-[150%] -top-1/4 -left-1/4 cursor-pointer border-0"
      />
    </div>
    <span className="text-[10px] uppercase tracking-wider text-[var(--vscode-descriptionForeground)]">{label}</span>
  </div>
);

// Text input with label
const TextInput: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}> = ({ label, value, onChange, placeholder }) => (
  <div className="flex flex-col gap-1">
    <span className="text-[10px] uppercase tracking-wider text-[var(--vscode-descriptionForeground)]">{label}</span>
    <input
      type="text"
      className="w-full px-3 py-2 bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-white/10 rounded-xl text-sm hover:border-white/20 transition-colors"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  </div>
);

// Number input with label
const NumberInput: React.FC<{
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}> = ({ label, value, onChange, min = 0, max = 999, step = 1, unit }) => (
  <div className="flex flex-col gap-1">
    <span className="text-[10px] uppercase tracking-wider text-[var(--vscode-descriptionForeground)]">{label}</span>
    <div className="relative">
      <input
        type="number"
        className="w-full px-3 py-2 bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-white/10 rounded-xl text-sm text-center hover:border-white/20 transition-colors"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        min={min}
        max={max}
        step={step}
      />
      {unit && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--vscode-descriptionForeground)] pointer-events-none">{unit}</span>
      )}
    </div>
  </div>
);

// Select input with label
const SelectInput: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}> = ({ label, value, onChange, options }) => (
  <div className="flex flex-col gap-1">
    <span className="text-[10px] uppercase tracking-wider text-[var(--vscode-descriptionForeground)]">{label}</span>
    <select
      className="w-full px-3 py-2 bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-white/10 rounded-xl text-sm cursor-pointer hover:border-white/20 transition-colors"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map(opt => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  </div>
);

// Basic info section
const BasicInfoSection: React.FC<{
  formData: GroupEditorData;
  updateField: Props['updateField'];
}> = ({ formData, updateField }) => (
  <div className="flex flex-col gap-3">
    <h4 className="text-xs font-medium text-[var(--vscode-foreground)] border-b border-white/10 pb-1">Basic Information</h4>
    <div className="grid grid-cols-2 gap-3">
      <TextInput
        label="Group Name"
        value={formData.name}
        onChange={(v) => updateField('name', v)}
        placeholder="e.g., rack1"
      />
      <TextInput
        label="Level"
        value={formData.level}
        onChange={(v) => updateField('level', v)}
        placeholder="e.g., 1"
      />
    </div>
    <SelectInput
      label="Label Position"
      value={formData.style.labelPosition ?? 'top-center'}
      onChange={(v) => updateField('style', { ...formData.style, labelPosition: v })}
      options={GROUP_LABEL_POSITIONS.map(pos => ({
        value: pos,
        label: pos.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
      }))}
    />
  </div>
);

// Background section
const BackgroundSection: React.FC<{
  formData: GroupEditorData;
  updateStyle: Props['updateStyle'];
}> = ({ formData, updateStyle }) => {
  const opacity = formData.style.backgroundOpacity ?? 20;

  return (
    <div className="flex flex-col gap-3">
      <h4 className="text-xs font-medium text-[var(--vscode-foreground)] border-b border-white/10 pb-1">Background</h4>
      <div className="flex items-end gap-4 flex-wrap">
        <ColorSwatch
          label="Color"
          value={formData.style.backgroundColor ?? '#d9d9d9'}
          onChange={(v) => updateStyle('backgroundColor', v)}
        />
        <div className="flex flex-col gap-1 flex-1 min-w-[120px]">
          <div className="flex justify-between">
            <span className="text-[10px] uppercase tracking-wider text-[var(--vscode-descriptionForeground)]">Opacity</span>
            <span className="text-[10px] text-[var(--vscode-descriptionForeground)]">{opacity}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={opacity}
            onChange={(e) => updateStyle('backgroundOpacity', parseInt(e.target.value))}
            className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
};

// Border section
const BorderSection: React.FC<{
  formData: GroupEditorData;
  updateStyle: Props['updateStyle'];
}> = ({ formData, updateStyle }) => {
  const borderRadius = formData.style.borderRadius ?? 0;

  return (
    <div className="flex flex-col gap-3">
      <h4 className="text-xs font-medium text-[var(--vscode-foreground)] border-b border-white/10 pb-1">Border</h4>
      <div className="flex items-end gap-4 flex-wrap">
        <ColorSwatch
          label="Color"
          value={formData.style.borderColor ?? '#dddddd'}
          onChange={(v) => updateStyle('borderColor', v)}
        />
        <NumberInput
          label="Width"
          value={formData.style.borderWidth ?? 0.5}
          onChange={(v) => updateStyle('borderWidth', v)}
          min={0}
          max={20}
          step={0.5}
          unit="px"
        />
        <SelectInput
          label="Style"
          value={formData.style.borderStyle ?? 'solid'}
          onChange={(v) => updateStyle('borderStyle', v as GroupStyleAnnotation['borderStyle'])}
          options={[
            { value: 'solid', label: 'Solid' },
            { value: 'dashed', label: 'Dashed' },
            { value: 'dotted', label: 'Dotted' },
            { value: 'double', label: 'Double' }
          ]}
        />
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex justify-between">
          <span className="text-[10px] uppercase tracking-wider text-[var(--vscode-descriptionForeground)]">Corner Radius</span>
          <span className="text-[10px] text-[var(--vscode-descriptionForeground)]">{borderRadius}px</span>
        </div>
        <input
          type="range"
          min={0}
          max={50}
          value={borderRadius}
          onChange={(e) => updateStyle('borderRadius', parseInt(e.target.value))}
          className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer"
        />
      </div>
    </div>
  );
};

// Text color section
const TextSection: React.FC<{
  formData: GroupEditorData;
  updateStyle: Props['updateStyle'];
}> = ({ formData, updateStyle }) => (
  <div className="flex flex-col gap-3">
    <h4 className="text-xs font-medium text-[var(--vscode-foreground)] border-b border-white/10 pb-1">Label</h4>
    <div className="flex items-end gap-4">
      <ColorSwatch
        label="Text Color"
        value={formData.style.color ?? '#ebecf0'}
        onChange={(v) => updateStyle('color', v)}
      />
    </div>
  </div>
);

// Preview section
const PreviewSection: React.FC<{ formData: GroupEditorData }> = ({ formData }) => {
  const style = formData.style;
  const bgOpacity = (style.backgroundOpacity ?? 20) / 100;

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wider text-[var(--vscode-descriptionForeground)]">Preview</span>
      <div className="relative p-4 bg-gradient-to-br from-black/30 to-black/10 rounded-xl border border-white/5 min-h-[80px] flex items-center justify-center">
        <div
          className="relative w-full h-16 flex items-start justify-center pt-1"
          style={{
            backgroundColor: style.backgroundColor ?? '#d9d9d9',
            opacity: bgOpacity,
            borderColor: style.borderColor ?? '#dddddd',
            borderWidth: `${style.borderWidth ?? 0.5}px`,
            borderStyle: style.borderStyle ?? 'solid',
            borderRadius: `${style.borderRadius ?? 0}px`
          }}
        >
          <span
            className="text-xs font-medium"
            style={{ color: style.color ?? '#ebecf0' }}
          >
            {formData.name || 'Group Name'}
          </span>
        </div>
      </div>
    </div>
  );
};

// Main component
export const GroupFormContent: React.FC<Props> = ({
  formData,
  updateField,
  updateStyle,
  onDelete
}) => (
  <div className="flex flex-col gap-4">
    <BasicInfoSection formData={formData} updateField={updateField} />
    <BackgroundSection formData={formData} updateStyle={updateStyle} />
    <BorderSection formData={formData} updateStyle={updateStyle} />
    <TextSection formData={formData} updateStyle={updateStyle} />
    <PreviewSection formData={formData} />
    {onDelete && (
      <button
        type="button"
        className="self-start text-xs text-[var(--vscode-errorForeground)] opacity-60 hover:opacity-100 transition-opacity"
        onClick={onDelete}
      >
        <i className="fas fa-trash-alt mr-1.5" />Delete Group
      </button>
    )}
  </div>
);
