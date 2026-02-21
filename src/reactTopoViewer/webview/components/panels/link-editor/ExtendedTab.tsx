// Extended link configuration tab.
import React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";

import { KeyValueList, PanelAddSection, InputField, PanelSection } from "../../ui/form";

import type { LinkTabProps, LinkEditorData } from "./types";

/**
 * Veth link properties (MAC, MTU, endpoint IPs, vars, labels)
 */
const VethLinkFields: React.FC<LinkTabProps> = ({ data, onChange }) => {
  const sourceName = data.source || "Source";
  const targetName = data.target || "Target";

  const handleAddVar = () => {
    const vars = data.vars ?? {};
    onChange({ vars: { ...vars, "": "" } });
  };

  const handleAddLabel = () => {
    const labels = data.labels ?? {};
    onChange({ labels: { ...labels, "": "" } });
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column" }}>
      <PanelSection title="Endpoint Properties">
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
          <InputField
            id="link-source-mac"
            label={`${sourceName} MAC`}
            value={data.sourceMac ?? ""}
            onChange={(value) => onChange({ sourceMac: value })}
            placeholder="e.g., 02:42:ac:11:00:01"
          />
          <InputField
            id="link-target-mac"
            label={`${targetName} MAC`}
            value={data.targetMac ?? ""}
            onChange={(value) => onChange({ targetMac: value })}
            placeholder="e.g., 02:42:ac:11:00:02"
          />
        </Box>

        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
          <InputField
            id="link-source-ipv4"
            label={`${sourceName} IPv4`}
            value={data.sourceIpv4 ?? ""}
            onChange={(value) => onChange({ sourceIpv4: value })}
            placeholder="e.g., 10.0.0.1/24"
          />
          <InputField
            id="link-target-ipv4"
            label={`${targetName} IPv4`}
            value={data.targetIpv4 ?? ""}
            onChange={(value) => onChange({ targetIpv4: value })}
            placeholder="e.g., 10.0.0.2/24"
          />
        </Box>

        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
          <InputField
            id="link-source-ipv6"
            label={`${sourceName} IPv6`}
            value={data.sourceIpv6 ?? ""}
            onChange={(value) => onChange({ sourceIpv6: value })}
            placeholder="e.g., 2001:db8::1/64"
          />
          <InputField
            id="link-target-ipv6"
            label={`${targetName} IPv6`}
            value={data.targetIpv6 ?? ""}
            onChange={(value) => onChange({ targetIpv6: value })}
            placeholder="e.g., 2001:db8::2/64"
          />
        </Box>

        <InputField
          id="link-mtu"
          label="MTU"
          value={data.mtu?.toString() ?? ""}
          onChange={(value) => onChange({ mtu: value ? parseInt(value, 10) : undefined })}
          placeholder="e.g., 1500"
          type="number"
        />
      </PanelSection>

      <PanelAddSection title="Variables" onAdd={handleAddVar}>
        <KeyValueList
          items={data.vars ?? {}}
          onChange={(vars) => onChange({ vars })}
          keyPlaceholder="Variable name"
          valuePlaceholder="Value"
          hideAddButton
        />
      </PanelAddSection>

      <PanelAddSection title="Labels" onAdd={handleAddLabel}>
        <KeyValueList
          items={data.labels ?? {}}
          onChange={(labels) => onChange({ labels })}
          keyPlaceholder="Label key"
          valuePlaceholder="Label value"
          hideAddButton
        />
      </PanelAddSection>
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
  const isVethLink = data.type === undefined || data.type === "veth";

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

function addRequiredNodeErrors(data: LinkEditorData, errors: string[]): void {
  if (data.source.length === 0) {
    errors.push("Source node is required");
  }

  if (data.target.length === 0) {
    errors.push("Target node is required");
  }
}

function addInterfaceRequirementErrors(
  data: LinkEditorData,
  errors: string[],
  isSelfLoop: boolean
): void {
  const needsSourceInterface =
    data.sourceEndpoint.length === 0 && data.sourceIsNetwork !== true && !isSelfLoop;
  if (needsSourceInterface) {
    errors.push(`${data.source || "Source"} interface is required`);
  }

  const needsTargetInterface =
    data.targetEndpoint.length === 0 && data.targetIsNetwork !== true && !isSelfLoop;
  if (needsTargetInterface) {
    errors.push(`${data.target || "Target"} interface is required`);
  }
}

function hasSelfLoopEndpointConflict(data: LinkEditorData, isSelfLoop: boolean): boolean {
  if (!isSelfLoop) return false;
  if (data.sourceEndpoint.length === 0 || data.targetEndpoint.length === 0) return false;
  return data.sourceEndpoint === data.targetEndpoint;
}

/**
 * Validation function for link editor data
 */
export function validateLinkEditorData(data: LinkEditorData): string[] {
  const errors: string[] = [];
  const isSelfLoop = data.source === data.target;

  addRequiredNodeErrors(data, errors);
  addInterfaceRequirementErrors(data, errors, isSelfLoop);

  if (hasSelfLoopEndpointConflict(data, isSelfLoop)) {
    errors.push("Source and target interfaces must be different for a self-loop");
  }

  return errors;
}
