// Lab settings dialog.
import React, { useRef } from "react";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
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
}) => {
  const saveRef = useRef<(() => Promise<void>) | null>(null);
  const isReadOnly = mode === "view" || isLocked;

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      data-testid="lab-settings-modal"
      PaperProps={{ sx: { height: "80vh", maxHeight: "80vh" } }}
    >
      <DialogTitle
        sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", py: 1.5 }}
      >
        Lab Settings
        <IconButton size="small" onClick={onClose} data-testid="lab-settings-close-btn">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ p: 0, overflow: "auto" }}>
        <LabSettingsSection
          mode={mode}
          isLocked={isLocked}
          labSettings={labSettings}
          onClose={onClose}
          saveRef={saveRef}
        />
      </DialogContent>
      {!isReadOnly && (
        <DialogActions>
          <Button
            size="small"
            onClick={() => void saveRef.current?.()}
            data-testid="lab-settings-save-btn"
          >
            Apply
          </Button>
        </DialogActions>
      )}
    </Dialog>
  );
};
