// Find node popover.
import React from "react";
import type { ReactFlowInstance } from "@xyflow/react";
import Box from "@mui/material/Box";
import Popover from "@mui/material/Popover";

import { FindNodeSearchWidget } from "./find-node/FindNodeSearchWidget";

interface FindNodePopoverProps {
  anchorPosition: { top: number; left: number } | null;
  onClose: () => void;
  rfInstance: ReactFlowInstance | null;
}

export const FindNodePopover: React.FC<FindNodePopoverProps> = ({
  anchorPosition,
  onClose,
  rfInstance
}) => {
  const open = Boolean(anchorPosition);

  return (
    <Popover
      open={open}
      onClose={onClose}
      anchorReference="anchorPosition"
      anchorPosition={anchorPosition ?? undefined}
      transformOrigin={{ vertical: "top", horizontal: "center" }}
      data-testid="find-node-popover"
    >
      <Box sx={{ p: 2, width: 320 }}>
        <FindNodeSearchWidget rfInstance={rfInstance} isActive={open} dense />
      </Box>
    </Popover>
  );
};
