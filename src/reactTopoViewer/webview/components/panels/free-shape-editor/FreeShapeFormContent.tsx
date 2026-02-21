// Shape annotation editor form.
import React from "react";
import Box from "@mui/material/Box";

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
import { InputField, SelectField, Toggle, ColorField, PanelSection } from "../../ui/form";

interface Props {
  formData: FreeShapeAnnotation;
  updateField: <K extends keyof FreeShapeAnnotation>(
    field: K,
    value: FreeShapeAnnotation[K]
  ) => void;
}

interface SectionProps extends Props {
  isLine: boolean;
}

interface BorderSectionProps extends SectionProps {
  isRectangle: boolean;
}

function toShapeType(value: string): FreeShapeAnnotation["shapeType"] {
  if (value === "rectangle" || value === "circle" || value === "line") {
    return value;
  }
  return "rectangle";
}

function toBorderStyle(value: string): FreeShapeAnnotation["borderStyle"] {
  if (value === "solid" || value === "dashed" || value === "dotted") {
    return value;
  }
  return DEFAULT_BORDER_STYLE;
}

const ShapeSection: React.FC<SectionProps> = ({ formData, updateField, isLine }) => {
  return (
    <PanelSection title="Shape" withTopDivider={false}>
      <>
        <SelectField
          id="shape-type"
          label="Shape Type"
          value={formData.shapeType}
          onChange={(v) => updateField("shapeType", toShapeType(v))}
          options={[
            { value: "rectangle", label: "Rectangle" },
            { value: "circle", label: "Circle" },
            { value: "line", label: "Line" }
          ]}
        />
        {!isLine && (
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1.5 }}>
            <InputField
              id="shape-width"
              label="Width"
              type="number"
              value={String(formData.width ?? DEFAULT_SHAPE_WIDTH)}
              onChange={(v) => updateField("width", Number(v))}
              min={5}
              max={2000}
              suffix="px"
            />
            <InputField
              id="shape-height"
              label="Height"
              type="number"
              value={String(formData.height ?? DEFAULT_SHAPE_HEIGHT)}
              onChange={(v) => updateField("height", Number(v))}
              min={5}
              max={2000}
              suffix="px"
            />
            <InputField
              id="shape-rotation"
              label="Rotation"
              type="number"
              value={String(formData.rotation ?? 0)}
              onChange={(v) => updateField("rotation", Number(v))}
              min={-360}
              max={360}
              suffix="deg"
            />
          </Box>
        )}
      </>
    </PanelSection>
  );
};

const FillSection: React.FC<SectionProps> = ({ formData, updateField, isLine }) => {
  if (isLine) return null;

  const opacity = formData.fillOpacity ?? DEFAULT_FILL_OPACITY;

  return (
    <PanelSection title="Fill" bodySx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5, p: 2 }}>
      <>
        <ColorField
          label="Fill Color"
          value={formData.fillColor ?? DEFAULT_FILL_COLOR}
          onChange={(v) => updateField("fillColor", v)}
        />
        <InputField
          id="shape-opacity"
          label="Opacity"
          type="number"
          value={opacity ? String(Math.round(opacity * 100)) : ""}
          onChange={(v) => updateField("fillOpacity", v ? Number(v) / 100 : 0)}
          min={0}
          max={100}
          suffix="%"
          clearable
        />
      </>
    </PanelSection>
  );
};

const BorderSection: React.FC<BorderSectionProps> = ({
  formData,
  updateField,
  isLine,
  isRectangle
}) => {
  const borderWidth = formData.borderWidth ?? DEFAULT_BORDER_WIDTH;

  return (
    <PanelSection title={isLine ? "Line" : "Border"}>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
          <ColorField
            label={isLine ? "Line Color" : "Border Color"}
            value={formData.borderColor ?? DEFAULT_BORDER_COLOR}
            onChange={(v) => updateField("borderColor", v)}
          />
          <InputField
            id="shape-border-width"
            label="Width"
            type="number"
            value={borderWidth ? String(borderWidth) : ""}
            onChange={(v) => updateField("borderWidth", v ? Number(v) : 0)}
            min={0}
            max={20}
            suffix="px"
            clearable
          />
        </Box>
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
          {isRectangle && (
            <InputField
              id="shape-corner-radius"
              label="Corner Radius"
              type="number"
              value={String(formData.cornerRadius ?? DEFAULT_CORNER_RADIUS)}
              onChange={(v) => updateField("cornerRadius", Number(v))}
              min={0}
              max={100}
              suffix="px"
            />
          )}
          <SelectField
            id="shape-border-style"
            label="Style"
            value={formData.borderStyle ?? DEFAULT_BORDER_STYLE}
            onChange={(v) => updateField("borderStyle", toBorderStyle(v))}
            options={[
              { value: "solid", label: "Solid" },
              { value: "dashed", label: "Dashed" },
              { value: "dotted", label: "Dotted" }
            ]}
          />
        </Box>
      </Box>
    </PanelSection>
  );
};

const ArrowSection: React.FC<SectionProps> = ({ formData, updateField, isLine }) => {
  if (!isLine) return null;

  const hasArrows = Boolean(formData.lineStartArrow ?? formData.lineEndArrow);

  return (
    <PanelSection title="Arrows">
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Toggle
            active={formData.lineStartArrow ?? false}
            onClick={() => updateField("lineStartArrow", formData.lineStartArrow !== true)}
          >
            Start Arrow
          </Toggle>
          <Toggle
            active={formData.lineEndArrow ?? false}
            onClick={() => updateField("lineEndArrow", formData.lineEndArrow !== true)}
          >
            End Arrow
          </Toggle>
        </Box>
        {hasArrows && (
          <InputField
            id="shape-arrow-size"
            label="Arrow Size"
            type="number"
            value={String(formData.lineArrowSize ?? DEFAULT_ARROW_SIZE)}
            onChange={(v) => updateField("lineArrowSize", Number(v))}
            min={5}
            max={50}
            suffix="px"
          />
        )}
      </Box>
    </PanelSection>
  );
};

// Main component
export const FreeShapeFormContent: React.FC<Props> = ({ formData, updateField }) => {
  const isLine = formData.shapeType === "line";
  const isRectangle = formData.shapeType === "rectangle";

  return (
    <Box sx={{ display: "flex", flexDirection: "column" }}>
      <ShapeSection formData={formData} updateField={updateField} isLine={isLine} />
      <FillSection formData={formData} updateField={updateField} isLine={isLine} />
      <BorderSection
        formData={formData}
        updateField={updateField}
        isLine={isLine}
        isRectangle={isRectangle}
      />
      <ArrowSection formData={formData} updateField={updateField} isLine={isLine} />
    </Box>
  );
};
