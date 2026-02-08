/**
 * Context Menu Component
 * Displays a dropdown context menu at a specified position
 */
import React, { useCallback } from "react";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Divider from "@mui/material/Divider";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
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
  if (!isVisible || items.length === 0) return null;

  return (
    <Menu
      open={isVisible}
      onClose={onClose}
      anchorReference="anchorPosition"
      anchorPosition={{ top: position.y, left: position.x }}
      data-testid="context-menu"
      slotProps={{
        paper: {
          sx: { minWidth: 180 }
        }
      }}
    >
      {items.map((item) => {
        if (item.divider) {
          return <Divider key={item.id} />;
        }
        if (item.children && item.children.length > 0) {
          return <MenuItemWithSubmenu key={item.id} item={item} onClose={onClose} />;
        }
        return <MenuItemButton key={item.id} item={item} onClose={onClose} />;
      })}
    </Menu>
  );
};

/**
 * Individual menu item component
 */
interface MenuItemComponentProps {
  item: ContextMenuItem;
  onClose: () => void;
}

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

  return (
    <MenuItem
      onClick={handleClick}
      disabled={item.disabled}
      data-testid={`context-menu-item-${item.id}`}
      sx={item.danger ? { color: "error.main" } : undefined}
    >
      {item.icon && <ListItemIcon sx={item.danger ? { color: "error.main" } : undefined}>{item.icon}</ListItemIcon>}
      <ListItemText>{item.label}</ListItemText>
    </MenuItem>
  );
};

const MenuItemWithSubmenu: React.FC<MenuItemComponentProps> = ({ item, onClose }) => {
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const submenuOpen = Boolean(anchorEl);

  const handleMouseEnter = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMouseLeave = () => {
    setAnchorEl(null);
  };

  const handleClick = useCallback(() => {
    if (!item.disabled && item.onClick) {
      item.onClick();
      onClose();
    }
  }, [item, onClose]);

  return (
    <div onMouseLeave={handleMouseLeave}>
      <MenuItem
        onMouseEnter={handleMouseEnter}
        onClick={item.onClick ? handleClick : undefined}
        disabled={item.disabled}
        data-testid={`context-menu-item-${item.id}`}
        sx={{ justifyContent: "space-between" }}
      >
        {item.icon && <ListItemIcon>{item.icon}</ListItemIcon>}
        <ListItemText>{item.label}</ListItemText>
        <ChevronRightIcon fontSize="small" sx={{ ml: 1 }} />
      </MenuItem>
      <Menu
        anchorEl={anchorEl}
        open={submenuOpen}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: "top", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        disablePortal
        slotProps={{
          paper: {
            sx: { minWidth: 150 },
            onMouseLeave: handleMouseLeave
          }
        }}
      >
        {item.children?.map((child) => {
          if (child.divider) {
            return <Divider key={child.id} />;
          }
          if (child.children && child.children.length > 0) {
            return <MenuItemWithSubmenu key={child.id} item={child} onClose={onClose} />;
          }
          return <MenuItemButton key={child.id} item={child} onClose={onClose} />;
        })}
      </Menu>
    </div>
  );
};
