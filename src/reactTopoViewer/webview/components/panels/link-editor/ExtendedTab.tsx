// Extended link configuration tab.
import React from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import AddIcon from "@mui/icons-material/Add";

import { KeyValueList } from "../../ui/form";

import type { LinkTabProps, LinkEditorData } from "./types";

/**
 * Veth link properties (vars, labels)
 */
const VethLinkFields: React.FC<LinkTabProps> = ({ data, onChange }) => {
  const handleAddVar = () => {
    const vars = data.vars || {};
    onChange({ vars: { ...vars, "": "" } });
  };

  const handleAddLabel = () => {
    const labels = data.labels || {};
    onChange({ labels: { ...labels, "": "" } });
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column" }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 2,
          py: 1
        }}
      >
        <Typography variant="subtitle2">Variables</Typography>
        <Button variant="text" size="small" startIcon={<AddIcon />} onClick={handleAddVar} sx={{ py: 0 }}>
          ADD
        </Button>
      </Box>
      <Divider />
      <Box sx={{ p: 2 }}>
        <KeyValueList
          items={data.vars || {}}
          onChange={(vars) => onChange({ vars })}
          keyPlaceholder="Variable name"
          valuePlaceholder="Value"
          hideAddButton
        />
      </Box>

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
          onChange={(labels) => onChange({ labels })}
          keyPlaceholder="Label key"
          valuePlaceholder="Label value"
          hideAddButton
        />
      </Box>
    </Box>
  );
};

/**
 * Info message for non-veth links
 */
const NonVethInfo: React.FC = () => (
  <Paper variant="outlined" sx={{ p: 1.5, bgcolor: "action.hover" }}>
    <Typography variant="body2">
      <strong>Note:</strong> This link connects to a network node. Configure extended properties on
      the network node itself.
    </Typography>
  </Paper>
);

export const ExtendedTab: React.FC<LinkTabProps> = ({ data, onChange }) => {
  const isVethLink = !data.type || data.type === "veth";

  return (
    <Box sx={{ display: "flex", flexDirection: "column" }}>
      {isVethLink ? (
        <VethLinkFields data={data} onChange={onChange} />
      ) : (
        <Box sx={{ p: 2 }}>
          <NonVethInfo />
        </Box>
      )}
    </Box>
  );
};

/**
 * Validation function for link editor data
 */
export function validateLinkEditorData(data: LinkEditorData): string[] {
  const errors: string[] = [];

  if (!data.source) {
    errors.push("Source node is required");
  }
  if (!data.target) {
    errors.push("Target node is required");
  }
  const isSelfLoop = !!data.source && data.source === data.target;
  // Only require interface for regular (non-network) endpoints
  if (!data.sourceEndpoint && !data.sourceIsNetwork && !isSelfLoop) {
    errors.push(`${data.source || "Source"} interface is required`);
  }
  if (!data.targetEndpoint && !data.targetIsNetwork && !isSelfLoop) {
    errors.push(`${data.target || "Target"} interface is required`);
  }
  if (
    isSelfLoop &&
    data.sourceEndpoint &&
    data.targetEndpoint &&
    data.sourceEndpoint === data.targetEndpoint
  ) {
    errors.push("Source and target interfaces must be different for a self-loop");
  }
  return errors;
}
