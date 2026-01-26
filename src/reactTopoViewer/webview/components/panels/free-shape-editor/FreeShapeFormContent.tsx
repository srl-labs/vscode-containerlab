/**
 * FreeShapeFormContent - Sleek, modern form for shape annotation editing
 * Matches the style of FreeTextFormContent
 */
import React, { useMemo } from "react";

import type { FreeShapeAnnotation } from "../../../../shared/types/topology";
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
} from "../../../utils/annotations/constants";
import { buildShapeSvg } from "../../../utils/annotations/freeShapeSvg";
import { Toggle, ColorSwatch, NumberInput, PREVIEW_GRID_BG } from "../../shared/form";

interface Props {
  formData: FreeShapeAnnotation;
  updateField: <K extends keyof FreeShapeAnnotation>(
    field: K,
    value: FreeShapeAnnotation[K]
  ) => void;
  isNew: boolean;
  onDelete?: () => void;
}

// Shape type selector
const ShapeTypeSelector: React.FC<{
  value: FreeShapeAnnotation["shapeType"];
  onChange: (v: FreeShapeAnnotation["shapeType"]) => void;
}> = ({ value, onChange }) => (
  <div className="flex flex-col gap-0.5">
    <span className="field-label">Shape Type</span>
    <select
      className="w-full px-2 py-1.5 bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-white/10 rounded-sm text-xs cursor-pointer hover:border-white/20 transition-colors"
      value={value}
      onChange={(e) => onChange(e.target.value as FreeShapeAnnotation["shapeType"])}
    >
      <option value="rectangle">Rectangle</option>
      <option value="circle">Circle</option>
      <option value="line">Line</option>
    </select>
  </div>
);

// Size controls
const SizeControls: React.FC<{
  formData: FreeShapeAnnotation;
  updateField: Props["updateField"];
}> = ({ formData, updateField }) => {
  if (formData.shapeType === "line") return null;
  return (
    <div className="grid grid-cols-2 gap-3">
      <NumberInput
        label="Width"
        value={formData.width ?? DEFAULT_SHAPE_WIDTH}
        onChange={(v) => updateField("width", v)}
        min={5}
        max={2000}
        unit="px"
      />
      <NumberInput
        label="Height"
        value={formData.height ?? DEFAULT_SHAPE_HEIGHT}
        onChange={(v) => updateField("height", v)}
        min={5}
        max={2000}
        unit="px"
      />
    </div>
  );
};

// Fill controls
const FillControls: React.FC<{
  formData: FreeShapeAnnotation;
  updateField: Props["updateField"];
}> = ({ formData, updateField }) => {
  if (formData.shapeType === "line") return null;

  const opacity = formData.fillOpacity ?? DEFAULT_FILL_OPACITY;
  const isTransparent = opacity === 0;

  return (
    <div className="flex items-start gap-4 flex-wrap">
      <ColorSwatch
        label="Fill"
        value={formData.fillColor ?? DEFAULT_FILL_COLOR}
        onChange={(v) => updateField("fillColor", v)}
        disabled={isTransparent}
      />
      <div className="flex flex-col gap-0.5 flex-1 min-w-[120px]">
        <div className="flex justify-between">
          <span className="field-label">Opacity</span>
          <span className="field-label">{Math.round(opacity * 100)}%</span>
        </div>
        <div className="flex items-center h-[30px]">
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(opacity * 100)}
            onChange={(e) => updateField("fillOpacity", parseInt(e.target.value) / 100)}
            className="w-full h-2 bg-white/10 rounded-sm appearance-none cursor-pointer"
          />
        </div>
      </div>
      <div className="pt-4">
        <Toggle
          active={isTransparent}
          onClick={() => updateField("fillOpacity", isTransparent ? 1 : 0)}
        >
          Transparent
        </Toggle>
      </div>
    </div>
  );
};

// Border/Line controls
const BorderControls: React.FC<{
  formData: FreeShapeAnnotation;
  updateField: Props["updateField"];
}> = ({ formData, updateField }) => {
  const isLine = formData.shapeType === "line";
  const borderWidth = formData.borderWidth ?? DEFAULT_BORDER_WIDTH;
  const noBorder = borderWidth === 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-4 flex-wrap">
        <ColorSwatch
          label={isLine ? "Line" : "Border"}
          value={formData.borderColor ?? DEFAULT_BORDER_COLOR}
          onChange={(v) => updateField("borderColor", v)}
          disabled={noBorder}
        />
        <NumberInput
          label={isLine ? "Width" : "Border"}
          value={borderWidth}
          onChange={(v) => updateField("borderWidth", v)}
          min={0}
          max={20}
          unit="px"
        />
        <div className="flex flex-col gap-0.5 flex-1 min-w-[80px]">
          <span className="field-label">Style</span>
          <select
            className="w-full px-2 py-1.5 bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-white/10 rounded-sm text-xs cursor-pointer hover:border-white/20 transition-colors"
            value={formData.borderStyle ?? DEFAULT_BORDER_STYLE}
            onChange={(e) =>
              updateField("borderStyle", e.target.value as FreeShapeAnnotation["borderStyle"])
            }
          >
            <option value="solid">Solid</option>
            <option value="dashed">Dashed</option>
            <option value="dotted">Dotted</option>
          </select>
        </div>
        {!isLine && (
          <div className="pt-4">
            <Toggle
              active={noBorder}
              onClick={() => updateField("borderWidth", noBorder ? DEFAULT_BORDER_WIDTH : 0)}
            >
              No Border
            </Toggle>
          </div>
        )}
      </div>
    </div>
  );
};

// Corner radius (rectangle only)
const CornerRadiusControl: React.FC<{
  formData: FreeShapeAnnotation;
  updateField: Props["updateField"];
}> = ({ formData, updateField }) => {
  if (formData.shapeType !== "rectangle") return null;
  return (
    <NumberInput
      label="Corner Radius"
      value={formData.cornerRadius ?? DEFAULT_CORNER_RADIUS}
      onChange={(v) => updateField("cornerRadius", v)}
      min={0}
      max={100}
      unit="px"
    />
  );
};

// Line arrow controls
const ArrowControls: React.FC<{
  formData: FreeShapeAnnotation;
  updateField: Props["updateField"];
}> = ({ formData, updateField }) => {
  if (formData.shapeType !== "line") return null;
  const hasArrows = formData.lineStartArrow || formData.lineEndArrow;
  return (
    <div className="flex items-start gap-4 flex-wrap">
      <div className={hasArrows ? "pt-4 flex gap-2" : "flex gap-2"}>
        <Toggle
          active={formData.lineStartArrow ?? false}
          onClick={() => updateField("lineStartArrow", !formData.lineStartArrow)}
        >
          Start Arrow
        </Toggle>
        <Toggle
          active={formData.lineEndArrow ?? false}
          onClick={() => updateField("lineEndArrow", !formData.lineEndArrow)}
        >
          End Arrow
        </Toggle>
      </div>
      {hasArrows && (
        <NumberInput
          label="Arrow Size"
          value={formData.lineArrowSize ?? DEFAULT_ARROW_SIZE}
          onChange={(v) => updateField("lineArrowSize", v)}
          min={5}
          max={50}
          unit="px"
        />
      )}
    </div>
  );
};

// Rotation control (not for lines)
const RotationControl: React.FC<{
  formData: FreeShapeAnnotation;
  updateField: Props["updateField"];
}> = ({ formData, updateField }) => {
  if (formData.shapeType === "line") return null;
  return (
    <NumberInput
      label="Rotation"
      value={formData.rotation ?? 0}
      onChange={(v) => updateField("rotation", v)}
      min={-360}
      max={360}
      unit="deg"
    />
  );
};

// Preview component
const Preview: React.FC<{ formData: FreeShapeAnnotation }> = ({ formData }) => {
  const { svg, width, height } = useMemo(() => buildShapeSvg(formData), [formData]);

  // Scale down preview if shape is too large
  const maxPreviewSize = 120;
  const scale = Math.min(1, maxPreviewSize / Math.max(width, height));

  return (
    <div className="flex flex-col gap-1">
      <span className="field-label">Preview</span>
      <div className="relative p-6 bg-gradient-to-br from-black/30 to-black/10 rounded-sm border border-white/5 min-h-[100px] flex items-center justify-center overflow-hidden">
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
export const FreeShapeFormContent: React.FC<Props> = ({
  formData,
  updateField,
  isNew,
  onDelete
}) => (
  <div className="flex flex-col gap-4">
    <ShapeTypeSelector value={formData.shapeType} onChange={(v) => updateField("shapeType", v)} />
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
        <i className="fas fa-trash-alt mr-1.5" />
        Delete
      </button>
    )}
  </div>
);
