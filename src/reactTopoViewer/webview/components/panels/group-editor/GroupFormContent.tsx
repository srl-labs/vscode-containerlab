// Group editor form.
import React from "react";
import Box from "@mui/material/Box";

import type { GroupStyleAnnotation } from "../../../../shared/types/topology";
import type { GroupEditorData } from "../../../hooks/canvas";
import { GROUP_LABEL_POSITIONS } from "../../../hooks/canvas";
import { InputField, SelectField, ColorField, PanelSection } from "../../ui/form";

interface Props {
  formData: GroupEditorData;
  updateField: <K extends keyof GroupEditorData>(field: K, value: GroupEditorData[K]) => void;
  updateStyle: <K extends keyof GroupStyleAnnotation>(
    field: K,
    value: GroupStyleAnnotation[K]
  ) => void;
}

function isBorderStyle(value: string): value is NonNullable<GroupStyleAnnotation["borderStyle"]> {
  return value === "solid" || value === "dashed" || value === "dotted" || value === "double";
}

// Main component
export const GroupFormContent: React.FC<Props> = ({ formData, updateField, updateStyle }) => {
  const style = formData.style;

  return (
    <Box sx={{ display: "flex", flexDirection: "column" }}>
      <PanelSection title="Basic Information" withTopDivider={false}>
        <InputField
          id="group-name"
          label="Group Name"
          value={formData.name}
          onChange={(v) => updateField("name", v)}
          placeholder="e.g., rack1"
        />
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
          <SelectField
            id="group-label-position"
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
          <InputField
            id="group-level"
            label="Level"
            type="number"
            value={formData.level}
            onChange={(v) => updateField("level", v)}
            min={0}
          />
        </Box>
      </PanelSection>

      <PanelSection
        title="Background"
        bodySx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5, p: 2 }}
      >
        <ColorField
          label="Color"
          value={style.backgroundColor ?? "#d9d9d9"}
          onChange={(v) => updateStyle("backgroundColor", v)}
        />
        <InputField
          id="group-bg-opacity"
          label="Opacity"
          type="number"
          value={String(style.backgroundOpacity ?? 20)}
          onChange={(v) => updateStyle("backgroundOpacity", v ? Number(v) : 0)}
          min={0}
          max={100}
          suffix="%"
        />
      </PanelSection>

      <PanelSection title="Border">
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
          <ColorField
            label="Color"
            value={style.borderColor ?? "#dddddd"}
            onChange={(v) => updateStyle("borderColor", v)}
          />
          <InputField
            id="group-border-width"
            label="Width"
            type="number"
            value={style.borderWidth != null ? String(style.borderWidth) : ""}
            onChange={(v) => updateStyle("borderWidth", v ? Number(v) : 0)}
            min={0}
            max={20}
            step={0.5}
            suffix="px"
            clearable
          />
        </Box>
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
          <InputField
            id="group-corner-radius"
            label="Corner Radius"
            type="number"
            value={String(style.borderRadius ?? 0)}
            onChange={(v) => updateStyle("borderRadius", Number(v))}
            min={0}
            max={50}
            suffix="px"
          />
          <SelectField
            id="group-border-style"
            label="Style"
            value={style.borderStyle ?? "solid"}
            onChange={(v) => {
              if (isBorderStyle(v)) {
                updateStyle("borderStyle", v);
              }
            }}
            options={[
              { value: "solid", label: "Solid" },
              { value: "dashed", label: "Dashed" },
              { value: "dotted", label: "Dotted" },
              { value: "double", label: "Double" }
            ]}
          />
        </Box>
      </PanelSection>

      <PanelSection title="Label" bodySx={{ p: 2 }}>
        <ColorField
          label="Text Color"
          value={style.labelColor ?? style.color ?? "#ebecf0"}
          onChange={(v) => updateStyle("labelColor", v)}
        />
      </PanelSection>
    </Box>
  );
};
