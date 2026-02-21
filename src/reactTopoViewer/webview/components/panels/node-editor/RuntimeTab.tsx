// Runtime tab for node editor.
import React from "react";
import Box from "@mui/material/Box";

import {
  InputField,
  SelectField,
  CheckboxField,
  DynamicList,
  PanelAddSection,
  PanelSection
} from "../../ui/form";

import type { TabProps } from "./types";

const RESTART_POLICY_OPTIONS = [
  { value: "", label: "Default" },
  { value: "no", label: "No" },
  { value: "always", label: "Always" },
  { value: "on-failure", label: "On Failure" },
  { value: "unless-stopped", label: "Unless Stopped" }
];

export const RuntimeTab: React.FC<TabProps> = ({ data, onChange }) => {
  const handleAddExec = () => {
    onChange({ exec: [...(data.exec ?? []), ""] });
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column" }}>
      <PanelSection title="Container Settings" withTopDivider={false}>
        <InputField
          id="node-user"
          label="User"
          value={data.user ?? ""}
          onChange={(value) => onChange({ user: value })}
          placeholder="Container user"
        />
        <InputField
          id="node-entrypoint"
          label="Entrypoint"
          value={data.entrypoint ?? ""}
          onChange={(value) => onChange({ entrypoint: value })}
          placeholder="Container entrypoint"
        />
        <InputField
          id="node-cmd"
          label="Command"
          value={data.cmd ?? ""}
          onChange={(value) => onChange({ cmd: value })}
          placeholder="Container command"
        />
      </PanelSection>

      <PanelAddSection title="Exec Commands" onAdd={handleAddExec}>
        <DynamicList
          items={data.exec ?? []}
          onChange={(items) => onChange({ exec: items })}
          placeholder="Command to execute"
          hideAddButton
        />
      </PanelAddSection>

      <PanelSection title="Lifecycle">
        <InputField
          id="node-startup-delay"
          label="Startup Delay"
          type="number"
          value={String(data.startupDelay ?? "")}
          onChange={(value) => onChange({ startupDelay: value ? parseInt(value, 10) : undefined })}
          placeholder="0"
          min={0}
          suffix="seconds"
        />
        <SelectField
          id="node-restart-policy"
          label="Restart Policy"
          value={data.restartPolicy ?? ""}
          onChange={(value) => onChange({ restartPolicy: value })}
          options={RESTART_POLICY_OPTIONS}
        />
        <CheckboxField
          id="node-auto-remove"
          label="Auto-remove container on exit"
          checked={data.autoRemove ?? false}
          onChange={(checked) => onChange({ autoRemove: checked })}
        />
      </PanelSection>
    </Box>
  );
};
