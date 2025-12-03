/**
 * Context Menu Component
 * Displays a dropdown context menu at a specified position
 */
import React, { useEffect, useRef, useCallback } from 'react';

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: string;
  disabled?: boolean;
  divider?: boolean;
  onClick?: () => void;
}

interface ContextMenuProps {
  isVisible: boolean;
  position: { x: number; y: number };
  items: ContextMenuItem[];
  onClose: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  isVisible,
  position,
  items,
  onClose
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on click outside
  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
      onClose();
    }
  }, [onClose]);

  // Close on escape key
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  }, [onClose]);

  useEffect(() => {
    if (isVisible) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isVisible, handleClickOutside, handleKeyDown]);

  if (!isVisible || items.length === 0) return null;

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        zIndex: 10000
      }}
    >
      {items.map((item) => {
        if (item.divider) {
          return <div key={item.id} className="context-menu-divider" />;
        }
        return (
          <MenuItemButton
            key={item.id}
            item={item}
            onClose={onClose}
          />
        );
      })}
    </div>
  );
};

/**
 * Individual menu item component
 */
interface MenuItemComponentProps {
  item: ContextMenuItem;
  onClose: () => void;
}

const MenuItemButton: React.FC<MenuItemComponentProps> = ({ item, onClose }) => {
  const handleClick = useCallback(() => {
    if (!item.disabled && item.onClick) {
      item.onClick();
      onClose();
    }
  }, [item, onClose]);

  return (
    <button
      className={`context-menu-item ${item.disabled ? 'disabled' : ''}`}
      onClick={handleClick}
      disabled={item.disabled}
    >
      {item.icon && <i className={item.icon} />}
      <span>{item.label}</span>
    </button>
  );
};
