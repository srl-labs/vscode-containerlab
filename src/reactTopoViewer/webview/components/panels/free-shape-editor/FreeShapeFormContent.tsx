/**
 * FreeShapeFormContent - Sleek, modern form for shape annotation editing
 * Matches the style of FreeTextFormContent
 */
import React, { useMemo } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

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
} from "../../../annotations/constants";
import {
  Toggle,
  ColorSwatch,
  NumberInput,
  SelectInput,
  RangeSlider,
  PreviewSurface,
  DeleteActionButton
} from "../../ui/form";

import { buildShapeSvg } from "./FreeShapeSvg";

interface Props {
  formData: FreeShapeAnnotation;
  updateField: <K extends keyof FreeShapeAnnotation>(
    field: K,
    value: FreeShapeAnnotation[K]
  ) => void;
  isNew: boolean;
  onDelete?: () => void;
}

const FLEX_START = "flex-start";

// Shape type selector
const ShapeTypeSelector: React.FC<{
  value: FreeShapeAnnotation["shapeType"];
  onChange: (v: FreeShapeAnnotation["shapeType"]) => void;
}> = ({ value, onChange }) => (
  <SelectInput
    label="Shape Type"
    value={value}
    onChange={(v) => onChange(v as FreeShapeAnnotation["shapeType"])}
    options={[
      { value: "rectangle", label: "Rectangle" },
      { value: "circle", label: "Circle" },
      { value: "line", label: "Line" }
    ]}
  />
);

// Size controls
const SizeControls: React.FC<{
  formData: FreeShapeAnnotation;
  updateField: Props["updateField"];
}> = ({ formData, updateField }) => {
  if (formData.shapeType === "line") return null;
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
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
    </Box>
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
    <Box sx={{ display: "flex", alignItems: FLEX_START, gap: 2, flexWrap: "wrap" }}>
      <ColorSwatch
        label="Fill"
        value={formData.fillColor ?? DEFAULT_FILL_COLOR}
        onChange={(v) => updateField("fillColor", v)}
        disabled={isTransparent}
      />
      <RangeSlider
        label="Opacity"
        value={Math.round(opacity * 100)}
        onChange={(v) => updateField("fillOpacity", v / 100)}
        min={0}
        max={100}
        unit="%"
      />
      <Box sx={{ pt: 2 }}>
        <Toggle
          active={isTransparent}
          onClick={() => updateField("fillOpacity", isTransparent ? 1 : 0)}
        >
          Transparent
        </Toggle>
      </Box>
    </Box>
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
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      <Box sx={{ display: "flex", alignItems: FLEX_START, gap: 2, flexWrap: "wrap" }}>
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
        <SelectInput
          label="Style"
          value={formData.borderStyle ?? DEFAULT_BORDER_STYLE}
          onChange={(v) => updateField("borderStyle", v as FreeShapeAnnotation["borderStyle"])}
          options={[
            { value: "solid", label: "Solid" },
            { value: "dashed", label: "Dashed" },
            { value: "dotted", label: "Dotted" }
          ]}
        />
        {!isLine && (
          <Box sx={{ alignSelf: "flex-end" }}>
            <Toggle
              active={noBorder}
              onClick={() => updateField("borderWidth", noBorder ? DEFAULT_BORDER_WIDTH : 0)}
              sx={{ fontSize: "0.75rem" }}
            >
              No Border
            </Toggle>
          </Box>
        )}
      </Box>
    </Box>
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
    <Box sx={{ display: "flex", alignItems: FLEX_START, gap: 2, flexWrap: "wrap" }}>
      <Box sx={{ display: "flex", gap: 1, ...(hasArrows ? { pt: 2 } : {}) }}>
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
      </Box>
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
    </Box>
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
  const rotation = formData.shapeType === "line" ? 0 : (formData.rotation ?? 0);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
      <Typography variant="caption" color="text.secondary">
        Preview
      </Typography>
      <PreviewSurface minHeight={100}>
        <Box
          sx={{
            position: "relative",
            zIndex: 10,
            transition: "all 200ms",
            transform: `rotate(${rotation}deg) scale(${scale})`,
            width: `${width}px`,
            height: `${height}px`
          }}
        >
          {svg}
        </Box>
      </PreviewSurface>
    </Box>
  );
};

// Main component
export const FreeShapeFormContent: React.FC<Props> = ({
  formData,
  updateField,
  isNew,
  onDelete
}) => (
  <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
    <ShapeTypeSelector value={formData.shapeType} onChange={(v) => updateField("shapeType", v)} />
    <SizeControls formData={formData} updateField={updateField} />
    <FillControls formData={formData} updateField={updateField} />
    <BorderControls formData={formData} updateField={updateField} />
    <CornerRadiusControl formData={formData} updateField={updateField} />
    <ArrowControls formData={formData} updateField={updateField} />
    <RotationControl formData={formData} updateField={updateField} />
    <Preview formData={formData} />
    {!isNew && onDelete && (
      <DeleteActionButton onClick={onDelete} alignSelf={FLEX_START} />
    )}
  </Box>
);
