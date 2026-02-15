// Node info view with read-only fields.
import React from "react";
import Box from "@mui/material/Box";

import type { NodeData } from "../../../../hooks/ui";
import { PanelSectionHeader, ReadOnlyCopyField } from "../../../ui/form";

export interface NodeInfoViewProps {
  nodeData: NodeData | null;
}

function getNodeProperty(
  extraData: Record<string, unknown>,
  nodeData: NodeData,
  extraKey: string,
  topLevelKey: keyof NodeData
): string {
  return (extraData[extraKey] as string) || (nodeData[topLevelKey] as string) || "";
}

function extractNodeDisplayProps(nodeData: NodeData) {
  const extraData = (nodeData.extraData as Record<string, unknown>) || {};
  return {
    nodeName: nodeData.label || nodeData.name || nodeData.id || "Unknown",
    kind: getNodeProperty(extraData, nodeData, "kind", "kind"),
    state: getNodeProperty(extraData, nodeData, "state", "state"),
    image: getNodeProperty(extraData, nodeData, "image", "image"),
    mgmtIpv4: getNodeProperty(extraData, nodeData, "mgmtIpv4Address", "mgmtIpv4"),
    mgmtIpv6: getNodeProperty(extraData, nodeData, "mgmtIpv6Address", "mgmtIpv6"),
    fqdn: getNodeProperty(extraData, nodeData, "fqdn", "fqdn")
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
