// Find node section for the settings drawer.
import React from "react";
import type { ReactFlowInstance } from "@xyflow/react";
import Box from "@mui/material/Box";

import { FindNodeSearchWidget } from "../find-node/FindNodeSearchWidget";

interface FindNodeSectionProps {
  rfInstance: ReactFlowInstance | null;
  isVisible: boolean;
}

export const FindNodeSection: React.FC<FindNodeSectionProps> = ({ rfInstance, isVisible }) => {
  return (
    <Box sx={{ p: 2 }}>
      <FindNodeSearchWidget
        rfInstance={rfInstance}
        isActive={isVisible}
        description="Search for nodes in the topology by name."
        showTipsHeader
      />
    </Box>
  );
};
