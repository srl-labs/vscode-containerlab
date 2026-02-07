/**
 * GroupFormContent - Form for group editor panel
 * Allows editing group name, level, and visual styles
 */
import React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import DeleteIcon from "@mui/icons-material/Delete";

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
  <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
    <Typography variant="subtitle2" fontWeight={600}>
      Basic Information
    </Typography>
    <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
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
    </Box>
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
  </Box>
);

// Background section
const BackgroundSection: React.FC<{
  formData: GroupEditorData;
  updateStyle: Props["updateStyle"];
}> = ({ formData, updateStyle }) => (
  <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
    <Typography variant="subtitle2" fontWeight={600}>
      Background
    </Typography>
    <Box sx={{ display: "flex", alignItems: "flex-start", gap: 2, flexWrap: "wrap" }}>
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
    </Box>
  </Box>
);

// Border section
const BorderSection: React.FC<{
  formData: GroupEditorData;
  updateStyle: Props["updateStyle"];
}> = ({ formData, updateStyle }) => (
  <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
    <Typography variant="subtitle2" fontWeight={600}>
      Border
    </Typography>
    <Box sx={{ display: "flex", alignItems: "flex-start", gap: 2, flexWrap: "wrap" }}>
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
    </Box>
    <RangeSlider
      label="Corner Radius"
      value={formData.style.borderRadius ?? 0}
      onChange={(v) => updateStyle("borderRadius", v)}
      max={50}
      unit="px"
    />
  </Box>
);

// Text color section
const TextSection: React.FC<{
  formData: GroupEditorData;
  updateStyle: Props["updateStyle"];
}> = ({ formData, updateStyle }) => (
  <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
    <Typography variant="subtitle2" fontWeight={600}>
      Label
    </Typography>
    <Box sx={{ display: "flex", alignItems: "flex-start", gap: 2 }}>
      <ColorSwatch
        label="Text Color"
        value={formData.style.labelColor ?? formData.style.color ?? "#ebecf0"}
        onChange={(v) => updateStyle("labelColor", v)}
      />
    </Box>
  </Box>
);

// Preview section
const PreviewSection: React.FC<{ formData: GroupEditorData }> = ({ formData }) => {
  const style = formData.style;
  const bgOpacity = (style.backgroundOpacity ?? 20) / 100;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
      <Typography variant="caption" color="text.secondary">
        Preview
      </Typography>
      <Box sx={{ position: "relative", p: 2, bgcolor: "var(--vscode-input-background)", borderRadius: 0.5, border: 1, borderColor: "var(--vscode-panel-border)", minHeight: 80, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Box
          sx={{
            position: "relative",
            width: "100%",
            height: 64,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            pt: 0.5,
            backgroundColor: style.backgroundColor ?? "#d9d9d9",
            opacity: bgOpacity,
            borderColor: style.borderColor ?? "#dddddd",
            borderWidth: `${style.borderWidth ?? 0.5}px`,
            borderStyle: style.borderStyle ?? "solid",
            borderRadius: `${style.borderRadius ?? 0}px`
          }}
        >
          <Box
            component="span"
            sx={{
              fontSize: "0.75rem",
              fontWeight: 500,
              color: style.labelColor ?? style.color ?? "#ebecf0"
            }}
          >
            {formData.name || "Group Name"}
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

// Main component
export const GroupFormContent: React.FC<Props> = ({
  formData,
  updateField,
  updateStyle,
  onDelete
}) => (
  <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
    <BasicInfoSection formData={formData} updateField={updateField} />
    <BackgroundSection formData={formData} updateStyle={updateStyle} />
    <BorderSection formData={formData} updateStyle={updateStyle} />
    <TextSection formData={formData} updateStyle={updateStyle} />
    <PreviewSection formData={formData} />
    {onDelete && (
      <Button
        variant="text"
        color="error"
        size="small"
        startIcon={<DeleteIcon />}
        onClick={onDelete}
        sx={{ alignSelf: "flex-start", textTransform: "none" }}
      >
        Delete Group
      </Button>
    )}
  </Box>
);
