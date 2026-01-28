/**
 * Dropdown menu components for FloatingActionPanel
 */
import React, { useRef, useCallback } from "react";

import {
  useDropdownState,
  useFloatingDropdownKeyboard,
  useFocusOnOpen
} from "../../../hooks/ui/useDropdown";

/**
 * Dropdown menu item interface
 */
export interface DropdownMenuItem {
  id: string;
  label: string;
  icon?: string;
  isDefault?: boolean;
  addDivider?: boolean;
  /** For custom node items - enables action buttons */
  isCustomNode?: boolean;
}

/**
 * Filter items based on search text
 */
export function filterDropdownItems(items: DropdownMenuItem[], filter: string): DropdownMenuItem[] {
  const search = filter.toLowerCase();
  return items.filter((item) => item.label.toLowerCase().includes(search));
}

/**
 * Build CSS class for menu positioning
 */
export function buildMenuClass(isOpen: boolean, drawerSide: "left" | "right"): string {
  const classes = ["floating-panel-dropdown-menu"];
  if (isOpen) classes.push("visible");
  classes.push(drawerSide === "left" ? "position-left" : "position-right");
  return classes.join(" ");
}

/**
 * Build CSS class for dropdown item
 */
export function buildItemClass(item: DropdownMenuItem, isFocused: boolean): string {
  const classes = ["floating-panel-dropdown-item"];
  if (item.isDefault) classes.push("default");
  if (isFocused) classes.push("focused");
  return classes.join(" ");
}

/**
 * Custom node action callbacks
 */
export interface CustomNodeActions {
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  onSetDefault?: (id: string) => void;
}

/** Shared button style for action buttons */
const ACTION_BUTTON_STYLE: React.CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  padding: "2px 4px",
  opacity: 0.6
};

/**
 * Custom node action buttons component
 */
interface CustomNodeActionButtonsProps {
  itemId: string;
  isDefault?: boolean;
  actions: CustomNodeActions;
}

const CustomNodeActionButtons: React.FC<CustomNodeActionButtonsProps> = ({
  itemId,
  isDefault,
  actions
}) => {
  const handleEditClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      actions.onEdit?.(itemId);
    },
    [actions, itemId]
  );

  const handleDeleteClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      actions.onDelete?.(itemId);
    },
    [actions, itemId]
  );

  const handleSetDefaultClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!isDefault) {
        actions.onSetDefault?.(itemId);
      }
    },
    [actions, itemId, isDefault]
  );

  return (
    <div className="floating-panel-dropdown-item-actions" style={{ display: "flex", gap: "2px" }}>
      <button
        className={`add-node-default-btn${isDefault ? " is-default" : ""}`}
        title={isDefault ? "Default node" : "Set as default node"}
        onClick={handleSetDefaultClick}
        style={{
          ...ACTION_BUTTON_STYLE,
          cursor: isDefault ? "default" : "pointer",
          opacity: isDefault ? 1 : 0.6
        }}
      >
        {isDefault ? "★" : "☆"}
      </button>
      <button
        className="add-node-edit-btn"
        title="Edit custom node"
        onClick={handleEditClick}
        style={ACTION_BUTTON_STYLE}
      >
        ✎
      </button>
      <button
        className="add-node-delete-btn"
        title="Delete custom node"
        onClick={handleDeleteClick}
        style={ACTION_BUTTON_STYLE}
      >
        ×
      </button>
    </div>
  );
};

/**
 * Dropdown menu item component
 */
interface DropdownItemProps {
  item: DropdownMenuItem;
  index: number;
  focusedIndex: number;
  onSelect: (id: string) => void;
  customNodeActions?: CustomNodeActions;
}

export const DropdownItem: React.FC<DropdownItemProps> = ({
  item,
  index,
  focusedIndex,
  onSelect,
  customNodeActions
}) => (
  <React.Fragment>
    {item.addDivider && index > 0 && <div className="floating-panel-dropdown-divider" />}
    <div
      className={buildItemClass(item, focusedIndex === index)}
      style={{ display: "flex", alignItems: "center", gap: "4px" }}
    >
      <button
        className="floating-panel-dropdown-item-label"
        onClick={() => onSelect(item.id)}
        style={{
          flex: 1,
          textAlign: "left",
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "inherit",
          font: "inherit",
          padding: 0
        }}
      >
        {item.icon && <i className={`fas ${item.icon}`} style={{ marginRight: "6px" }}></i>}
        <span>{item.label}</span>
      </button>
      {item.isCustomNode && customNodeActions && (
        <CustomNodeActionButtons
          itemId={item.id}
          isDefault={item.isDefault}
          actions={customNodeActions}
        />
      )}
    </div>
  </React.Fragment>
);

/**
 * Panel Button with Dropdown Component
 */
interface PanelButtonWithDropdownProps {
  icon: string;
  tooltip: string;
  disabled?: boolean;
  drawerSide: "left" | "right";
  items: DropdownMenuItem[];
  filterPlaceholder?: string;
  onSelect: (itemId: string) => void;
  onLockedClick?: () => void;
  /** Optional actions for custom node items */
  customNodeActions?: CustomNodeActions;
  testId?: string;
  /** If true, clicking button directly adds the default item (hover still shows dropdown) */
  clickAddsDefault?: boolean;
  /** When true, applies active/highlighted styling to indicate the tool is selected */
  active?: boolean;
}

export const PanelButtonWithDropdown: React.FC<PanelButtonWithDropdownProps> = ({
  icon,
  tooltip,
  disabled = false,
  drawerSide,
  items,
  filterPlaceholder = "Filter...",
  onSelect,
  onLockedClick,
  customNodeActions,
  testId,
  clickAddsDefault = false,
  active = false
}) => {
  const {
    isOpen,
    filter,
    focusedIndex,
    setFilter,
    setFocusedIndex,
    resetState,
    handleMouseEnter,
    handleMouseLeave
  } = useDropdownState(disabled);

  const containerRef = useRef<HTMLDivElement>(null);
  const filterInputRef = useRef<HTMLInputElement>(null);
  const filteredItems = filterDropdownItems(items, filter);

  const handleSelect = useCallback(
    (itemId: string) => {
      onSelect(itemId);
      resetState();
    },
    [onSelect, resetState]
  );

  const handleKeyDown = useFloatingDropdownKeyboard({
    isOpen,
    itemCount: filteredItems.length,
    focusedIndex,
    setFocusedIndex,
    onSelectFocused: () => handleSelect(filteredItems[focusedIndex].id),
    onEscape: resetState
  });

  const handleButtonClick = useCallback(() => {
    if (disabled && onLockedClick) {
      onLockedClick();
      return;
    }
    if (clickAddsDefault && !disabled) {
      // Find the default item, or use the first item if no default
      const defaultItem = items.find((item) => item.isDefault) ?? items[0];
      if (defaultItem) {
        onSelect(defaultItem.id);
      }
    }
  }, [disabled, onLockedClick, clickAddsDefault, items, onSelect]);

  useFocusOnOpen(isOpen, filterInputRef);

  return (
    <div
      ref={containerRef}
      className="floating-panel-dropdown"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        className={`floating-panel-btn ${disabled ? "disabled" : ""} ${active ? "active" : ""}`}
        title={tooltip}
        disabled={false}
        onClick={handleButtonClick}
        data-testid={testId}
      >
        <i className={`fas ${icon}`}></i>
      </button>

      <div className={buildMenuClass(isOpen, drawerSide)} onKeyDown={handleKeyDown}>
        <div className="floating-panel-dropdown-filter">
          <input
            ref={filterInputRef}
            type="text"
            placeholder={filterPlaceholder}
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setFocusedIndex(-1);
            }}
          />
        </div>
        <div>
          {filteredItems.map((item, index) => (
            <DropdownItem
              key={item.id}
              item={item}
              index={index}
              focusedIndex={focusedIndex}
              onSelect={handleSelect}
              customNodeActions={customNodeActions}
            />
          ))}
          {filteredItems.length === 0 && (
            <div
              className="floating-panel-dropdown-item"
              style={{ opacity: 0.6, cursor: "default" }}
            >
              No matches found
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
