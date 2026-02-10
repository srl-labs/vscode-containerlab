/**
 * ExtendedTab - Extended link configuration (MAC, MTU, vars, labels)
 */
import React from "react";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";

import { InputField, KeyValueList, ReadOnlyBadge } from "../../ui/form";

import type { LinkTabProps, LinkEditorData } from "./types";

/**
 * Header section with link name and type
 */
const HeaderSection: React.FC<{ linkId: string; linkType?: string }> = ({ linkId, linkType }) => (
  <>
    <Box>
      <Box sx={{ mb: 1.5 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
          Link Name
        </Typography>
        <ReadOnlyBadge>{linkId || "New Link"}</ReadOnlyBadge>
      </Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
            Type
          </Typography>
          <ReadOnlyBadge>{linkType || "veth"}</ReadOnlyBadge>
        </Box>
        <Typography variant="caption" color="text.secondary">
          (auto-detected)
        </Typography>
      </Box>
    </Box>
    <Divider sx={{ my: 1.5 }} />
  </>
);

/**
 * Veth link properties (MAC, MTU, vars, labels)
 */
const VethLinkFields: React.FC<LinkTabProps> = ({ data, onChange }) => (
  <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
    <InputField
      id="link-source-mac"
      label="Source MAC"
      value={data.sourceMac || ""}
      onChange={(value) => onChange({ sourceMac: value })}
      placeholder="e.g., 02:42:ac:11:00:01"
      tooltip="MAC address for source endpoint"
    />

    <InputField
      id="link-target-mac"
      label="Target MAC"
      value={data.targetMac || ""}
      onChange={(value) => onChange({ targetMac: value })}
      placeholder="e.g., 02:42:ac:11:00:02"
      tooltip="MAC address for target endpoint"
    />

    <InputField
      id="link-mtu"
      label="MTU"
      value={data.mtu?.toString() || ""}
      onChange={(value) => onChange({ mtu: value ? parseInt(value, 10) : undefined })}
      placeholder="e.g., 1500"
      type="number"
      tooltip="Maximum Transmission Unit"
    />

    <Box>
      <Typography
        variant="caption"
        sx={{ fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.5, mb: 0.5, display: "block" }}
      >
        Variables
      </Typography>
      <KeyValueList
        items={data.vars || {}}
        onChange={(vars) => onChange({ vars })}
        keyPlaceholder="Variable name"
        valuePlaceholder="Value"
        addLabel="Add Variable"
      />
    </Box>

    <Box>
      <Typography
        variant="caption"
        sx={{ fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.5, mb: 0.5, display: "block" }}
      >
        Labels
      </Typography>
      <KeyValueList
        items={data.labels || {}}
        onChange={(labels) => onChange({ labels })}
        keyPlaceholder="Label key"
        valuePlaceholder="Label value"
        addLabel="Add Label"
      />
    </Box>
  </Box>
);

/**
 * Info message for non-veth links
 */
const NonVethInfo: React.FC = () => (
  <Paper
    variant="outlined"
    sx={{ p: 1.5, bgcolor: "action.hover" }}
  >
    <Typography variant="body2">
      <strong>Note:</strong> This link connects to a network node. Configure
      extended properties on the network node itself.
    </Typography>
  </Paper>
);

export const ExtendedTab: React.FC<LinkTabProps> = ({ data, onChange }) => {
  const isVethLink = !data.type || data.type === "veth";

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <HeaderSection linkId={data.id} linkType={data.type} />
      {isVethLink ? <VethLinkFields data={data} onChange={onChange} /> : <NonVethInfo />}
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
    errors.push("Source interface is required");
  }
  if (!data.targetEndpoint && !data.targetIsNetwork && !isSelfLoop) {
    errors.push("Target interface is required");
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
