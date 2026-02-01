/**
 * Context Menu Component
 * Displays a dropdown context menu at a specified position
 */
import React, { useEffect, useRef, useCallback } from "react";

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: string;
  iconComponent?: React.ReactNode;
  disabled?: boolean;
  divider?: boolean;
  danger?: boolean;
  onClick?: () => void;
  children?: ContextMenuItem[];
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
  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    },
    [onClose]
  );

  // Close on escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (!isVisible) return;
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isVisible, handleClickOutside, handleKeyDown]);

  if (!isVisible || items.length === 0) return null;

  return (
    <div
      ref={menuRef}
      className="context-menu"
      role="menu"
      data-testid="context-menu"
      style={{
        position: "fixed",
        left: position.x,
        top: position.y,
        zIndex: 10000
      }}
    >
      {items.map((item) => {
        if (item.divider) {
          return <div key={item.id} className="context-menu-divider" />;
        }
        if (item.children && item.children.length > 0) {
          return <MenuItemWithSubmenu key={item.id} item={item} onClose={onClose} />;
        }
        return <MenuItemButton key={item.id} item={item} onClose={onClose} />;
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

function renderMenuIcon(item: ContextMenuItem): React.ReactElement {
  if (item.iconComponent) {
    return <span className="context-menu-icon">{item.iconComponent}</span>;
  }
  if (item.icon) {
    return (
      <span className="context-menu-icon">
        <i className={item.icon} />
      </span>
    );
  }
  return <span className="context-menu-icon-placeholder" />;
}

function getMenuItemClassNames(item: ContextMenuItem, extraClasses: string[] = []) {
  return [
    "context-menu-item",
    item.disabled ? "disabled" : "",
    item.danger ? "danger" : "",
    ...extraClasses
  ]
    .filter(Boolean)
    .join(" ");
}

interface MenuButtonProps {
  item: ContextMenuItem;
  onClick?: () => void;
  showCaret?: boolean;
}

const ContextMenuButton: React.FC<MenuButtonProps> = ({ item, onClick, showCaret = false }) => {
  const classNames = getMenuItemClassNames(item, showCaret ? ["has-submenu"] : []);
  return (
    <button
      className={classNames}
      role="menuitem"
      onClick={onClick}
      disabled={item.disabled}
      data-testid={`context-menu-item-${item.id}`}
    >
      {renderMenuIcon(item)}
      <span>{item.label}</span>
      {showCaret && <span className="context-menu-submenu-caret">▸</span>}
    </button>
  );
};

function useMenuItemClick(item: ContextMenuItem, onClose: () => void) {
  return useCallback(() => {
    if (!item.disabled && item.onClick) {
      item.onClick();
      onClose();
    }
  }, [item, onClose]);
}

const MenuItemButton: React.FC<MenuItemComponentProps> = ({ item, onClose }) => {
  const handleClick = useMenuItemClick(item, onClose);

  return <ContextMenuButton item={item} onClick={handleClick} />;
};

const MenuItemWithSubmenu: React.FC<MenuItemComponentProps> = ({ item, onClose }) => {
  const handleClick = useMenuItemClick(item, onClose);

  const wrapperClassNames = ["context-menu-item-wrapper", item.disabled ? "disabled" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={wrapperClassNames}>
      <ContextMenuButton
        item={item}
        onClick={item.onClick ? handleClick : undefined}
        showCaret
      />
      <div className="context-menu context-submenu" role="menu">
        {item.children?.map((child) => {
          if (child.divider) {
            return <div key={child.id} className="context-menu-divider" />;
          }
          if (child.children && child.children.length > 0) {
            return <MenuItemWithSubmenu key={child.id} item={child} onClose={onClose} />;
          }
          return <MenuItemButton key={child.id} item={child} onClose={onClose} />;
        })}
      </div>
    </div>
  );
};
