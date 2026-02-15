// Configuration tab for node editor.
import React from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";

import { InputField, SelectField, DynamicList, KeyValueList } from "../../ui/form";

import type { TabProps } from "./types";

type StartupConfigMode = "default" | "enforce" | "suppress";

const STARTUP_CONFIG_MODE_OPTIONS = [
  { value: "default", label: "Default" },
  { value: "enforce", label: "Enforce startup config" },
  { value: "suppress", label: "Suppress startup config" }
];

function getStartupConfigMode(data: {
  enforceStartupConfig?: boolean;
  suppressStartupConfig?: boolean;
}): StartupConfigMode {
  if (data.enforceStartupConfig) return "enforce";
  if (data.suppressStartupConfig) return "suppress";
  return "default";
}

export const ConfigTab: React.FC<TabProps> = ({ data, onChange }) => {
  const mode = getStartupConfigMode(data);

  const handleModeChange = (newMode: StartupConfigMode) => {
    onChange({
      enforceStartupConfig: newMode === "enforce",
      suppressStartupConfig: newMode === "suppress"
    });
  };

  const handleAddBind = () => {
    onChange({ binds: [...(data.binds || []), ""] });
  };

  const handleAddEnvVar = () => {
    onChange({ env: { ...(data.env || {}), "": "" } });
  };

  const handleAddEnvFile = () => {
    onChange({ envFiles: [...(data.envFiles || []), ""] });
  };

  const handleAddLabel = () => {
    onChange({ labels: { ...(data.labels || {}), "": "" } });
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column" }}>
      {/* Startup Configuration */}
      <Box sx={{ px: 2, py: 1 }}>
        <Typography variant="subtitle2">Startup Configuration</Typography>
      </Box>
      <Divider />
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, p: 2 }}>
        <InputField
          id="node-startup-config"
          label="Startup configuration Path"
          value={data.startupConfig || ""}
          onChange={(value) => onChange({ startupConfig: value })}
          placeholder="Path to startup configuration file"
        />
        <SelectField
          id="node-startup-config-mode"
          label="Startup configuration mode"
          value={mode}
          onChange={(value) => handleModeChange(value as StartupConfigMode)}
          options={STARTUP_CONFIG_MODE_OPTIONS}
        />
      </Box>

      {/* License */}
      <Divider />
      <Box sx={{ px: 2, py: 1 }}>
        <Typography variant="subtitle2">License</Typography>
      </Box>
      <Divider />
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, p: 2 }}>
        <InputField
          id="node-license"
          label="License File"
          value={data.license || ""}
          onChange={(value) => onChange({ license: value })}
          placeholder="Path to license file"
        />
      </Box>

      {/* Bind Mounts */}
      <Divider />
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 2,
          py: 1
        }}
      >
        <Typography variant="subtitle2">Bind Mounts</Typography>
        <Button variant="text" size="small" startIcon={<AddIcon />} onClick={handleAddBind} sx={{ py: 0 }}>
          ADD
        </Button>
      </Box>
      <Divider />
      <Box sx={{ p: 2 }}>
        <DynamicList
          items={data.binds || []}
          onChange={(items) => onChange({ binds: items })}
          placeholder="host:container[:options]"
          hideAddButton
        />
      </Box>

      {/* Environment Variables */}
      <Divider />
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 2,
          py: 1
        }}
      >
        <Typography variant="subtitle2">Environment Variables</Typography>
        <Button variant="text" size="small" startIcon={<AddIcon />} onClick={handleAddEnvVar} sx={{ py: 0 }}>
          ADD
        </Button>
      </Box>
      <Divider />
      <Box sx={{ p: 2 }}>
        <KeyValueList
          items={data.env || {}}
          onChange={(items) => onChange({ env: items })}
          keyPlaceholder="Variable"
          valuePlaceholder="Value"
          hideAddButton
        />
      </Box>

      {/* Environment Files */}
      <Divider />
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 2,
          py: 1
        }}
      >
        <Typography variant="subtitle2">Environment Files</Typography>
        <Button variant="text" size="small" startIcon={<AddIcon />} onClick={handleAddEnvFile} sx={{ py: 0 }}>
          ADD
        </Button>
      </Box>
      <Divider />
      <Box sx={{ p: 2 }}>
        <DynamicList
          items={data.envFiles || []}
          onChange={(items) => onChange({ envFiles: items })}
          placeholder="Path to env file"
          hideAddButton
        />
      </Box>

      {/* Labels */}
      <Divider />
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 2,
          py: 1
        }}
      >
        <Typography variant="subtitle2">Labels</Typography>
        <Button variant="text" size="small" startIcon={<AddIcon />} onClick={handleAddLabel} sx={{ py: 0 }}>
          ADD
        </Button>
      </Box>
      <Divider />
      <Box sx={{ p: 2 }}>
        <KeyValueList
          items={data.labels || {}}
          onChange={(items) => onChange({ labels: items })}
          keyPlaceholder="Label"
          valuePlaceholder="Value"
          hideAddButton
        />
      </Box>
    </Box>
  );
};
