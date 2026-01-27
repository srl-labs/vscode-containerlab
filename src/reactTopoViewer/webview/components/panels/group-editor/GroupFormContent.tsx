/**
 * GroupFormContent - Form for group editor panel
 * Allows editing group name, level, and visual styles
 */
import React from "react";

import type { GroupStyleAnnotation } from "../../../../shared/types/topology";
import type { GroupEditorData } from "../../../hooks/canvas";
import { GROUP_LABEL_POSITIONS } from "../../../hooks/canvas";
import { ColorSwatch, TextInput, NumberInput, SelectInput, RangeSlider } from "../../ui/form";

interface Props {
  formData: GroupEditorData;
  updateField: <K extends keyof GroupEditorData>(field: K, value: GroupEditorData[K]) => void;
  updateStyle: <K extends keyof GroupStyleAnnotation>(
    field: K,
    value: GroupStyleAnnotation[K]
  ) => void;
  onDelete?: () => void;
}

// Basic info section
const BasicInfoSection: React.FC<{
  formData: GroupEditorData;
  updateField: Props["updateField"];
}> = ({ formData, updateField }) => (
  <div className="flex flex-col gap-3">
    <h4 className="section-header">Basic Information</h4>
    <div className="grid grid-cols-2 gap-3">
      <TextInput
        label="Group Name"
        value={formData.name}
        onChange={(v) => updateField("name", v)}
        placeholder="e.g., rack1"
      />
      <TextInput
        label="Level"
        value={formData.level}
        onChange={(v) => updateField("level", v)}
        placeholder="e.g., 1"
      />
    </div>
    <SelectInput
      label="Label Position"
      value={formData.style.labelPosition ?? "top-center"}
      onChange={(v) => updateField("style", { ...formData.style, labelPosition: v })}
      options={GROUP_LABEL_POSITIONS.map((pos) => ({
        value: pos,
        label: pos
          .split("-")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ")
      }))}
    />
  </div>
);

// Background section
const BackgroundSection: React.FC<{
  formData: GroupEditorData;
  updateStyle: Props["updateStyle"];
}> = ({ formData, updateStyle }) => (
  <div className="flex flex-col gap-3">
    <h4 className="section-header">Background</h4>
    <div className="flex items-start gap-4 flex-wrap">
      <ColorSwatch
        label="Color"
        value={formData.style.backgroundColor ?? "#d9d9d9"}
        onChange={(v) => updateStyle("backgroundColor", v)}
      />
      <RangeSlider
        label="Opacity"
        value={formData.style.backgroundOpacity ?? 20}
        onChange={(v) => updateStyle("backgroundOpacity", v)}
      />
    </div>
  </div>
);

// Border section
const BorderSection: React.FC<{
  formData: GroupEditorData;
  updateStyle: Props["updateStyle"];
}> = ({ formData, updateStyle }) => (
  <div className="flex flex-col gap-3">
    <h4 className="section-header">Border</h4>
    <div className="flex items-start gap-4 flex-wrap">
      <ColorSwatch
        label="Color"
        value={formData.style.borderColor ?? "#dddddd"}
        onChange={(v) => updateStyle("borderColor", v)}
      />
      <NumberInput
        label="Width"
        value={formData.style.borderWidth ?? 0.5}
        onChange={(v) => updateStyle("borderWidth", v)}
        min={0}
        max={20}
        step={0.5}
        unit="px"
      />
      <SelectInput
        label="Style"
        value={formData.style.borderStyle ?? "solid"}
        onChange={(v) => updateStyle("borderStyle", v as GroupStyleAnnotation["borderStyle"])}
        options={[
          { value: "solid", label: "Solid" },
          { value: "dashed", label: "Dashed" },
          { value: "dotted", label: "Dotted" },
          { value: "double", label: "Double" }
        ]}
      />
    </div>
    <RangeSlider
      label="Corner Radius"
      value={formData.style.borderRadius ?? 0}
      onChange={(v) => updateStyle("borderRadius", v)}
      max={50}
      unit="px"
    />
  </div>
);

// Text color section
const TextSection: React.FC<{
  formData: GroupEditorData;
  updateStyle: Props["updateStyle"];
}> = ({ formData, updateStyle }) => (
  <div className="flex flex-col gap-3">
    <h4 className="section-header">Label</h4>
    <div className="flex items-start gap-4">
      <ColorSwatch
        label="Text Color"
        value={formData.style.labelColor ?? formData.style.color ?? "#ebecf0"}
        onChange={(v) => updateStyle("labelColor", v)}
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
      <span className="field-label">Preview</span>
      <div className="relative p-4 bg-gradient-to-br from-black/30 to-black/10 rounded-sm border border-white/5 min-h-[80px] flex items-center justify-center">
        <div
          className="relative w-full h-16 flex items-start justify-center pt-1"
          style={{
            backgroundColor: style.backgroundColor ?? "#d9d9d9",
            opacity: bgOpacity,
            borderColor: style.borderColor ?? "#dddddd",
            borderWidth: `${style.borderWidth ?? 0.5}px`,
            borderStyle: style.borderStyle ?? "solid",
            borderRadius: `${style.borderRadius ?? 0}px`
          }}
        >
          <span
            className="text-xs font-medium"
            style={{ color: style.labelColor ?? style.color ?? "#ebecf0" }}
          >
            {formData.name || "Group Name"}
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
        <i className="fas fa-trash-alt mr-1.5" />
        Delete Group
      </button>
    )}
  </div>
);
