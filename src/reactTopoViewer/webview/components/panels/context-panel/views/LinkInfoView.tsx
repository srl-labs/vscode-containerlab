/**
 * LinkInfoView - Link info content for the ContextPanel
 * Extracts display logic from LinkInfoPanel without FloatingPanel wrapper.
 */
import React, { useState } from "react";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Typography from "@mui/material/Typography";

import type { LinkData } from "../../../../hooks/ui";
import type { InterfaceStatsPayload } from "../../../../../shared/types/topology";
import { TrafficChart } from "../../TrafficChart";

interface EndpointData {
  node?: string;
  interface?: string;
  mac?: string;
  mtu?: string | number;
  type?: string;
  stats?: InterfaceStatsPayload;
}

type LinkInfoData = LinkData & {
  endpointA?: EndpointData;
  endpointB?: EndpointData;
  extraData?: {
    clabSourceStats?: InterfaceStatsPayload;
    clabTargetStats?: InterfaceStatsPayload;
    clabSourceMacAddress?: string;
    clabTargetMacAddress?: string;
    clabSourceMtu?: string | number;
    clabTargetMtu?: string | number;
    clabSourceType?: string;
    clabTargetType?: string;
    [key: string]: unknown;
  };
};

export interface LinkInfoViewProps {
  linkData: LinkInfoData | null;
}

type EndpointTab = "a" | "b";

function getEndpoints(linkData: LinkInfoData): { a: EndpointData; b: EndpointData } {
  const extraData = linkData.extraData || {};

  const a: EndpointData = linkData.endpointA || {
    node: linkData.source,
    interface: linkData.sourceEndpoint || "N/A",
    mac: (extraData.clabSourceMacAddress as string) || "N/A",
    mtu: extraData.clabSourceMtu || "N/A",
    type: (extraData.clabSourceType as string) || "N/A",
    stats: extraData.clabSourceStats
  };

  const b: EndpointData = linkData.endpointB || {
    node: linkData.target,
    interface: linkData.targetEndpoint || "N/A",
    mac: (extraData.clabTargetMacAddress as string) || "N/A",
    mtu: extraData.clabTargetMtu || "N/A",
    type: (extraData.clabTargetType as string) || "N/A",
    stats: extraData.clabTargetStats
  };

  return { a, b };
}

const PropertyRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
    <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, textTransform: "uppercase" }}>
      {label}
    </Typography>
    <Typography variant="body2" sx={{ textAlign: "center", wordBreak: "break-all" }}>
      {value || "N/A"}
    </Typography>
  </Box>
);

export const LinkInfoView: React.FC<LinkInfoViewProps> = ({ linkData }) => {
  const [activeTab, setActiveTab] = useState<EndpointTab>("a");

  if (!linkData) return null;

  const endpoints = getEndpoints(linkData);
  const currentEndpoint = activeTab === "a" ? endpoints.a : endpoints.b;
  const endpointKey = `${activeTab}:${currentEndpoint.node}:${currentEndpoint.interface}`;

  const handleTabChange = (_event: React.SyntheticEvent, newValue: EndpointTab) => {
    setActiveTab(newValue);
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <Tabs
        value={activeTab}
        onChange={handleTabChange}
        sx={{
          minHeight: 40,
          "& .MuiTab-root": { minHeight: 40, fontSize: "0.8125rem" }
        }}
      >
        <Tab value="a" label={`${linkData.source}:${linkData.sourceEndpoint || "eth"}`} />
        <Tab value="b" label={`${linkData.target}:${linkData.targetEndpoint || "eth"}`} />
      </Tabs>
      <Divider sx={{ mb: 2 }} />

      <Box sx={{ px: 2, pb: 2, flex: 1, overflow: "auto" }}>
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 2, mb: 2 }}>
          <PropertyRow label="Node" value={currentEndpoint.node || "N/A"} />
          <PropertyRow label="Interface" value={currentEndpoint.interface || "N/A"} />
          <PropertyRow label="Type" value={currentEndpoint.type || "N/A"} />
          <PropertyRow label="MAC" value={currentEndpoint.mac || "N/A"} />
          <PropertyRow label="MTU" value={String(currentEndpoint.mtu || "N/A")} />
          <Box />
        </Box>

        <Box sx={{ minHeight: 200 }}>
          <TrafficChart stats={currentEndpoint.stats} endpointKey={endpointKey} />
        </Box>
      </Box>
    </Box>
  );
};
