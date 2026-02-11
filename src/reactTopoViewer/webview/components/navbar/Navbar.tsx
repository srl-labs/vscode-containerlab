/**
 * Navbar Component for React TopoViewer
 * Complete implementation matching legacy features
 */
import React from "react";
import {
  AppBar,
  Divider,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Toolbar,
  Tooltip,
  Typography
} from "@mui/material";
import {
  AccountTree as AccountTreeIcon,
  ExpandMore as ExpandMoreIcon,
  PhotoCameraBack as PhotoCameraBackIcon,
  Check as CheckIcon,
  CleaningServices as CleaningServicesIcon,
  FitScreen as FitScreenIcon,
  GridOn as GridOnIcon,
  Info as InfoIcon,
  Keyboard as KeyboardIcon,
  Label as LabelIcon,
  Lock as LockIcon,
  LockOpen as LockOpenIcon,
  PlayArrow as PlayArrowIcon,
  Redo as RedoIcon,
  Replay as ReplayIcon,
  Search as SearchIcon,
  Settings as SettingsIcon,
  Stop as StopIcon,
  Undo as UndoIcon,
  ViewColumn as ViewColumnIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon
} from "@mui/icons-material";

import type { LinkLabelMode } from "../../stores/topoViewerStore";
import {
  useIsLocked,
  useIsProcessing,
  useLabName,
  useMode,
  useTopoViewerActions
} from "../../stores/topoViewerStore";
import { useDeploymentCommands } from "../../hooks/ui";
import type { LayoutOption } from "../../hooks/ui";

import { ContainerlabLogo } from "./ContainerlabLogo";

const ERROR_MAIN = "error.main";
const SUCCESS_MAIN = "success.main";

export interface NavbarProps {
  onZoomToFit?: () => void;
  layout: LayoutOption;
  onLayoutChange: (layout: LayoutOption) => void;
  onLabSettings?: () => void;
  onToggleSplit?: () => void;
  onFindNode?: (position: { top: number; left: number }) => void;
  onCaptureViewport?: () => void;
  onShowShortcuts?: () => void;
  onShowAbout?: () => void;
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
  onShowGridSettings?: (position: { top: number; left: number }) => void;
  linkLabelMode: LinkLabelMode;
  onLinkLabelModeChange: (mode: LinkLabelMode) => void;
}

// This is a UI composition component with lots of conditional rendering and menu wiring.
/* eslint-disable complexity */
export const Navbar: React.FC<NavbarProps> = ({
  onZoomToFit,
  layout,
  onLayoutChange,
  onLabSettings,
  onToggleSplit,
  onFindNode,
  onCaptureViewport,
  onShowShortcuts,
  onShowAbout,
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

  // Split button menu state for deploy/destroy
  const [deployMenuPosition, setDeployMenuPosition] = React.useState<{ top: number; left: number } | null>(null);
  const deployMenuOpen = Boolean(deployMenuPosition);

  const handleDeployMenuOpen = React.useCallback((event: React.MouseEvent<HTMLElement>) => {
    const appBar = appBarRef.current;
    const button = event.currentTarget;
    if (appBar) {
      const appBarRect = appBar.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();
      setDeployMenuPosition({
        top: appBarRect.bottom,
        left: buttonRect.left + buttonRect.width / 2
      });
    }
  }, []);

  const handleDeployMenuClose = React.useCallback(() => {
    setDeployMenuPosition(null);
  }, []);

  const handleDeploy = React.useCallback(() => {
    setProcessing(true, "deploy");
    deploymentCommands.onDeploy();
  }, [setProcessing, deploymentCommands]);

  const handleDeployCleanup = React.useCallback(() => {
    setDeployMenuPosition(null);
    setProcessing(true, "deploy");
    deploymentCommands.onDeployCleanup();
  }, [setProcessing, deploymentCommands]);

  const handleDestroy = React.useCallback(() => {
    setProcessing(true, "destroy");
    deploymentCommands.onDestroy();
  }, [setProcessing, deploymentCommands]);

  const handleDestroyCleanup = React.useCallback(() => {
    setDeployMenuPosition(null);
    setProcessing(true, "destroy");
    deploymentCommands.onDestroyCleanup();
  }, [setProcessing, deploymentCommands]);

  const handleRedeploy = React.useCallback(() => {
    setDeployMenuPosition(null);
    setProcessing(true, "deploy");
    deploymentCommands.onRedeploy();
  }, [setProcessing, deploymentCommands]);

  const handleRedeployCleanup = React.useCallback(() => {
    setDeployMenuPosition(null);
    setProcessing(true, "deploy");
    deploymentCommands.onRedeployCleanup();
  }, [setProcessing, deploymentCommands]);

  // Primary action depends on mode
  const handlePrimaryAction = React.useCallback(() => {
    if (isViewerMode) {
      handleDestroy();
    } else {
      handleDeploy();
    }
  }, [isViewerMode, handleDestroy, handleDeploy]);

  const [layoutMenuPosition, setLayoutMenuPosition] = React.useState<{ top: number; left: number } | null>(null);
  const layoutMenuOpen = Boolean(layoutMenuPosition);

  const handleLayoutClick = React.useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    const appBar = appBarRef.current;
    const button = event.currentTarget;
    if (appBar) {
      const appBarRect = appBar.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();
      setLayoutMenuPosition({
        top: appBarRect.bottom,
        left: buttonRect.left + buttonRect.width / 2
      });
    }
  }, []);

  const handleLayoutClose = React.useCallback(() => {
    setLayoutMenuPosition(null);
  }, []);

  const handleLayoutSelect = React.useCallback((newLayout: LayoutOption) => {
    onLayoutChange(newLayout);
    setLayoutMenuPosition(null);
  }, [onLayoutChange]);

  return (
    <AppBar ref={appBarRef} position="static" elevation={0} sx={{ borderBottom: 1, borderColor: "divider" }}>
      <Toolbar variant="dense" disableGutters sx={{ minHeight: 40, px: 1, display: "flex", alignItems: "center", gap: 0.5 }}>
        {/* Left: Logo + Title */}
        <IconButton size="small" onClick={onLogoClick}>
          <ContainerlabLogo clickProgress={logoClickProgress} isExploded={isPartyMode} />
        </IconButton>
        <Typography variant="h5" fontWeight={500} ml={0.5} sx={{ lineHeight: 1, flexGrow: 1 }} data-testid="navbar-lab-name">
          {labName || "TopoViewer"}
        </Typography>

        {/* Deploy / Destroy */}
        <Tooltip title={isViewerMode ? "Destroy Lab" : "Deploy Lab"}>
          <IconButton
            size="small"
            onClick={handlePrimaryAction}
            disabled={isProcessing}
            sx={{ color: isViewerMode ? ERROR_MAIN : SUCCESS_MAIN }}
            data-testid="navbar-deploy"
          >
            {isViewerMode ? <StopIcon fontSize="small" /> : <PlayArrowIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
        <IconButton
          size="small"
          onClick={handleDeployMenuOpen}
          disabled={isProcessing}
          aria-controls={deployMenuOpen ? "deploy-split-menu" : undefined}
          aria-haspopup="true"
          aria-expanded={deployMenuOpen ? "true" : undefined}
          sx={{ color: isViewerMode ? ERROR_MAIN : SUCCESS_MAIN, ml: -0.5 }}
          data-testid="navbar-deploy-menu"
        >
          <ExpandMoreIcon fontSize="small" />
        </IconButton>
        <Menu
          id="deploy-split-menu"
          open={deployMenuOpen}
          onClose={handleDeployMenuClose}
          anchorReference="anchorPosition"
          anchorPosition={deployMenuPosition ?? undefined}
          transformOrigin={{ vertical: "top", horizontal: "center" }}
        >
	          {isViewerMode ? [
	            <MenuItem key="destroy" onClick={handleDestroy} data-testid="navbar-deploy-item-destroy">
	              <ListItemIcon><StopIcon fontSize="small" sx={{ color: ERROR_MAIN }} /></ListItemIcon>
	              <ListItemText>Destroy</ListItemText>
	            </MenuItem>,
	            <MenuItem key="destroy-cleanup" onClick={handleDestroyCleanup} data-testid="navbar-deploy-item-destroy-cleanup">
	              <ListItemIcon><CleaningServicesIcon fontSize="small" sx={{ color: ERROR_MAIN }} /></ListItemIcon>
	              <ListItemText>Destroy (cleanup)</ListItemText>
	            </MenuItem>,
	            <Divider key="divider" sx={{ my: 0.5 }} />,
	            <MenuItem key="redeploy" onClick={handleRedeploy} data-testid="navbar-deploy-item-redeploy">
	              <ListItemIcon><ReplayIcon fontSize="small" sx={{ color: SUCCESS_MAIN }} /></ListItemIcon>
	              <ListItemText>Redeploy</ListItemText>
	            </MenuItem>,
	            <MenuItem key="redeploy-cleanup" onClick={handleRedeployCleanup} data-testid="navbar-deploy-item-redeploy-cleanup">
	              <ListItemIcon><CleaningServicesIcon fontSize="small" sx={{ color: SUCCESS_MAIN }} /></ListItemIcon>
	              <ListItemText>Redeploy (cleanup)</ListItemText>
	            </MenuItem>
	          ] : [
	            <MenuItem key="deploy" onClick={() => { handleDeployMenuClose(); handleDeploy(); }} data-testid="navbar-deploy-item-deploy">
	              <ListItemIcon><PlayArrowIcon fontSize="small" sx={{ color: SUCCESS_MAIN }} /></ListItemIcon>
	              <ListItemText>Deploy</ListItemText>
	            </MenuItem>,
	            <MenuItem key="deploy-cleanup" onClick={handleDeployCleanup} data-testid="navbar-deploy-item-deploy-cleanup">
	              <ListItemIcon><CleaningServicesIcon fontSize="small" sx={{ color: SUCCESS_MAIN }} /></ListItemIcon>
	              <ListItemText>Deploy (cleanup)</ListItemText>
	            </MenuItem>
	          ]}
	        </Menu>

        <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />

        {/* Lock / Unlock */}
        <Tooltip title={isLocked ? "Unlock lab to edit" : "Lock Lab"}>
          <IconButton size="small" onClick={toggleLock} disabled={isProcessing} sx={{ color: isLocked ? ERROR_MAIN : "inherit" }} data-testid="navbar-lock">
            {isLocked ? <LockIcon fontSize="small" /> : <LockOpenIcon fontSize="small" />}
          </IconButton>
        </Tooltip>

        {/* Lab Settings */}
        <Tooltip title="Lab Settings">
          <IconButton size="small" onClick={onLabSettings} data-testid="navbar-lab-settings">
            <SettingsIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        {/* Undo - only show in edit mode */}
        {isEditMode && (
          <Tooltip title="Undo (Ctrl+Z)">
            <span>
              <IconButton size="small" onClick={onUndo} disabled={!canUndo} data-testid="navbar-undo">
                <UndoIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        )}

        {/* Redo - only show in edit mode */}
        {isEditMode && (
          <Tooltip title="Redo (Ctrl+Y)">
            <span>
              <IconButton size="small" onClick={onRedo} disabled={!canRedo} data-testid="navbar-redo">
                <RedoIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        )}

        <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />

        {/* Fit to Viewport */}
        <Tooltip title="Fit to Viewport">
          <IconButton size="small" onClick={onZoomToFit} data-testid="navbar-fit-viewport">
            <FitScreenIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        {/* Toggle YAML Split View */}
        <Tooltip title="Toggle YAML Split View">
          <IconButton size="small" onClick={onToggleSplit} data-testid="navbar-split-view">
            <ViewColumnIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        {/* Layout Manager */}
        <Tooltip title="Layout">
          <IconButton size="small" onClick={handleLayoutClick} data-testid="navbar-layout">
            <AccountTreeIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Menu
          open={layoutMenuOpen}
          onClose={handleLayoutClose}
          anchorReference="anchorPosition"
          anchorPosition={layoutMenuPosition ?? undefined}
          transformOrigin={{ vertical: "top", horizontal: "center" }}
        >
          <MenuItem onClick={() => handleLayoutSelect("preset")} data-testid="navbar-layout-preset">
            <ListItemIcon>
              {layout === "preset" && <CheckIcon fontSize="small" />}
            </ListItemIcon>
            <ListItemText>Preset</ListItemText>
          </MenuItem>
          <MenuItem onClick={() => handleLayoutSelect("force")} data-testid="navbar-layout-force">
            <ListItemIcon>
              {layout === "force" && <CheckIcon fontSize="small" />}
            </ListItemIcon>
            <ListItemText>Force</ListItemText>
          </MenuItem>
          <MenuItem onClick={() => handleLayoutSelect("geo")} data-testid="navbar-layout-geo">
            <ListItemIcon>
              {layout === "geo" && <CheckIcon fontSize="small" />}
            </ListItemIcon>
            <ListItemText>Geo</ListItemText>
          </MenuItem>
        </Menu>

        {/* Grid line width */}
        <Tooltip title="Grid Settings">
          <IconButton size="small" onClick={(e) => { const appBar = appBarRef.current; const btn = e.currentTarget; if (appBar) { const ar = appBar.getBoundingClientRect(); const br = btn.getBoundingClientRect(); onShowGridSettings?.({ top: ar.bottom, left: br.left + br.width / 2 }); } }} data-testid="navbar-grid">
            <GridOnIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        {/* Find Node */}
        <Tooltip title="Find Node">
          <IconButton size="small" onClick={(e) => { const appBar = appBarRef.current; const btn = e.currentTarget; if (appBar) { const ar = appBar.getBoundingClientRect(); const br = btn.getBoundingClientRect(); onFindNode?.({ top: ar.bottom, left: br.left + br.width / 2 }); } }} data-testid="navbar-find-node">
            <SearchIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        {/* Link Labels Dropdown */}
        <Tooltip title="Link Labels">
          <IconButton size="small" onClick={handleLinkLabelClick} data-testid="navbar-link-labels">
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
          <MenuItem onClick={() => handleLinkLabelSelect("show-all")} data-testid="navbar-link-label-show-all">
            <ListItemIcon>
              {linkLabelMode === "show-all" && <CheckIcon fontSize="small" />}
            </ListItemIcon>
            <ListItemText>Show All</ListItemText>
          </MenuItem>
          <MenuItem onClick={() => handleLinkLabelSelect("on-select")} data-testid="navbar-link-label-on-select">
            <ListItemIcon>
              {linkLabelMode === "on-select" && <CheckIcon fontSize="small" />}
            </ListItemIcon>
            <ListItemText>On Select</ListItemText>
          </MenuItem>
          <MenuItem onClick={() => handleLinkLabelSelect("hide")} data-testid="navbar-link-label-hide">
            <ListItemIcon>
              {linkLabelMode === "hide" && <CheckIcon fontSize="small" />}
            </ListItemIcon>
            <ListItemText>Hide</ListItemText>
          </MenuItem>
        </Menu>

        {/* Capture Viewport */}
        <Tooltip title="Capture Viewport as SVG">
          <IconButton size="small" onClick={onCaptureViewport} data-testid="navbar-capture">
            <PhotoCameraBackIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />

        {/* Shortcuts */}
        <Tooltip title="Shortcuts">
          <IconButton size="small" onClick={onShowShortcuts} data-testid="navbar-shortcuts">
            <KeyboardIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        {/* Toggle Shortcut Display */}
        <Tooltip title="Toggle Shortcut Display">
          <IconButton size="small" onClick={onToggleShortcutDisplay} data-testid="navbar-shortcut-display">
            {shortcutDisplayEnabled ? <VisibilityIcon fontSize="small" /> : <VisibilityOffIcon fontSize="small" />}
          </IconButton>
        </Tooltip>

        {/* About */}
        <Tooltip title="About TopoViewer">
          <IconButton size="small" onClick={onShowAbout} data-testid="navbar-about">
            <InfoIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Toolbar>
    </AppBar>
  );
};
/* eslint-enable complexity */
