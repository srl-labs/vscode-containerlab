/**
 * DynamicList - Array of string inputs with add/remove
 */
import React from 'react';

import { AddItemButton, DeleteItemButton } from './ListButtons';

interface DynamicListProps {
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
  addLabel?: string;
  disabled?: boolean;
}

export const DynamicList: React.FC<DynamicListProps> = ({
  items,
  onChange,
  placeholder,
  addLabel = 'Add',
  disabled
}) => {
  const handleAdd = () => {
    onChange([...items, '']);
  };

  const handleRemove = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };

  const handleChange = (index: number, value: string) => {
    const newItems = [...items];
    newItems[index] = value;
    onChange(newItems);
  };

  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <DynamicListItem
          key={index}
          value={item}
          onChange={(value) => handleChange(index, value)}
          onRemove={() => handleRemove(index)}
          placeholder={placeholder}
          disabled={disabled}
        />
      ))}
      <AddItemButton onAdd={handleAdd} label={addLabel} disabled={disabled} />
    </div>
  );
};

/**
 * Single list item with input and delete button
 */
interface DynamicListItemProps {
  value: string;
  onChange: (value: string) => void;
  onRemove: () => void;
  placeholder?: string;
  disabled?: boolean;
}

const DynamicListItem: React.FC<DynamicListItemProps> = ({
  value,
  onChange,
  onRemove,
  placeholder,
  disabled
}) => (
  <div className="flex gap-2">
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="input-field flex-1"
      placeholder={placeholder}
      disabled={disabled}
    />
    <DeleteItemButton onRemove={onRemove} disabled={disabled} />
  </div>
);
