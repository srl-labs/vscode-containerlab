/**
 * FreeShapeFormContent - Sleek, modern form for shape annotation editing
 * Matches the style of FreeTextFormContent
 */
import React, { useMemo } from 'react';
import { FreeShapeAnnotation } from '../../../../shared/types/topology';
import {
  DEFAULT_SHAPE_WIDTH,
  DEFAULT_SHAPE_HEIGHT,
  DEFAULT_FILL_COLOR,
  DEFAULT_FILL_OPACITY,
  DEFAULT_BORDER_COLOR,
  DEFAULT_BORDER_WIDTH,
  DEFAULT_BORDER_STYLE,
  DEFAULT_ARROW_SIZE,
  DEFAULT_CORNER_RADIUS
} from '../../../hooks/annotations/freeShapeHelpers';
import { buildShapeSvg } from '../../annotations/freeShapeLayerHelpers';

interface Props {
  formData: FreeShapeAnnotation;
  updateField: <K extends keyof FreeShapeAnnotation>(field: K, value: FreeShapeAnnotation[K]) => void;
  isNew: boolean;
  onDelete?: () => void;
}

// Toggle pill button
const Toggle: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className={`px-3 py-1.5 text-xs font-medium rounded-full transition-all duration-150 ${
      active
        ? 'bg-[var(--accent)] text-white shadow-sm'
        : 'bg-white/5 text-[var(--vscode-foreground)] hover:bg-white/10 border border-white/10'
    }`}
  >
    {children}
  </button>
);

// Color swatch with label
const ColorSwatch: React.FC<{ label: string; value: string; onChange: (v: string) => void; disabled?: boolean }> = ({ label, value, onChange, disabled }) => (
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

// Number input with label
const NumberInput: React.FC<{
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  unit?: string;
}> = ({ label, value, onChange, min = 0, max = 999, unit }) => (
  <div className="flex flex-col gap-1">
    <span className="text-[10px] uppercase tracking-wider text-[var(--vscode-descriptionForeground)]">{label}</span>
    <div className="relative">
      <input
        type="number"
        className="w-full px-3 py-2 bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-white/10 rounded-xl text-sm text-center hover:border-white/20 transition-colors"
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value) || 0)}
        min={min}
        max={max}
      />
      {unit && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--vscode-descriptionForeground)] pointer-events-none">{unit}</span>
      )}
    </div>
  </div>
);

// Shape type selector
const ShapeTypeSelector: React.FC<{ value: FreeShapeAnnotation['shapeType']; onChange: (v: FreeShapeAnnotation['shapeType']) => void }> = ({ value, onChange }) => (
  <div className="flex flex-col gap-1">
    <span className="text-[10px] uppercase tracking-wider text-[var(--vscode-descriptionForeground)]">Shape Type</span>
    <select
      className="w-full px-3 py-2 bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-white/10 rounded-xl text-sm cursor-pointer hover:border-white/20 transition-colors"
      value={value}
      onChange={(e) => onChange(e.target.value as FreeShapeAnnotation['shapeType'])}
    >
      <option value="rectangle">Rectangle</option>
      <option value="circle">Circle</option>
      <option value="line">Line</option>
    </select>
  </div>
);

// Size controls
const SizeControls: React.FC<{ formData: FreeShapeAnnotation; updateField: Props['updateField'] }> = ({ formData, updateField }) => {
  if (formData.shapeType === 'line') return null;
  return (
    <div className="grid grid-cols-2 gap-3">
      <NumberInput
        label="Width"
        value={formData.width ?? DEFAULT_SHAPE_WIDTH}
        onChange={(v) => updateField('width', v)}
        min={5}
        max={2000}
        unit="px"
      />
      <NumberInput
        label="Height"
        value={formData.height ?? DEFAULT_SHAPE_HEIGHT}
        onChange={(v) => updateField('height', v)}
        min={5}
        max={2000}
        unit="px"
      />
    </div>
  );
};

// Fill controls
const FillControls: React.FC<{ formData: FreeShapeAnnotation; updateField: Props['updateField'] }> = ({ formData, updateField }) => {
  if (formData.shapeType === 'line') return null;

  const opacity = formData.fillOpacity ?? DEFAULT_FILL_OPACITY;
  const isTransparent = opacity === 0;

  return (
    <div className="flex items-end gap-4 flex-wrap">
      <ColorSwatch
        label="Fill"
        value={formData.fillColor ?? DEFAULT_FILL_COLOR}
        onChange={(v) => updateField('fillColor', v)}
        disabled={isTransparent}
      />
      <div className="flex flex-col gap-1 flex-1 min-w-[120px]">
        <div className="flex justify-between">
          <span className="text-[10px] uppercase tracking-wider text-[var(--vscode-descriptionForeground)]">Opacity</span>
          <span className="text-[10px] text-[var(--vscode-descriptionForeground)]">{Math.round(opacity * 100)}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(opacity * 100)}
          onChange={(e) => updateField('fillOpacity', parseInt(e.target.value) / 100)}
          className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer"
        />
      </div>
      <Toggle active={isTransparent} onClick={() => updateField('fillOpacity', isTransparent ? 1 : 0)}>
        Transparent
      </Toggle>
    </div>
  );
};

// Border/Line controls
const BorderControls: React.FC<{ formData: FreeShapeAnnotation; updateField: Props['updateField'] }> = ({ formData, updateField }) => {
  const isLine = formData.shapeType === 'line';
  const borderWidth = formData.borderWidth ?? DEFAULT_BORDER_WIDTH;
  const noBorder = borderWidth === 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end gap-4 flex-wrap">
        <ColorSwatch
          label={isLine ? 'Line' : 'Border'}
          value={formData.borderColor ?? DEFAULT_BORDER_COLOR}
          onChange={(v) => updateField('borderColor', v)}
          disabled={noBorder}
        />
        <NumberInput
          label={isLine ? 'Width' : 'Border'}
          value={borderWidth}
          onChange={(v) => updateField('borderWidth', v)}
          min={0}
          max={20}
          unit="px"
        />
        <div className="flex flex-col gap-1 flex-1 min-w-[100px]">
          <span className="text-[10px] uppercase tracking-wider text-[var(--vscode-descriptionForeground)]">Style</span>
          <select
            className="w-full px-3 py-2 bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-white/10 rounded-xl text-sm cursor-pointer hover:border-white/20 transition-colors"
            value={formData.borderStyle ?? DEFAULT_BORDER_STYLE}
            onChange={(e) => updateField('borderStyle', e.target.value as FreeShapeAnnotation['borderStyle'])}
          >
            <option value="solid">Solid</option>
            <option value="dashed">Dashed</option>
            <option value="dotted">Dotted</option>
          </select>
        </div>
        {!isLine && (
          <Toggle active={noBorder} onClick={() => updateField('borderWidth', noBorder ? DEFAULT_BORDER_WIDTH : 0)}>
            No Border
          </Toggle>
        )}
      </div>
    </div>
  );
};

// Corner radius (rectangle only)
const CornerRadiusControl: React.FC<{ formData: FreeShapeAnnotation; updateField: Props['updateField'] }> = ({ formData, updateField }) => {
  if (formData.shapeType !== 'rectangle') return null;
  return (
    <NumberInput
      label="Corner Radius"
      value={formData.cornerRadius ?? DEFAULT_CORNER_RADIUS}
      onChange={(v) => updateField('cornerRadius', v)}
      min={0}
      max={100}
      unit="px"
    />
  );
};

// Line arrow controls
const ArrowControls: React.FC<{ formData: FreeShapeAnnotation; updateField: Props['updateField'] }> = ({ formData, updateField }) => {
  if (formData.shapeType !== 'line') return null;
  return (
    <div className="flex items-end gap-4 flex-wrap">
      <Toggle
        active={formData.lineStartArrow ?? false}
        onClick={() => updateField('lineStartArrow', !formData.lineStartArrow)}
      >
        Start Arrow
      </Toggle>
      <Toggle
        active={formData.lineEndArrow ?? false}
        onClick={() => updateField('lineEndArrow', !formData.lineEndArrow)}
      >
        End Arrow
      </Toggle>
      {(formData.lineStartArrow || formData.lineEndArrow) && (
        <NumberInput
          label="Arrow Size"
          value={formData.lineArrowSize ?? DEFAULT_ARROW_SIZE}
          onChange={(v) => updateField('lineArrowSize', v)}
          min={5}
          max={50}
          unit="px"
        />
      )}
    </div>
  );
};

// Rotation control (not for lines)
const RotationControl: React.FC<{ formData: FreeShapeAnnotation; updateField: Props['updateField'] }> = ({ formData, updateField }) => {
  if (formData.shapeType === 'line') return null;
  return (
    <NumberInput
      label="Rotation"
      value={formData.rotation ?? 0}
      onChange={(v) => updateField('rotation', v)}
      min={-360}
      max={360}
      unit="deg"
    />
  );
};

// Grid pattern background for preview
const PREVIEW_GRID_BG = "bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2220%22%20height%3D%2220%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cdefs%3E%3Cpattern%20id%3D%22grid%22%20width%3D%2220%22%20height%3D%2220%22%20patternUnits%3D%22userSpaceOnUse%22%3E%3Cpath%20d%3D%22M%200%200%20L%2020%200%2020%2020%22%20fill%3D%22none%22%20stroke%3D%22rgba(255%2C255%2C255%2C0.03)%22%20stroke-width%3D%221%22%2F%3E%3C%2Fpattern%3E%3C%2Fdefs%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20fill%3D%22url(%23grid)%22%2F%3E%3C%2Fsvg%3E')]";

// Preview component
const Preview: React.FC<{ formData: FreeShapeAnnotation }> = ({ formData }) => {
  const { svg, width, height } = useMemo(() => buildShapeSvg(formData), [formData]);

  // Scale down preview if shape is too large
  const maxPreviewSize = 120;
  const scale = Math.min(1, maxPreviewSize / Math.max(width, height));

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wider text-[var(--vscode-descriptionForeground)]">Preview</span>
      <div className="relative p-6 bg-gradient-to-br from-black/30 to-black/10 rounded-xl border border-white/5 min-h-[100px] flex items-center justify-center overflow-hidden">
        <div className={`absolute inset-0 ${PREVIEW_GRID_BG} opacity-50`} />
        <div
          className="relative z-10 transition-all duration-200"
          style={{
            transform: `rotate(${formData.rotation ?? 0}deg) scale(${scale})`,
            width: `${width}px`,
            height: `${height}px`
          }}
        >
          {svg}
        </div>
      </div>
    </div>
  );
};

// Main component
export const FreeShapeFormContent: React.FC<Props> = ({ formData, updateField, isNew, onDelete }) => (
  <div className="flex flex-col gap-4">
    <ShapeTypeSelector value={formData.shapeType} onChange={(v) => updateField('shapeType', v)} />
    <SizeControls formData={formData} updateField={updateField} />
    <FillControls formData={formData} updateField={updateField} />
    <BorderControls formData={formData} updateField={updateField} />
    <CornerRadiusControl formData={formData} updateField={updateField} />
    <ArrowControls formData={formData} updateField={updateField} />
    <RotationControl formData={formData} updateField={updateField} />
    <Preview formData={formData} />
    {!isNew && onDelete && (
      <button
        type="button"
        className="self-start text-xs text-[var(--vscode-errorForeground)] opacity-60 hover:opacity-100 transition-opacity"
        onClick={onDelete}
      >
        <i className="fas fa-trash-alt mr-1.5" />Delete
      </button>
    )}
  </div>
);
