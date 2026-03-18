// Shortcuts reference dialog.
import React from "react";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";

import { ShortcutsSection } from "./lab-drawer/ShortcutsSection";
import { DialogTitleWithClose } from "../ui/dialog/DialogChrome";

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => (
  <Dialog open={isOpen} onClose={onClose} maxWidth="sm" fullWidth data-testid="shortcuts-modal">
    <DialogTitleWithClose title="Shortcuts & Interactions" onClose={onClose} />
    <DialogContent dividers sx={{ p: 0 }}>
      <ShortcutsSection />
    </DialogContent>
  </Dialog>
);
