// Lab settings dialog.
import React, { useCallback, useRef } from "react";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";

import { LabSettingsSection } from "../lab-drawer/LabSettingsSection";
import type { GridSettingsControlsProps } from "../GridSettingsPopover";

import type { LabSettings } from "./types";

interface LabSettingsModalProps extends GridSettingsControlsProps {
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
  labSettings,
  gridLineWidth,
  onGridLineWidthChange,
  gridStyle,
  onGridStyleChange,
  gridColor,
  onGridColorChange,
  gridBgColor,
  onGridBgColorChange,
  onResetGridColors
}) => {
  const saveRef = useRef<(() => Promise<void>) | null>(null);
  const isReadOnly = mode === "view" || isLocked;
  const handleSaveClick = useCallback(() => {
    const save = saveRef.current;
    if (!save) {
      return;
    }
    save().catch((error) => {
      console.error("Failed to save lab settings", error);
    });
  }, []);

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      data-testid="lab-settings-modal"
      slotProps={{ paper: { sx: { height: "80vh", maxHeight: "80vh" } } }}
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
          gridLineWidth={gridLineWidth}
          onGridLineWidthChange={onGridLineWidthChange}
          gridStyle={gridStyle}
          onGridStyleChange={onGridStyleChange}
          gridColor={gridColor}
          onGridColorChange={onGridColorChange}
          gridBgColor={gridBgColor}
          onGridBgColorChange={onGridBgColorChange}
          onResetGridColors={onResetGridColors}
        />
      </DialogContent>
      {!isReadOnly && (
        <DialogActions>
          <Button size="small" onClick={handleSaveClick} data-testid="lab-settings-save-btn">
            Apply
          </Button>
        </DialogActions>
      )}
    </Dialog>
  );
};
