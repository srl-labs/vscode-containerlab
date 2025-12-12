/**
 * Context Menu Component
 * Displays a dropdown context menu at a specified position
 */
import React, { useEffect, useRef, useCallback, useState } from 'react';

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

// Context menu container styles
const menuStyles: React.CSSProperties = {
  minWidth: '160px',
  padding: '4px 0',
  backgroundColor: 'var(--vscode-menu-background, #252526)',
  border: '1px solid var(--vscode-menu-border, #454545)',
  borderRadius: '4px',
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
  overflow: 'hidden'
};

// Menu item button styles
const menuItemStyles: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  width: '100%',
  padding: '6px 16px',
  border: 'none',
  background: 'transparent',
  color: 'var(--vscode-menu-foreground, #cccccc)',
  fontSize: '13px',
  textAlign: 'left',
  cursor: 'pointer',
  gap: '8px'
};

const menuItemHoverStyles: React.CSSProperties = {
  backgroundColor: 'var(--vscode-menu-selectionBackground, #094771)'
};

const menuItemDisabledStyles: React.CSSProperties = {
  opacity: 0.5,
  cursor: 'default'
};

// Divider styles
const dividerStyles: React.CSSProperties = {
  height: '1px',
  margin: '4px 8px',
  backgroundColor: 'var(--vscode-menu-separatorBackground, #454545)'
};

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
      style={{
        ...menuStyles,
        position: 'fixed',
        left: position.x,
        top: position.y,
        zIndex: 10000
      }}
    >
      {items.map((item) => {
        if (item.divider) {
          return <div key={item.id} style={dividerStyles} />;
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
  const [isHovered, setIsHovered] = useState(false);

  const handleClick = useCallback(() => {
    if (!item.disabled && item.onClick) {
      item.onClick();
      onClose();
    }
  }, [item, onClose]);

  const style: React.CSSProperties = {
    ...menuItemStyles,
    ...(isHovered && !item.disabled ? menuItemHoverStyles : {}),
    ...(item.disabled ? menuItemDisabledStyles : {})
  };

  return (
    <button
      style={style}
      onClick={handleClick}
      disabled={item.disabled}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {item.icon && <i className={item.icon} />}
      <span>{item.label}</span>
    </button>
  );
};
