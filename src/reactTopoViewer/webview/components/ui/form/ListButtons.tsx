/**
 * Shared button components for dynamic list components
 */
import React from "react";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";

interface DeleteItemButtonProps {
  onRemove: () => void;
  disabled?: boolean;
}

export const DeleteItemButton: React.FC<DeleteItemButtonProps> = ({ onRemove, disabled }) => (
  <IconButton
    size="small"
    onClick={onRemove}
    aria-label="Remove"
    disabled={disabled}
    sx={{ "&:hover": { color: "error.main" } }}
  >
    <DeleteIcon fontSize="small" />
  </IconButton>
);

interface AddItemButtonProps {
  onAdd: () => void;
  label?: string;
  disabled?: boolean;
}

export const AddItemButton: React.FC<AddItemButtonProps> = ({ onAdd, label = "Add", disabled }) => (
  <Button size="small" startIcon={<AddIcon />} onClick={onAdd} disabled={disabled}>
    {label}
  </Button>
);
