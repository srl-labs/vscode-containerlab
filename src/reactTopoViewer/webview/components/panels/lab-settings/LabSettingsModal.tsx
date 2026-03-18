// Lab settings dialog.
import React, { useCallback, useRef } from "react";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";

import { LabSettingsSection } from "../lab-drawer/LabSettingsSection";
import type { GridSettingsControlsProps } from "../GridSettingsPopover";
import { DialogTitleWithClose } from "../../ui/dialog/DialogChrome";

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
  const canSave = !isLocked;
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
      <DialogTitleWithClose
        title="Lab Settings"
        onClose={onClose}
        closeButtonTestId="lab-settings-close-btn"
      />
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
      {canSave && (
        <DialogActions>
          <Button size="small" onClick={handleSaveClick} data-testid="lab-settings-save-btn">
            Apply
          </Button>
        </DialogActions>
      )}
    </Dialog>
  );
};
