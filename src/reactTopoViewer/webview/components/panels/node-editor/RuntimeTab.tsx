/**
 * Runtime Tab for Node Editor
 */
import React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

import { InputField, SelectField, CheckboxField, DynamicList } from "../../ui/form";

import type { TabProps } from "./types";

const RESTART_POLICY_OPTIONS = [
  { value: "", label: "Default" },
  { value: "no", label: "No" },
  { value: "always", label: "Always" },
  { value: "on-failure", label: "On Failure" },
  { value: "unless-stopped", label: "Unless Stopped" }
];

const UserAndEntrySection: React.FC<TabProps> = ({ data, onChange }) => (
  <>
    <InputField
      id="node-user"
      label="User"
      value={data.user || ""}
      onChange={(value) => onChange({ user: value })}
      placeholder="Container user"
    />
    <InputField
      id="node-entrypoint"
      label="Entrypoint"
      value={data.entrypoint || ""}
      onChange={(value) => onChange({ entrypoint: value })}
      placeholder="Container entrypoint"
    />
    <InputField
      id="node-cmd"
      label="Command"
      value={data.cmd || ""}
      onChange={(value) => onChange({ cmd: value })}
      placeholder="Container command"
    />
    <Box>
      <Typography
        variant="caption"
        sx={{ fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.5, mb: 0.5, display: "block" }}
      >
        Exec Commands
      </Typography>
      <DynamicList
        items={data.exec || []}
        onChange={(items) => onChange({ exec: items })}
        placeholder="Command to execute"
        addLabel="Add Command"
      />
    </Box>
  </>
);

const RestartAndDelaySection: React.FC<TabProps> = ({ data, onChange }) => (
  <>
    <SelectField
      id="node-restart-policy"
      label="Restart Policy"
      value={data.restartPolicy || ""}
      onChange={(value) => onChange({ restartPolicy: value })}
      options={RESTART_POLICY_OPTIONS}
    />
    <CheckboxField
      id="node-auto-remove"
      label="Auto-remove container on exit"
      checked={data.autoRemove || false}
      onChange={(checked) => onChange({ autoRemove: checked })}
    />
    <InputField
      id="node-startup-delay"
      label="Startup Delay (seconds)"
      type="number"
      value={String(data.startupDelay ?? "")}
      onChange={(value) => onChange({ startupDelay: value ? parseInt(value, 10) : undefined })}
      placeholder="0"
      min={0}
    />
  </>
);

export const RuntimeTab: React.FC<TabProps> = ({ data, onChange }) => (
  <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
    <UserAndEntrySection data={data} onChange={onChange} />
    <RestartAndDelaySection data={data} onChange={onChange} />
  </Box>
);
