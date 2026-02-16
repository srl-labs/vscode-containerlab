// Shortcuts reference dialog.
import React from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";

import { ShortcutsSection } from "./lab-drawer/ShortcutsSection";

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => (
  <Dialog open={isOpen} onClose={onClose} maxWidth="sm" fullWidth data-testid="shortcuts-modal">
    <DialogTitle
      sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", py: 1.5 }}
    >
      Shortcuts & Interactions
      <IconButton size="small" onClick={onClose}>
        <CloseIcon fontSize="small" />
      </IconButton>
    </DialogTitle>
    <DialogContent dividers sx={{ p: 0 }}>
      <ShortcutsSection />
    </DialogContent>
  </Dialog>
);
