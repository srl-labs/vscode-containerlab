/**
 * KeyValueList - Dynamic key-value pairs
 */
import React from 'react';

interface KeyValueListProps {
  items: Record<string, string>;
  onChange: (items: Record<string, string>) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  addLabel?: string;
  disabled?: boolean;
}

export const KeyValueList: React.FC<KeyValueListProps> = ({
  items,
  onChange,
  keyPlaceholder = 'Key',
  valuePlaceholder = 'Value',
  addLabel = 'Add',
  disabled
}) => {
  const entries = Object.entries(items);

  const handleAdd = () => {
    const newKey = `key${entries.length + 1}`;
    onChange({ ...items, [newKey]: '' });
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
    <div className="space-y-2">
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
      <button
        type="button"
        className="btn btn-small"
        onClick={handleAdd}
        disabled={disabled}
      >
        <i className="fas fa-plus mr-1"></i>
        {addLabel}
      </button>
    </div>
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
  <div className="flex gap-2">
    <input
      type="text"
      value={itemKey}
      onChange={(e) => onKeyChange(e.target.value)}
      className="input-field w-1/3"
      placeholder={keyPlaceholder}
      disabled={disabled}
    />
    <input
      type="text"
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
      className="input-field flex-1"
      placeholder={valuePlaceholder}
      disabled={disabled}
    />
    <button
      type="button"
      className="dynamic-delete-btn"
      onClick={onRemove}
      aria-label="Remove"
      disabled={disabled}
    >
      <i className="fas fa-trash"></i>
    </button>
  </div>
);
