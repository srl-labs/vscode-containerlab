// Extended link configuration tab.
import React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";

import { KeyValueList, PanelAddSection } from "../../ui/form";

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
      <PanelAddSection title="Variables" onAdd={handleAddVar} withTopDivider={false}>
        <KeyValueList
          items={data.vars || {}}
          onChange={(vars) => onChange({ vars })}
          keyPlaceholder="Variable name"
          valuePlaceholder="Value"
          hideAddButton
        />
      </PanelAddSection>

      <PanelAddSection title="Labels" onAdd={handleAddLabel}>
        <KeyValueList
          items={data.labels || {}}
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

function addRequiredNodeErrors(data: LinkEditorData, errors: string[]): void {
  if (!data.source) {
    errors.push("Source node is required");
  }

  if (!data.target) {
    errors.push("Target node is required");
  }
}

function addInterfaceRequirementErrors(
  data: LinkEditorData,
  errors: string[],
  isSelfLoop: boolean
): void {
  const needsSourceInterface = !data.sourceEndpoint && !data.sourceIsNetwork && !isSelfLoop;
  if (needsSourceInterface) {
    errors.push(`${data.source || "Source"} interface is required`);
  }

  const needsTargetInterface = !data.targetEndpoint && !data.targetIsNetwork && !isSelfLoop;
  if (needsTargetInterface) {
    errors.push(`${data.target || "Target"} interface is required`);
  }
}

function hasSelfLoopEndpointConflict(data: LinkEditorData, isSelfLoop: boolean): boolean {
  if (!isSelfLoop) return false;
  if (!data.sourceEndpoint || !data.targetEndpoint) return false;
  return data.sourceEndpoint === data.targetEndpoint;
}

/**
 * Validation function for link editor data
 */
export function validateLinkEditorData(data: LinkEditorData): string[] {
  const errors: string[] = [];
  const isSelfLoop = !!data.source && data.source === data.target;

  addRequiredNodeErrors(data, errors);
  addInterfaceRequirementErrors(data, errors, isSelfLoop);

  if (hasSelfLoopEndpointConflict(data, isSelfLoop)) {
    errors.push("Source and target interfaces must be different for a self-loop");
  }

  return errors;
}
