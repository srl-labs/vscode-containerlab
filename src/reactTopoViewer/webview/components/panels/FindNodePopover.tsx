/**
 * FindNodePopover - MUI Popover for find/search functionality
 */
import React from "react";
import type { ReactFlowInstance } from "@xyflow/react";
import Box from "@mui/material/Box";
import Popover from "@mui/material/Popover";

import { FindNodeSearchWidget } from "./find-node/FindNodeSearchWidget";

interface FindNodePopoverProps {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  rfInstance: ReactFlowInstance | null;
}

export const FindNodePopover: React.FC<FindNodePopoverProps> = ({
  anchorEl,
  onClose,
  rfInstance
}) => {
  const open = Boolean(anchorEl);

  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      transformOrigin={{ vertical: "top", horizontal: "center" }}
      data-testid="find-node-popover"
    >
      <Box sx={{ p: 2, width: 320 }}>
        <FindNodeSearchWidget
          rfInstance={rfInstance}
          isActive={open}
          titleVariant="subtitle2"
          dense
        />
      </Box>
    </Popover>
  );
};
