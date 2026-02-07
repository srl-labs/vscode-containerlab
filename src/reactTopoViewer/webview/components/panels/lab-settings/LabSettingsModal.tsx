/**
 * LabSettingsModal - MUI Dialog wrapper for lab settings
 */
import React from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";

import { LabSettingsSection } from "../lab-drawer/LabSettingsSection";

import type { LabSettings } from "./types";

interface LabSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: "view" | "edit";
  isLocked: boolean;
  labSettings?: LabSettings;
}

export const LabSettingsModal: React.FC<LabSettingsModalProps> = ({
  isOpen,
  onClose,
  mode,
  isLocked,
  labSettings
}) => (
  <Dialog open={isOpen} onClose={onClose} maxWidth="sm" fullWidth>
    <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", py: 1.5 }}>
      Lab Settings
      <IconButton size="small" onClick={onClose}>
        <CloseIcon fontSize="small" />
      </IconButton>
    </DialogTitle>
    <DialogContent dividers sx={{ p: 0 }}>
      <LabSettingsSection
        mode={mode}
        isLocked={isLocked}
        labSettings={labSettings}
        onClose={onClose}
      />
    </DialogContent>
  </Dialog>
);
