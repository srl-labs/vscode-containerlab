/**
 * FindNodeSection - Search/find nodes in the topology
 * Migrated from FindNodePanel for use in the Settings Drawer
 */
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
        titleVariant="h6"
        description="Search for nodes in the topology by name."
        showTipsHeader
      />
    </Box>
  );
};
