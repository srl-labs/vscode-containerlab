// Info content for the Info tab.
import React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";

import { useContextPanelContent } from "../../../../hooks/ui/useContextPanelContent";
import type { NodeData, LinkData } from "../../../../hooks/ui";

import { NodeInfoView } from "./NodeInfoView";
import { LinkInfoView } from "./LinkInfoView";

export interface InfoTabContentProps {
  selectedNodeData: NodeData | null;
  selectedLinkData: (LinkData & { extraData?: Record<string, unknown> }) | null;
}

/** Placeholder shown when no info view is active */
const InfoPlaceholder: React.FC = () => (
  <Box
    sx={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      height: "100%",
      gap: 2,
      color: "text.secondary",
      p: 4
    }}
  >
    <InfoOutlinedIcon sx={{ fontSize: 48, opacity: 0.5 }} />
    <Typography variant="body2" textAlign="center">
      Select a node or link to view its properties.
    </Typography>
  </Box>
);

export const InfoTabContent: React.FC<InfoTabContentProps> = ({
  selectedNodeData,
  selectedLinkData
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
