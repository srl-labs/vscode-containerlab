/**
 * KeyValueList - Dynamic key-value pairs
 */
import React from "react";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";

import { AddItemButton, DeleteItemButton } from "./ListButtons";

interface KeyValueListProps {
  items: Record<string, string>;
  onChange: (items: Record<string, string>) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  addLabel?: string;
  disabled?: boolean;
  hideAddButton?: boolean;
}

export const KeyValueList: React.FC<KeyValueListProps> = ({
  items,
  onChange,
  keyPlaceholder = "Key",
  valuePlaceholder = "Value",
  addLabel = "Add",
  disabled,
  hideAddButton
}) => {
  const entries = Object.entries(items);

  const handleAdd = () => {
    onChange({ ...items, "": "" });
  };

  const handleRemove = (key: string) => {
    const newItems = { ...items };
    delete newItems[key];
    onChange(newItems);
  };

  const handleKeyChange = (oldKey: string, newKey: string) => {
    if (oldKey === newKey) return;
    const newItems: Record<string, string> = {};
    for (const [k, v] of Object.entries(items)) {
      newItems[k === oldKey ? newKey : k] = v;
    }
    onChange(newItems);
  };

  const handleValueChange = (key: string, value: string) => {
    onChange({ ...items, [key]: value });
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {entries.map(([key, value], index) => (
        <KeyValueItem
          key={index}
          itemKey={key}
          value={value}
          onKeyChange={(newKey) => handleKeyChange(key, newKey)}
          onValueChange={(val) => handleValueChange(key, val)}
          onRemove={() => handleRemove(key)}
          keyPlaceholder={keyPlaceholder}
          valuePlaceholder={valuePlaceholder}
          disabled={disabled}
        />
      ))}
      {hideAddButton !== true && (
        <AddItemButton onAdd={handleAdd} label={addLabel} disabled={disabled} />
      )}
    </Box>
  );
};

/**
 * Single key-value item
 */
interface KeyValueItemProps {
  itemKey: string;
  value: string;
  onKeyChange: (key: string) => void;
  onValueChange: (value: string) => void;
  onRemove: () => void;
  keyPlaceholder: string;
  valuePlaceholder: string;
  disabled?: boolean;
}

const KeyValueItem: React.FC<KeyValueItemProps> = ({
  itemKey,
  value,
  onKeyChange,
  onValueChange,
  onRemove,
  keyPlaceholder,
  valuePlaceholder,
  disabled
}) => (
  <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
    <TextField
      value={itemKey}
      onChange={(e) => onKeyChange(e.target.value)}
      label={keyPlaceholder}
      disabled={disabled}
      size="small"
      sx={{ width: "33%" }}
    />
    <TextField
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
      label={valuePlaceholder}
      disabled={disabled}
      size="small"
      sx={{ flex: 1 }}
    />
    <DeleteItemButton onRemove={onRemove} disabled={disabled} />
  </Box>
);
