/**
 * Navbar Component for React TopoViewer
 * Complete implementation matching legacy features
 */
import React from "react";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Divider from "@mui/material/Divider";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import CheckIcon from "@mui/icons-material/Check";

import SettingsIcon from "@mui/icons-material/Settings";
import LockIcon from "@mui/icons-material/Lock";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import StopIcon from "@mui/icons-material/Stop";
import AddIcon from "@mui/icons-material/Add";
import UndoIcon from "@mui/icons-material/Undo";
import RedoIcon from "@mui/icons-material/Redo";
import FitScreenIcon from "@mui/icons-material/FitScreen";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import ViewColumnIcon from "@mui/icons-material/ViewColumn";
import GridOnIcon from "@mui/icons-material/GridOn";
import SearchIcon from "@mui/icons-material/Search";
import LabelIcon from "@mui/icons-material/Label";
import CameraAltIcon from "@mui/icons-material/CameraAlt";
import KeyboardIcon from "@mui/icons-material/Keyboard";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import InfoIcon from "@mui/icons-material/Info";

import type { LinkLabelMode } from "../../stores/topoViewerStore";

import {
  useIsLocked,
  useIsProcessing,
  useLabName,
  useMode,
  useTopoViewerActions
} from "../../stores/topoViewerStore";
import { useDeploymentCommands } from "../../hooks/ui";
import type { GridStyle, LayoutOption } from "../../hooks/ui";

import { ContainerlabLogo } from "./ContainerlabLogo";

export interface NavbarProps {
  onZoomToFit?: () => void;
  onToggleLayout?: () => void;
  layout: LayoutOption;
  onLayoutChange: (layout: LayoutOption) => void;
  gridLineWidth: number;
  onGridLineWidthChange: (width: number) => void;
  gridStyle: GridStyle;
  onGridStyleChange: (style: GridStyle) => void;
  onLabSettings?: () => void;
  onToggleSplit?: () => void;
  onFindNode?: () => void;
  onCaptureViewport?: () => void;
  onShowShortcuts?: () => void;
  onShowAbout?: () => void;
  onOpenNodePalette?: () => void;
  onLockedAction?: () => void;
  lockShakeActive?: boolean;
  /** Toggle shortcut display props */
  shortcutDisplayEnabled?: boolean;
  onToggleShortcutDisplay?: () => void;
  /** Undo/Redo props */
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  /** Easter egg click progress (0-10) */
  logoClickProgress?: number;
  /** Whether party mode is active (logo has exploded) */
  isPartyMode?: boolean;
  /** Easter egg logo click handler and state */
  onLogoClick?: () => void;
  onShowGridSettings?: () => void;
  linkLabelMode: LinkLabelMode;
  onLinkLabelModeChange: (mode: LinkLabelMode) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onZoomToFit,
  onToggleLayout: _onToggleLayout,
  layout,
  onLayoutChange,
  gridLineWidth: _gridLineWidth,
  onGridLineWidthChange: _onGridLineWidthChange,
  gridStyle: _gridStyle,
  onGridStyleChange: _onGridStyleChange,
  onLabSettings,
  onToggleSplit,
  onFindNode,
  onCaptureViewport,
  onShowShortcuts,
  onShowAbout,
  onOpenNodePalette,
  onLockedAction: _onLockedAction,
  lockShakeActive: _lockShakeActive = false,
  shortcutDisplayEnabled = false,
  onToggleShortcutDisplay,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  onLogoClick,
  logoClickProgress = 0,
  isPartyMode = false,
  onShowGridSettings,
  linkLabelMode,
  onLinkLabelModeChange
}) => {
  const mode = useMode();
  const labName = useLabName();
  const isLocked = useIsLocked();
  const isProcessing = useIsProcessing();
  const { toggleLock, setProcessing } = useTopoViewerActions();
  const deploymentCommands = useDeploymentCommands();

  const isEditMode = mode === "edit" && !isProcessing;
  const isViewerMode = mode === "view";

  const appBarRef = React.useRef<HTMLDivElement>(null);
  const [linkLabelMenuPosition, setLinkLabelMenuPosition] = React.useState<{ top: number; left: number } | null>(null);
  const linkLabelMenuOpen = Boolean(linkLabelMenuPosition);

  const handleLinkLabelClick = React.useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    const appBar = appBarRef.current;
    const button = event.currentTarget;
    if (appBar) {
      const appBarRect = appBar.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();
      setLinkLabelMenuPosition({
        top: appBarRect.bottom,
        left: buttonRect.left + buttonRect.width / 2
      });
    }
  }, []);

  const handleLinkLabelClose = React.useCallback(() => {
    setLinkLabelMenuPosition(null);
  }, []);

  const handleLinkLabelSelect = React.useCallback((newMode: LinkLabelMode) => {
    onLinkLabelModeChange(newMode);
    setLinkLabelMenuPosition(null);
  }, [onLinkLabelModeChange]);

  const handleDeploy = React.useCallback(() => {
    if (isViewerMode) {
      setProcessing(true, "destroy");
      deploymentCommands.onDestroy();
    } else {
      setProcessing(true, "deploy");
      deploymentCommands.onDeploy();
    }
  }, [isViewerMode, setProcessing, deploymentCommands]);

  const handleLayoutToggle = React.useCallback(() => {
    const layouts: LayoutOption[] = ["preset", "force", "geo"];
    const currentIndex = layouts.indexOf(layout);
    const nextIndex = (currentIndex + 1) % layouts.length;
    onLayoutChange(layouts[nextIndex]);
  }, [layout, onLayoutChange]);

  return (
    <AppBar ref={appBarRef} position="static" elevation={0} sx={{ bgcolor: "var(--vscode-editor-background)" }}>
      <Toolbar variant="dense" disableGutters sx={{ minHeight: 40, px: 1, display: "flex", alignItems: "center", gap: 0.5 }}>
        {/* Left: Logo + Title */}
        <IconButton size="small" onClick={onLogoClick}>
          <ContainerlabLogo clickProgress={logoClickProgress} isExploded={isPartyMode} />
        </IconButton>
        <Typography variant="h5" fontWeight={500} ml={0.5} sx={{ lineHeight: 1, flexGrow: 1 }}>
          {labName || "TopoViewer"}
        </Typography>

        {/* Lab Settings */}
        <Tooltip title="Lab Settings">
          <IconButton size="small" onClick={onLabSettings}>
            <SettingsIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        {/* Lock / Unlock */}
        <Tooltip title={isLocked ? "Unlock Lab" : "Lock Lab"}>
          <IconButton size="small" onClick={toggleLock} disabled={isProcessing}>
            {isLocked ? <LockIcon fontSize="small" /> : <LockOpenIcon fontSize="small" />}
          </IconButton>
        </Tooltip>

        {/* Deploy / Destroy + Options */}
        <Tooltip title={isViewerMode ? "Destroy Lab" : "Deploy Lab"}>
          <IconButton
            size="small"
            onClick={handleDeploy}
            disabled={isProcessing}
            sx={{ color: isViewerMode ? "error.main" : "success.main" }}
          >
            {isViewerMode ? <StopIcon fontSize="small" /> : <PlayArrowIcon fontSize="small" />}
          </IconButton>
        </Tooltip>

        {/* Palette */}
        {isEditMode && (
          <Tooltip title="Open Palette">
            <IconButton size="small" onClick={onOpenNodePalette}>
              <AddIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}

        {/* Undo - only show in edit mode */}
        {isEditMode && (
          <Tooltip title="Undo (Ctrl+Z)">
            <span>
              <IconButton size="small" onClick={onUndo} disabled={!canUndo}>
                <UndoIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        )}

        {/* Redo - only show in edit mode */}
        {isEditMode && (
          <Tooltip title="Redo (Ctrl+Y)">
            <span>
              <IconButton size="small" onClick={onRedo} disabled={!canRedo}>
                <RedoIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        )}

        <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />

        {/* Fit to Viewport */}
        <Tooltip title="Fit to Viewport">
          <IconButton size="small" onClick={onZoomToFit}>
            <FitScreenIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        {/* Toggle YAML Split View */}
        <Tooltip title="Toggle YAML Split View">
          <IconButton size="small" onClick={onToggleSplit}>
            <ViewColumnIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        {/* Layout Manager */}
        <Tooltip title={`Layout: ${layout}`}>
          <IconButton size="small" onClick={handleLayoutToggle}>
            <AccountTreeIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        {/* Grid line width */}
        <Tooltip title="Grid Settings">
          <IconButton size="small" onClick={onShowGridSettings}>
            <GridOnIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        {/* Find Node */}
        <Tooltip title="Find Node">
          <IconButton size="small" onClick={onFindNode}>
            <SearchIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        {/* Link Labels Dropdown */}
        <Tooltip title="Link Labels">
          <IconButton size="small" onClick={handleLinkLabelClick}>
            <LabelIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Menu
          open={linkLabelMenuOpen}
          onClose={handleLinkLabelClose}
          anchorReference="anchorPosition"
          anchorPosition={linkLabelMenuPosition ?? undefined}
          transformOrigin={{ vertical: "top", horizontal: "center" }}
        >
          <MenuItem onClick={() => handleLinkLabelSelect("show-all")}>
            <ListItemIcon>
              {linkLabelMode === "show-all" && <CheckIcon fontSize="small" />}
            </ListItemIcon>
            <ListItemText>Show All</ListItemText>
          </MenuItem>
          <MenuItem onClick={() => handleLinkLabelSelect("on-select")}>
            <ListItemIcon>
              {linkLabelMode === "on-select" && <CheckIcon fontSize="small" />}
            </ListItemIcon>
            <ListItemText>On Select</ListItemText>
          </MenuItem>
          <MenuItem onClick={() => handleLinkLabelSelect("hide")}>
            <ListItemIcon>
              {linkLabelMode === "hide" && <CheckIcon fontSize="small" />}
            </ListItemIcon>
            <ListItemText>Hide</ListItemText>
          </MenuItem>
        </Menu>

        {/* Capture Viewport */}
        <Tooltip title="Capture Viewport as SVG">
          <IconButton size="small" onClick={onCaptureViewport}>
            <CameraAltIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />

        {/* Shortcuts */}
        <Tooltip title="Shortcuts">
          <IconButton size="small" onClick={onShowShortcuts}>
            <KeyboardIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        {/* Toggle Shortcut Display */}
        <Tooltip title="Toggle Shortcut Display">
          <IconButton size="small" onClick={onToggleShortcutDisplay}>
            {shortcutDisplayEnabled ? <VisibilityIcon fontSize="small" /> : <VisibilityOffIcon fontSize="small" />}
          </IconButton>
        </Tooltip>

        {/* About */}
        <Tooltip title="About TopoViewer">
          <IconButton size="small" onClick={onShowAbout}>
            <InfoIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Toolbar>
    </AppBar>
  );
};