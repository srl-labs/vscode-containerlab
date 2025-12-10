/**
 * Dropdown menu components for FloatingActionPanel
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';

/**
 * Dropdown menu item interface
 */
export interface DropdownMenuItem {
  id: string;
  label: string;
  icon?: string;
  isDefault?: boolean;
  addDivider?: boolean;
}

/**
 * Hook for dropdown state management
 */
export function useDropdownState(disabled: boolean) {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetState = useCallback(() => {
    setIsOpen(false);
    setFilter('');
    setFocusedIndex(-1);
  }, []);

  const handleMouseEnter = useCallback(() => {
    if (disabled) return;
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setIsOpen(true);
  }, [disabled]);

  const handleMouseLeave = useCallback(() => {
    closeTimeoutRef.current = setTimeout(resetState, 150);
  }, [resetState]);

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    };
  }, []);

  return {
    isOpen, filter, focusedIndex,
    setFilter, setFocusedIndex,
    resetState, handleMouseEnter, handleMouseLeave
  };
}

/**
 * Filter items based on search text
 */
export function filterDropdownItems(items: DropdownMenuItem[], filter: string): DropdownMenuItem[] {
  const search = filter.toLowerCase();
  return items.filter(item => item.label.toLowerCase().includes(search));
}

/**
 * Build CSS class for menu positioning
 */
export function buildMenuClass(isOpen: boolean, drawerSide: 'left' | 'right'): string {
  const classes = ['floating-panel-dropdown-menu'];
  if (isOpen) classes.push('visible');
  classes.push(drawerSide === 'left' ? 'position-left' : 'position-right');
  return classes.join(' ');
}

/**
 * Build CSS class for dropdown item
 */
export function buildItemClass(item: DropdownMenuItem, isFocused: boolean): string {
  const classes = ['floating-panel-dropdown-item'];
  if (item.isDefault) classes.push('default');
  if (isFocused) classes.push('focused');
  return classes.join(' ');
}

/**
 * Dropdown menu item component
 */
interface DropdownItemProps {
  item: DropdownMenuItem;
  index: number;
  focusedIndex: number;
  onSelect: (id: string) => void;
}

export const DropdownItem: React.FC<DropdownItemProps> = ({ item, index, focusedIndex, onSelect }) => (
  <React.Fragment>
    {item.addDivider && index > 0 && <div className="floating-panel-dropdown-divider" />}
    <button
      className={buildItemClass(item, focusedIndex === index)}
      onClick={() => onSelect(item.id)}
    >
      {item.icon && <i className={`fas ${item.icon}`}></i>}
      <span>{item.label}</span>
    </button>
  </React.Fragment>
);

/**
 * Hook for keyboard navigation in dropdown
 */
interface KeyboardNavParams {
  isOpen: boolean;
  itemCount: number;
  focusedIndex: number;
  setFocusedIndex: React.Dispatch<React.SetStateAction<number>>;
  onSelectFocused: () => void;
  onEscape: () => void;
}

export function useDropdownKeyboard(params: KeyboardNavParams) {
  const { isOpen, itemCount, focusedIndex, setFocusedIndex, onSelectFocused, onEscape } = params;

  return useCallback((e: React.KeyboardEvent) => {
    if (!isOpen) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex(prev => Math.min(prev + 1, itemCount - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex(prev => Math.max(prev - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (focusedIndex >= 0 && focusedIndex < itemCount) onSelectFocused();
    } else if (e.key === 'Escape') {
      onEscape();
    }
  }, [isOpen, itemCount, focusedIndex, setFocusedIndex, onSelectFocused, onEscape]);
}

/**
 * Focus input when dropdown opens
 */
export function useFocusOnOpen(isOpen: boolean, inputRef: React.RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, inputRef]);
}

/**
 * Panel Button with Dropdown Component
 */
interface PanelButtonWithDropdownProps {
  icon: string;
  tooltip: string;
  disabled?: boolean;
  drawerSide: 'left' | 'right';
  items: DropdownMenuItem[];
  filterPlaceholder?: string;
  onSelect: (itemId: string) => void;
  onLockedClick?: () => void;
}

export const PanelButtonWithDropdown: React.FC<PanelButtonWithDropdownProps> = ({
  icon,
  tooltip,
  disabled = false,
  drawerSide,
  items,
  filterPlaceholder = 'Filter...',
  onSelect,
  onLockedClick
}) => {
  const {
    isOpen, filter, focusedIndex,
    setFilter, setFocusedIndex,
    resetState, handleMouseEnter, handleMouseLeave
  } = useDropdownState(disabled);

  const containerRef = useRef<HTMLDivElement>(null);
  const filterInputRef = useRef<HTMLInputElement>(null);
  const filteredItems = filterDropdownItems(items, filter);

  const handleSelect = useCallback((itemId: string) => {
    onSelect(itemId);
    resetState();
  }, [onSelect, resetState]);

  const handleKeyDown = useDropdownKeyboard({
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
    }
  }, [disabled, onLockedClick]);

  useFocusOnOpen(isOpen, filterInputRef);

  return (
    <div
      ref={containerRef}
      className="floating-panel-dropdown"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        className={`floating-panel-btn ${disabled ? 'disabled' : ''}`}
        title={tooltip}
        disabled={false}
        onClick={handleButtonClick}
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
            onChange={e => { setFilter(e.target.value); setFocusedIndex(-1); }}
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
            />
          ))}
          {filteredItems.length === 0 && (
            <div className="floating-panel-dropdown-item" style={{ opacity: 0.6, cursor: 'default' }}>
              No matches found
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
