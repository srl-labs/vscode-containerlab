/**
 * BasicTab - Basic settings tab for Lab Settings panel
 */
import React from "react";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import FormHelperText from "@mui/material/FormHelperText";

import type { PrefixType } from "./types";

interface BasicTabProps {
  labName: string;
  prefixType: PrefixType;
  customPrefix: string;
  isViewMode: boolean;
  onLabNameChange: (value: string) => void;
  onPrefixTypeChange: (value: PrefixType) => void;
  onCustomPrefixChange: (value: string) => void;
}

export const BasicTab: React.FC<BasicTabProps> = ({
  labName,
  prefixType,
  customPrefix,
  isViewMode,
  onLabNameChange,
  onPrefixTypeChange,
  onCustomPrefixChange
}) => {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
      {/* Lab Name */}
      <TextField
        label="Lab Name"
        placeholder="Enter lab name"
        value={labName}
        onChange={(e) => onLabNameChange(e.target.value)}
        disabled={isViewMode}
        size="small"
        fullWidth
        helperText="Unique name to identify and distinguish this topology from others"
      />

      {/* Prefix */}
      <FormControl size="small" fullWidth disabled={isViewMode}>
        <InputLabel>Container Name Prefix</InputLabel>
        <Select
          value={prefixType}
          label="Container Name Prefix"
          onChange={(e) => onPrefixTypeChange(e.target.value as PrefixType)}
        >
          <MenuItem value="default">Default (clab)</MenuItem>
          <MenuItem value="custom">Custom</MenuItem>
          <MenuItem value="no-prefix">No prefix</MenuItem>
        </Select>
        <FormHelperText>
          Default: clab-&lt;lab-name&gt;-&lt;node-name&gt; | No prefix: &lt;node-name&gt;
        </FormHelperText>
      </FormControl>

      {prefixType === "custom" && (
        <TextField
          label="Custom Prefix"
          placeholder="Enter custom prefix"
          value={customPrefix}
          onChange={(e) => onCustomPrefixChange(e.target.value)}
          disabled={isViewMode}
          size="small"
          fullWidth
        />
      )}
    </Box>
  );
};
