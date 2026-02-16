// Context menu dropdown at a given position.
import React, { useCallback } from "react";
import Box from "@mui/material/Box";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Divider from "@mui/material/Divider";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
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
  onBackdropContextMenu?: (event: React.MouseEvent) => void;
  compact?: boolean;
  openSubmenuOnHover?: boolean;
  openToLeft?: boolean;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  isVisible,
  position,
  items,
  onClose,
  onBackdropContextMenu,
  compact = false,
  openSubmenuOnHover = true,
  openToLeft = false
}) => {
  const handleBackdropContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (onBackdropContextMenu) {
        onBackdropContextMenu(e);
      } else {
        onClose();
      }
    },
    [onClose, onBackdropContextMenu]
  );

  const suppressNativeMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      onClose();
    },
    [onClose]
  );

  if (!isVisible || items.length === 0) return null;

  return (
    <Menu
      open={isVisible}
      onClose={onClose}
      anchorReference="anchorPosition"
      anchorPosition={{ top: position.y, left: position.x }}
      transformOrigin={{
        vertical: "top",
        horizontal: openToLeft ? "right" : "left"
      }}
      data-testid="context-menu"
      slotProps={{
        backdrop: {
          invisible: true,
          onContextMenu: handleBackdropContextMenu
        },
        paper: {
          sx: compact
            ? {
                minWidth: 150,
                maxWidth: 248,
                "& .MuiDivider-root": { my: 0.1 }
              }
            : { minWidth: 180 },
          onContextMenu: suppressNativeMenu
        }
      }}
    >
      {items.map((item) => {
        if (item.divider) {
          return <Divider key={item.id} />;
        }
        if (item.children && item.children.length > 0) {
          return (
            <MenuItemWithSubmenu
              key={item.id}
              item={item}
              onClose={onClose}
              compact={compact}
              openSubmenuOnHover={openSubmenuOnHover}
              openToLeft={openToLeft}
            />
          );
        }
        return (
          <MenuItemButton
            key={item.id}
            item={item}
            onClose={onClose}
            compact={compact}
            openToLeft={openToLeft}
          />
        );
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
  compact?: boolean;
  openSubmenuOnHover?: boolean;
  openToLeft?: boolean;
}

function submenuGutterSx(compact: boolean) {
  return {
    width: compact ? 14 : 16,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flex: "0 0 auto",
    mr: compact ? 0.35 : 0.8
  };
}

function useMenuItemClick(item: ContextMenuItem, onClose: () => void) {
  return useCallback(() => {
    if (!item.disabled && item.onClick) {
      item.onClick();
      onClose();
    }
  }, [item, onClose]);
}

const MenuItemButton: React.FC<MenuItemComponentProps> = ({
  item,
  onClose,
  compact = false,
  openToLeft = false
}) => {
  const handleClick = useMenuItemClick(item, onClose);

  return (
    <MenuItem
      onClick={handleClick}
      disabled={item.disabled}
      dense={compact}
      data-testid={`context-menu-item-${item.id}`}
      sx={{
        ...(compact ? { minHeight: 28, py: 0.2, px: 0.85 } : {}),
        ...(item.danger ? { color: "error.main" } : {})
      }}
    >
      {openToLeft && <Box sx={submenuGutterSx(compact)} />}
      {item.icon && (
        <ListItemIcon
          sx={{
            ...(compact ? { minWidth: 22 } : {}),
            ...(item.danger ? { color: "error.main" } : {})
          }}
        >
          {item.icon}
        </ListItemIcon>
      )}
      <ListItemText
        slotProps={
          compact
            ? {
                primary: {
                  noWrap: true,
                  sx: {
                    fontSize: 12.5,
                    lineHeight: 1.25
                  }
                }
              }
            : undefined
        }
      >
        {item.label}
      </ListItemText>
    </MenuItem>
  );
};

const MenuItemWithSubmenu: React.FC<MenuItemComponentProps> = ({
  item,
  onClose,
  compact = false,
  openSubmenuOnHover = true,
  openToLeft = false
}) => {
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const submenuOpen = Boolean(anchorEl);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => setAnchorEl(null), 100);
  }, [cancelClose]);

  React.useEffect(() => () => cancelClose(), [cancelClose]);

  const handleMouseEnter = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      if (!openSubmenuOnHover) {
        return;
      }
      cancelClose();
      setAnchorEl(event.currentTarget);
    },
    [cancelClose, openSubmenuOnHover]
  );

  const handleClick = useCallback(() => {
    if (!item.disabled && item.onClick) {
      item.onClick();
      onClose();
    }
  }, [item, onClose]);

  const handleOpenSubmenuByClick = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      if (openSubmenuOnHover || item.disabled || item.onClick) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      cancelClose();
      setAnchorEl((current) => (current ? null : event.currentTarget));
    },
    [cancelClose, item.disabled, item.onClick, openSubmenuOnHover]
  );

  return (
    <>
      <MenuItem
        onMouseEnter={handleMouseEnter}
        onMouseLeave={scheduleClose}
        onClick={item.onClick ? handleClick : handleOpenSubmenuByClick}
        disabled={item.disabled}
        dense={compact}
        data-testid={`context-menu-item-${item.id}`}
        sx={{
          justifyContent: openToLeft ? "flex-start" : "space-between",
          ...(compact ? { minHeight: 28, py: 0.2, px: 0.85 } : {})
        }}
      >
        {openToLeft && (
          <Box sx={submenuGutterSx(compact)}>
            <ChevronLeftIcon fontSize="small" />
          </Box>
        )}
        {item.icon && <ListItemIcon sx={compact ? { minWidth: 22 } : undefined}>{item.icon}</ListItemIcon>}
        <ListItemText
          slotProps={
            compact
              ? {
                  primary: {
                    noWrap: true,
                    sx: {
                      fontSize: 12.5,
                      lineHeight: 1.25
                    }
                  }
                }
              : undefined
          }
        >
          {item.label}
        </ListItemText>
        {!openToLeft && <ChevronRightIcon fontSize="small" sx={{ ml: compact ? 0.45 : 1 }} />}
      </MenuItem>
      <Menu
        anchorEl={anchorEl}
        open={submenuOpen}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{
          vertical: "top",
          horizontal: openToLeft ? "left" : "right"
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: openToLeft ? "right" : "left"
        }}
        autoFocus={false}
        hideBackdrop
        sx={{ pointerEvents: "none" }}
        slotProps={{
          paper: {
            sx: compact
              ? {
                  minWidth: 150,
                  maxWidth: 240,
                  pointerEvents: "auto",
                  "& .MuiDivider-root": { my: 0.1 }
                }
              : { minWidth: 150, pointerEvents: "auto" },
            onMouseEnter: cancelClose,
            onMouseLeave: scheduleClose
          }
        }}
      >
        {item.children?.map((child) => {
          if (child.divider) {
            return <Divider key={child.id} />;
          }
          if (child.children && child.children.length > 0) {
            return (
              <MenuItemWithSubmenu
                key={child.id}
                item={child}
                onClose={onClose}
                compact={compact}
                openSubmenuOnHover={openSubmenuOnHover}
                openToLeft={openToLeft}
              />
            );
          }
          return (
            <MenuItemButton
              key={child.id}
              item={child}
              onClose={onClose}
              compact={compact}
              openToLeft={openToLeft}
            />
          );
        })}
      </Menu>
    </>
  );
};
