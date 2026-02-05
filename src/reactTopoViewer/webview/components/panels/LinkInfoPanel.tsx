/**
 * Link Info Panel Component
 * Shows properties of a selected link/edge with endpoint tabs and traffic charts
 */
import React, { useState } from "react";
import Box from "@mui/material/Box";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";

import type { LinkData } from "../../hooks/ui";
import type { InterfaceStatsPayload } from "../../../shared/types/topology";

import { FloatingPanel, PropertyRow } from "./InfoFloatingPanel";
import { TrafficChart } from "./TrafficChart";

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

interface LinkInfoPanelProps {
  isVisible: boolean;
  linkData: LinkInfoData | null;
  onClose: () => void;
}

type EndpointTab = "a" | "b";

/**
 * Get endpoint data from link data, extracting stats from extraData
 */
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

export const LinkInfoPanel: React.FC<LinkInfoPanelProps> = ({ isVisible, linkData, onClose }) => {
  const [activeTab, setActiveTab] = useState<EndpointTab>("a");

  if (!linkData) return null;

  const endpoints = getEndpoints(linkData);
  const currentEndpoint = activeTab === "a" ? endpoints.a : endpoints.b;
  const endpointKey = `${activeTab}:${currentEndpoint.node}:${currentEndpoint.interface}`;

  const handleTabChange = (_event: React.SyntheticEvent, newValue: EndpointTab) => {
    setActiveTab(newValue);
  };

  return (
    <FloatingPanel
      title="Link Properties"
      isVisible={isVisible}
      onClose={onClose}
      initialPosition={{ x: 20, y: 100 }}
      width={400}
      height={450}
      resizable={true}
      minWidth={350}
      minHeight={400}
    >
      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: "divider", mb: 2, mx: -2, mt: -1 }}>
        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          sx={{
            minHeight: 40,
            "& .MuiTab-root": {
              minHeight: 40,
              textTransform: "none",
              fontSize: "0.8125rem"
            }
          }}
        >
          <Tab
            value="a"
            label={`${linkData.source}:${linkData.sourceEndpoint || "eth"}`}
          />
          <Tab
            value="b"
            label={`${linkData.target}:${linkData.targetEndpoint || "eth"}`}
          />
        </Tabs>
      </Box>

      {/* Properties Grid */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 2,
          mb: 2
        }}
      >
        <PropertyRow label="Node" value={currentEndpoint.node || "N/A"} />
        <PropertyRow label="Interface" value={currentEndpoint.interface || "N/A"} />
        <PropertyRow label="Type" value={currentEndpoint.type || "N/A"} />

        <PropertyRow label="MAC" value={currentEndpoint.mac || "N/A"} />
        <PropertyRow label="MTU" value={String(currentEndpoint.mtu || "N/A")} />
        <Box />
      </Box>

      {/* Traffic Chart */}
      <Box sx={{ flex: 1, minHeight: 200 }}>
        <TrafficChart stats={currentEndpoint.stats} endpointKey={endpointKey} />
      </Box>
    </FloatingPanel>
  );
};
