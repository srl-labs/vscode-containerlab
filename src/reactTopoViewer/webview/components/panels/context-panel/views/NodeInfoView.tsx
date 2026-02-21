// Node info view with read-only fields.
import React from "react";
import Box from "@mui/material/Box";

import { getRecordUnknown, getString } from "../../../../../shared/utilities/typeHelpers";
import type { NodeData } from "../../../../hooks/ui";
import { PanelSectionHeader, ReadOnlyCopyField } from "../../../ui/form";

export interface NodeInfoViewProps {
  nodeData: NodeData | null;
}

function getNodeProperty(
  extraData: Record<string, unknown> | undefined,
  nodeData: NodeData,
  extraKey: string,
  topLevelKey: keyof NodeData
): string {
  const fromExtra = getString(extraData?.[extraKey]);
  if (fromExtra !== undefined && fromExtra.length > 0) return fromExtra;

  const fromTopLevel = getString(nodeData[topLevelKey]);
  if (fromTopLevel !== undefined && fromTopLevel.length > 0) return fromTopLevel;

  return "";
}

function extractNodeDisplayProps(nodeData: NodeData) {
  const extraData = getRecordUnknown(nodeData.extraData);
  const label = getString(nodeData.label);
  const name = getString(nodeData.name);
  const nodeId = nodeData.id;
  let nodeName = "Unknown";
  if (label !== undefined && label.length > 0) {
    nodeName = label;
  } else if (name !== undefined && name.length > 0) {
    nodeName = name;
  } else if (nodeId.length > 0) {
    nodeName = nodeId;
  }

  return {
    nodeName,
    kind: getNodeProperty(extraData, nodeData, "kind", "kind"),
    state: getNodeProperty(extraData, nodeData, "state", "state"),
    image: getNodeProperty(extraData, nodeData, "image", "image"),
    mgmtIpv4: getNodeProperty(extraData, nodeData, "mgmtIpv4Address", "mgmtIpv4"),
    mgmtIpv6: getNodeProperty(extraData, nodeData, "mgmtIpv6Address", "mgmtIpv6"),
    fqdn: getNodeProperty(extraData, nodeData, "fqdn", "fqdn"),
  };
}

export const NodeInfoView: React.FC<NodeInfoViewProps> = ({ nodeData }) => {
  if (!nodeData) return null;

  const { nodeName, kind, state, image, mgmtIpv4, mgmtIpv6, fqdn } =
    extractNodeDisplayProps(nodeData);

  return (
    <Box sx={{ display: "flex", flexDirection: "column" }}>
      <PanelSectionHeader title="Node" withTopDivider={true} />
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, p: 2 }}>
        <ReadOnlyCopyField label="Name" value={nodeName} />
      </Box>

      <PanelSectionHeader title="Properties" withTopDivider={true} />
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, p: 2 }}>
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
          <ReadOnlyCopyField label="Kind" value={kind} />
          <ReadOnlyCopyField label="State" value={state} />
        </Box>
        <ReadOnlyCopyField label="Image" value={image} />
      </Box>

      <PanelSectionHeader title="Management" withTopDivider={true} />
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, p: 2 }}>
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
          <ReadOnlyCopyField label="IPv4" value={mgmtIpv4} mono />
          <ReadOnlyCopyField label="IPv6" value={mgmtIpv6} mono />
        </Box>
        <ReadOnlyCopyField label="FQDN" value={fqdn} mono />
      </Box>
    </Box>
  );
};
