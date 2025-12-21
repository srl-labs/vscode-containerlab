/**
 * Shared button components for dynamic list components
 */
import React from 'react';

interface DeleteItemButtonProps {
  onRemove: () => void;
  disabled?: boolean;
}

export const DeleteItemButton: React.FC<DeleteItemButtonProps> = ({
  onRemove,
  disabled
}) => (
  <button
    type="button"
    className="dynamic-delete-btn"
    onClick={onRemove}
    aria-label="Remove"
    disabled={disabled}
  >
    <i className="fas fa-trash"></i>
  </button>
);

interface AddItemButtonProps {
  onAdd: () => void;
  label?: string;
  disabled?: boolean;
}

export const AddItemButton: React.FC<AddItemButtonProps> = ({
  onAdd,
  label = 'Add',
  disabled
}) => (
  <button
    type="button"
    className="btn btn-small"
    onClick={onAdd}
    disabled={disabled}
  >
    <i className="fas fa-plus mr-1"></i>
    {label}
  </button>
);
