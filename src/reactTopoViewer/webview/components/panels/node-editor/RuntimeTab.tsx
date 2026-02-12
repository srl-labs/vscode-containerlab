/**
 * Runtime Tab for Node Editor
 */
import React from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";

import { InputField, SelectField, CheckboxField, DynamicList } from "../../ui/form";

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
    onChange({ exec: [...(data.exec || []), ""] });
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column" }}>
      {/* Container Settings */}
      <Box sx={{ p: 2 }}>
        <Typography variant="panelHeading">Container Settings</Typography>
      </Box>
      <Divider />
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2, p: 2 }}>
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
      </Box>

      {/* Exec Commands */}
      <Divider />
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", p: 2 }}>
        <Typography variant="panelHeading">Exec Commands</Typography>
        <Button size="small" startIcon={<AddIcon />} onClick={handleAddExec} sx={{ py: 0 }}>ADD</Button>
      </Box>
      <Divider />
      <Box sx={{ p: 2 }}>
        <DynamicList
          items={data.exec || []}
          onChange={(items) => onChange({ exec: items })}
          placeholder="Command to execute"
          hideAddButton
        />
      </Box>

      {/* Lifecycle */}
      <Divider />
      <Box sx={{ p: 2 }}>
        <Typography variant="panelHeading">Lifecycle</Typography>
      </Box>
      <Divider />
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2, p: 2 }}>
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
      </Box>
    </Box>
  );
};
