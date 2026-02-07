/**
 * Configuration Tab for Node Editor
 */
import React from "react";
import Box from "@mui/material/Box";
import FormControl from "@mui/material/FormControl";
import FormLabel from "@mui/material/FormLabel";
import RadioGroup from "@mui/material/RadioGroup";
import FormControlLabel from "@mui/material/FormControlLabel";
import Radio from "@mui/material/Radio";
import Typography from "@mui/material/Typography";

import { InputField, DynamicList, KeyValueList } from "../../ui/form";

import type { TabProps } from "./types";

type StartupConfigMode = "default" | "enforce" | "suppress";

function getStartupConfigMode(data: { enforceStartupConfig?: boolean; suppressStartupConfig?: boolean }): StartupConfigMode {
  if (data.enforceStartupConfig) return "enforce";
  if (data.suppressStartupConfig) return "suppress";
  return "default";
}

const StartupConfigSection: React.FC<TabProps> = ({ data, onChange }) => {
  const mode = getStartupConfigMode(data);

  const handleModeChange = (newMode: StartupConfigMode) => {
    onChange({
      enforceStartupConfig: newMode === "enforce",
      suppressStartupConfig: newMode === "suppress"
    });
  };

  return (
    <>
      <InputField
        id="node-startup-config"
        label="Startup Config"
        value={data.startupConfig || ""}
        onChange={(value) => onChange({ startupConfig: value })}
        placeholder="Path to config file"
      />
      <FormControl size="small">
        <FormLabel sx={{ fontSize: "0.75rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.5px" }}>
          Startup Config Mode
        </FormLabel>
        <RadioGroup
          value={mode}
          onChange={(e) => handleModeChange(e.target.value as StartupConfigMode)}
        >
          <FormControlLabel
            value="default"
            control={<Radio size="small" />}
            label={<Typography variant="body2">Default</Typography>}
          />
          <FormControlLabel
            value="enforce"
            control={<Radio size="small" />}
            label={<Typography variant="body2">Enforce startup config</Typography>}
          />
          <FormControlLabel
            value="suppress"
            control={<Radio size="small" />}
            label={<Typography variant="body2">Suppress startup config</Typography>}
          />
        </RadioGroup>
      </FormControl>
      <InputField
        id="node-license"
        label="License File"
        value={data.license || ""}
        onChange={(value) => onChange({ license: value })}
        placeholder="Path to license file"
      />
    </>
  );
};

const BindsAndEnvSection: React.FC<TabProps> = ({ data, onChange }) => (
  <>
    <Box>
      <Typography variant="caption" sx={{ fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.5px", mb: 0.5, display: "block" }}>
        Bind Mounts
      </Typography>
      <DynamicList
        items={data.binds || []}
        onChange={(items) => onChange({ binds: items })}
        placeholder="host:container[:options]"
        addLabel="Add Bind"
      />
    </Box>
    <Box>
      <Typography variant="caption" sx={{ fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.5px", mb: 0.5, display: "block" }}>
        Environment Variables
      </Typography>
      <KeyValueList
        items={data.env || {}}
        onChange={(items) => onChange({ env: items })}
        keyPlaceholder="Variable"
        valuePlaceholder="Value"
        addLabel="Add Variable"
      />
    </Box>
    <Box>
      <Typography variant="caption" sx={{ fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.5px", mb: 0.5, display: "block" }}>
        Environment Files
      </Typography>
      <DynamicList
        items={data.envFiles || []}
        onChange={(items) => onChange({ envFiles: items })}
        placeholder="Path to env file"
        addLabel="Add Env File"
      />
    </Box>
    <Box>
      <Typography variant="caption" sx={{ fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.5px", mb: 0.5, display: "block" }}>
        Labels
      </Typography>
      <KeyValueList
        items={data.labels || {}}
        onChange={(items) => onChange({ labels: items })}
        keyPlaceholder="Label"
        valuePlaceholder="Value"
        addLabel="Add Label"
      />
    </Box>
  </>
);

export const ConfigTab: React.FC<TabProps> = ({ data, onChange }) => (
  <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
    <StartupConfigSection data={data} onChange={onChange} />
    <BindsAndEnvSection data={data} onChange={onChange} />
  </Box>
);
