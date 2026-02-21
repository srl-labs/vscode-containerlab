import React from "react";
import CloseIcon from "@mui/icons-material/Close";
import Button from "@mui/material/Button";
import DialogActions from "@mui/material/DialogActions";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";

interface DialogTitleWithCloseProps {
  title: React.ReactNode;
  onClose: () => void;
}

export const DialogTitleWithClose: React.FC<DialogTitleWithCloseProps> = ({ title, onClose }) => (
  <DialogTitle
    sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", py: 1.5 }}
  >
    {title}
    <IconButton size="small" onClick={onClose}>
      <CloseIcon fontSize="small" />
    </IconButton>
  </DialogTitle>
);

interface DialogCancelSaveActionsProps {
  onCancel: () => void;
  onSave: () => void;
  cancelLabel?: string;
  saveLabel?: string;
  disableSave?: boolean;
}

export const DialogCancelSaveActions: React.FC<DialogCancelSaveActionsProps> = ({
  onCancel,
  onSave,
  cancelLabel = "Cancel",
  saveLabel = "Save",
  disableSave = false,
}) => (
  <DialogActions>
    <Button variant="text" size="small" onClick={onCancel}>
      {cancelLabel}
    </Button>
    <Button size="small" onClick={onSave} disabled={disableSave}>
      {saveLabel}
    </Button>
  </DialogActions>
);
