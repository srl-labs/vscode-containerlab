// Info content for the Info tab.
import React from "react";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";

import { useContextPanelContent } from "../../../../hooks/ui/useContextPanelContent";
import type { NodeData, LinkData } from "../../../../hooks/ui";
import { PanelEmptyState } from "../../../ui/form";

import { NodeInfoView } from "./NodeInfoView";
import { LinkInfoView } from "./LinkInfoView";

export interface InfoTabContentProps {
  selectedNodeData: NodeData | null;
  selectedLinkData: (LinkData & { extraData?: Record<string, unknown> }) | null;
}

/** Placeholder shown when no info view is active */
const InfoPlaceholder: React.FC = () => (
  <PanelEmptyState
    icon={<InfoOutlinedIcon sx={{ fontSize: 48, opacity: 0.5 }} />}
    message="Select a node or link to view its properties."
  />
);

export const InfoTabContent: React.FC<InfoTabContentProps> = ({
  selectedNodeData,
  selectedLinkData,
}) => {
  const panelView = useContextPanelContent();

  switch (panelView.kind) {
    case "nodeInfo":
      return <NodeInfoView nodeData={selectedNodeData} />;
    case "linkInfo":
      return <LinkInfoView linkData={selectedLinkData} />;
    default:
      return <InfoPlaceholder />;
  }
};
