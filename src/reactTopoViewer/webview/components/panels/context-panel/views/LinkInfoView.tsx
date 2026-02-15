// Link info view with endpoint tabs.
import React, { useState } from "react";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import Typography from "@mui/material/Typography";

import type { LinkData } from "../../../../hooks/ui";
import type { InterfaceStatsPayload } from "../../../../../shared/types/topology";
import { TrafficChart } from "../../TrafficChart";
import type { TabDefinition } from "../../../ui/editor";
import { TabNavigation } from "../../../ui/editor/TabNavigation";
import { ReadOnlyCopyField } from "../../../ui/form";

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
    interface: linkData.sourceEndpoint || "",
    mac: (extraData.clabSourceMacAddress as string) || "",
    mtu: extraData.clabSourceMtu || "",
    type: (extraData.clabSourceType as string) || "",
    stats: extraData.clabSourceStats
  };

  const b: EndpointData = linkData.endpointB || {
    node: linkData.target,
    interface: linkData.targetEndpoint || "",
    mac: (extraData.clabTargetMacAddress as string) || "",
    mtu: extraData.clabTargetMtu || "",
    type: (extraData.clabTargetType as string) || "",
    stats: extraData.clabTargetStats
  };

  return { a, b };
}

const SectionHeader: React.FC<{ title: string }> = ({ title }) => (
  <>
    <Divider />
    <Box sx={{ px: 2, py: 1 }}>
      <Typography variant="subtitle2">{title}</Typography>
    </Box>
    <Divider />
  </>
);

export const LinkInfoView: React.FC<LinkInfoViewProps> = ({ linkData }) => {
  const [activeTab, setActiveTab] = useState<EndpointTab>("a");

  if (!linkData) return null;

  const endpoints = getEndpoints(linkData);
  const currentEndpoint = activeTab === "a" ? endpoints.a : endpoints.b;
  const endpointKey = `${activeTab}:${currentEndpoint.node}:${currentEndpoint.interface}`;

  const endpointTabs: TabDefinition[] = [
    { id: "a", label: `${linkData.source}:${linkData.sourceEndpoint || "eth"}` },
    { id: "b", label: `${linkData.target}:${linkData.targetEndpoint || "eth"}` }
  ];

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <TabNavigation
        tabs={endpointTabs}
        activeTab={activeTab}
        onTabChange={(id) => setActiveTab(id as EndpointTab)}
      />

      <Box sx={{ flex: 1, overflow: "auto" }}>
        <SectionHeader title="Endpoint" />
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, p: 2 }}>
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
            <ReadOnlyCopyField label="Node" value={currentEndpoint.node || ""} />
            <ReadOnlyCopyField label="Interface" value={currentEndpoint.interface || ""} />
          </Box>
          <ReadOnlyCopyField label="Type" value={currentEndpoint.type || ""} />
        </Box>

        <SectionHeader title="Layer 2" />
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, p: 2 }}>
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
            <ReadOnlyCopyField label="MAC" value={currentEndpoint.mac || ""} mono />
            <ReadOnlyCopyField label="MTU" value={String(currentEndpoint.mtu || "")} />
          </Box>
        </Box>

        <SectionHeader title="Traffic" />
        <Box sx={{ minHeight: 200 }}>
          <TrafficChart stats={currentEndpoint.stats} endpointKey={endpointKey} />
        </Box>
      </Box>
    </Box>
  );
};
