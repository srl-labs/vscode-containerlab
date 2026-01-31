/**
 * Navbar Component for React TopoViewer
 * Complete implementation matching legacy features
 */
import React from "react";

import type { LinkLabelMode } from "../../stores/topoViewerStore";
import {
  useEndpointLabelOffset,
  useIsLocked,
  useIsProcessing,
  useLabName,
  useLinkLabelMode,
  useMode,
  useProcessingMode,
  useShowDummyLinks,
  useTopoViewerActions
} from "../../stores/topoViewerStore";
import {
  DEFAULT_GRID_LINE_WIDTH,
  DEFAULT_GRID_STYLE,
  useDeploymentCommands,
  useDropdown
} from "../../hooks/ui";
import type { GridStyle, LayoutOption } from "../../hooks/ui";
import { saveViewerSettings } from "../../services";
import {
  ENDPOINT_LABEL_OFFSET_MAX,
  ENDPOINT_LABEL_OFFSET_MIN
} from "../../annotations/endpointLabelOffset";

import { ContainerlabLogo } from "./ContainerlabLogo";
import { NavbarLoadingIndicator } from "./NavbarLoadingIndicator";

type ProcessingMode = "deploy" | "destroy";

const DEPLOY_MODE: ProcessingMode = "deploy";
const DESTROY_MODE: ProcessingMode = "destroy";

const DANGER_CLASS = "btn-icon--danger";
const SHAKE_CLASS = "lock-shake";

interface NavbarProps {
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
  /** Easter egg logo click handler and state */
  onLogoClick?: () => void;
  /** Easter egg click progress (0-10) */
  logoClickProgress?: number;
  /** Whether party mode is active (logo has exploded) */
  isPartyMode?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  onZoomToFit,
  onToggleLayout,
  layout,
  onLayoutChange,
  gridLineWidth,
  onGridLineWidthChange,
  gridStyle,
  onGridStyleChange,
  onLabSettings,
  onToggleSplit,
  onFindNode,
  onCaptureViewport,
  onShowShortcuts,
  onShowAbout,
  onOpenNodePalette,
  onLockedAction,
  lockShakeActive = false,
  shortcutDisplayEnabled = false,
  onToggleShortcutDisplay,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  onLogoClick,
  logoClickProgress = 0,
  isPartyMode = false
}) => {
  const mode = useMode();
  const labName = useLabName();
  const isLocked = useIsLocked();
  const isProcessing = useIsProcessing();
  const processingMode = useProcessingMode();

  const { toggleLock } = useTopoViewerActions();

  const isViewerMode = mode === "view";
  const isEditMode = mode === "edit";
  const lockButtonClass = buildLockButtonClass(isLocked, lockShakeActive);

  const handleOpenNodePalette = React.useCallback(() => {
    if (isLocked) {
      onLockedAction?.();
      return;
    }
    onOpenNodePalette?.();
  }, [isLocked, onLockedAction, onOpenNodePalette]);

  return (
    <nav className="navbar" role="navigation" aria-label="main navigation">
      {/* Left: Logo + Title */}
      <div className="navbar-brand">
        <NavbarLogo
          onClick={onLogoClick}
          clickProgress={logoClickProgress}
          isPartyMode={isPartyMode}
        />
        <NavbarTitle mode={mode} labName={labName} />
      </div>

      {/* Center: Buttons */}
      <div className="navbar-buttons">
        {/* Lab Settings */}
        <NavButton
          icon="fa-gear"
          title="Lab Settings"
          onClick={onLabSettings}
          testId="navbar-lab-settings"
        />

        {/* Lock / Unlock */}
        <NavButton
          icon={isLocked ? "fa-lock" : "fa-unlock"}
          title={isLocked ? "Unlock Lab" : "Lock Lab"}
          onClick={toggleLock}
          className={lockButtonClass}
          ariaPressed={isLocked}
          testId="navbar-lock"
        />

        {/* Deploy / Destroy + Options */}
        <DeployControl
          isViewerMode={isViewerMode}
          isProcessing={isProcessing}
          processingMode={processingMode}
        />

        {/* Palette */}
        {isEditMode && (
          <NavButton
            icon="fa-plus"
            title="Open Palette"
            onClick={handleOpenNodePalette}
            testId="navbar-node-palette"
          />
        )}

        {/* Undo - only show in edit mode */}
        {isEditMode && (
          <NavButton
            icon="fa-rotate-left"
            title="Undo (Ctrl+Z)"
            onClick={onUndo}
            disabled={!canUndo}
            testId="navbar-undo"
          />
        )}

        {/* Redo - only show in edit mode */}
        {isEditMode && (
          <NavButton
            icon="fa-rotate-right"
            title="Redo (Ctrl+Y)"
            onClick={onRedo}
            disabled={!canRedo}
            testId="navbar-redo"
          />
        )}

        {/* Fit to Viewport */}
        <NavButton
          icon="fa-expand"
          title="Fit to Viewport"
          onClick={onZoomToFit}
          testId="navbar-fit-viewport"
        />

        {/* Toggle YAML Split View */}
        <NavButton
          icon="fa-columns"
          title="Toggle YAML Split View"
          onClick={onToggleSplit}
          testId="navbar-split-view"
        />

        {/* Layout Manager */}
        <LayoutDropdown
          layout={layout}
          onLayoutChange={onLayoutChange}
          onToggleLayout={onToggleLayout}
        />

        {/* Grid line width */}
        <GridDropdown
          value={gridLineWidth}
          gridStyle={gridStyle}
          onChange={onGridLineWidthChange}
          onGridStyleChange={onGridStyleChange}
        />

        {/* Find Node */}
        <NavButton
          icon="fa-binoculars"
          title="Find Node"
          onClick={onFindNode}
          testId="navbar-find-node"
        />

        {/* Link Labels Dropdown */}
        <LinkLabelDropdown />

        {/* Capture Viewport */}
        <NavButton
          icon="fa-camera"
          title="Capture Viewport as SVG"
          onClick={onCaptureViewport}
          testId="navbar-capture"
        />

        {/* Shortcuts */}
        <NavButton
          icon="fa-keyboard"
          title="Shortcuts"
          onClick={onShowShortcuts}
          testId="navbar-shortcuts"
        />

        {/* Toggle Shortcut Display */}
        <NavButton
          icon={shortcutDisplayEnabled ? "fa-eye" : "fa-eye-slash"}
          title="Toggle Shortcut Display"
          onClick={onToggleShortcutDisplay}
          active={shortcutDisplayEnabled}
          testId="navbar-shortcut-display"
        />

        {/* About */}
        <NavButton
          icon="fa-circle-info"
          title="About TopoViewer"
          onClick={onShowAbout}
          testId="navbar-about"
        />
      </div>

      {/* Loading Indicator - shows during deployment/destroy operations */}
      <NavbarLoadingIndicator isActive={isProcessing} mode={processingMode} />
    </nav>
  );
};

/**
 * Link Label Menu Component
 */
interface LinkLabelMenuProps {
  currentMode: LinkLabelMode;
  showDummyLinks: boolean;
  endpointLabelOffset: number;
  isLocked: boolean;
  onModeChange: (mode: LinkLabelMode) => void;
  onToggleDummyLinks: () => void;
  onEndpointLabelOffsetChange: (value: number) => void;
  onEndpointLabelOffsetCommit: () => void;
}

const LINK_LABEL_MODES: { value: LinkLabelMode; label: string }[] = [
  { value: "show-all", label: "Show Labels" },
  { value: "on-select", label: "Show Link Labels on Select" },
  { value: "hide", label: "No Labels" }
];

function buildLockButtonClass(isLocked: boolean, isShaking: boolean): string {
  return [isLocked ? DANGER_CLASS : "", isShaking ? SHAKE_CLASS : ""]
    .filter(Boolean)
    .join(" ");
}

function buildDeployButtonClass(
  isViewerMode: boolean,
  isProcessing: boolean,
  activeProcessingMode: ProcessingMode
): string {
  return [
    isViewerMode ? DANGER_CLASS : "btn-icon--primary",
    isProcessing ? `processing processing--${activeProcessingMode}` : ""
  ]
    .filter(Boolean)
    .join(" ");
}

const LinkLabelMenu: React.FC<LinkLabelMenuProps> = ({
  currentMode,
  showDummyLinks,
  endpointLabelOffset,
  isLocked,
  onModeChange,
  onToggleDummyLinks,
  onEndpointLabelOffsetChange,
  onEndpointLabelOffsetCommit
}) => {
  const handleEndpointOffsetChange = (evt: React.ChangeEvent<HTMLInputElement>) => {
    const next = parseFloat(evt.target.value);
    onEndpointLabelOffsetChange(Number.isFinite(next) ? next : endpointLabelOffset);
  };

  return (
    <div className="navbar-menu" role="menu">
      {LINK_LABEL_MODES.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          className="navbar-menu-option"
          onClick={() => onModeChange(value)}
          role="menuitemradio"
          aria-checked={currentMode === value}
        >
          <span>{label}</span>
          {currentMode === value && (
            <i className="fa-solid fa-check navbar-menu-option-check" aria-hidden="true"></i>
          )}
        </button>
      ))}
      <hr className="my-1 border-t border-default" />
      <button
        type="button"
        className="navbar-menu-option"
        onClick={onToggleDummyLinks}
        role="menuitemcheckbox"
        aria-checked={showDummyLinks}
      >
        <span>Show Dummy Links</span>
        {showDummyLinks && (
          <i className="fa-solid fa-check navbar-menu-option-check" aria-hidden="true"></i>
        )}
      </button>
      <hr className="my-1 border-t border-default" />
      <div className="px-3 pb-2 pt-1">
        <div className="flex items-center gap-2 mb-2">
          <label className="text-2xs font-semibold text-default uppercase tracking-wide">
            Endpoint offset
          </label>
          <span className="grid-line-display">{endpointLabelOffset.toFixed(0)}</span>
        </div>
        <input
          type="range"
          min={ENDPOINT_LABEL_OFFSET_MIN}
          max={ENDPOINT_LABEL_OFFSET_MAX}
          step="1"
          value={endpointLabelOffset}
          onChange={handleEndpointOffsetChange}
          onMouseUp={onEndpointLabelOffsetCommit}
          onTouchEnd={onEndpointLabelOffsetCommit}
          className="grid-line-slider"
          aria-label="Endpoint label offset"
          disabled={isLocked}
        />
      </div>
    </div>
  );
};

interface LinkLabelDropdownProps {}

const LinkLabelDropdown: React.FC<LinkLabelDropdownProps> = () => {
  const linkLabelMode = useLinkLabelMode();
  const showDummyLinks = useShowDummyLinks();
  const endpointLabelOffset = useEndpointLabelOffset();
  const isLocked = useIsLocked();
  const { setLinkLabelMode, toggleDummyLinks, setEndpointLabelOffset } = useTopoViewerActions();
  const dropdown = useDropdown();

  const saveEndpointLabelOffset = React.useCallback(() => {
    void saveViewerSettings({ endpointLabelOffset });
  }, [endpointLabelOffset]);

  const handleLinkLabelModeChange = (mode: LinkLabelMode) => {
    setLinkLabelMode(mode);
    dropdown.close();
  };

  const handleEndpointLabelOffsetChange = (value: number) => {
    setEndpointLabelOffset(value);
  };

  return (
    <div className="relative inline-block" ref={dropdown.ref}>
      <NavButton
        icon="fa-tag"
        title="Link Labels"
        onClick={dropdown.toggle}
        active={dropdown.isOpen}
        testId="navbar-link-labels"
      />
      {dropdown.isOpen && (
        <LinkLabelMenu
          currentMode={linkLabelMode}
          showDummyLinks={showDummyLinks}
          endpointLabelOffset={endpointLabelOffset}
          isLocked={isLocked}
          onModeChange={handleLinkLabelModeChange}
          onToggleDummyLinks={toggleDummyLinks}
          onEndpointLabelOffsetChange={handleEndpointLabelOffsetChange}
          onEndpointLabelOffsetCommit={saveEndpointLabelOffset}
        />
      )}
    </div>
  );
};

const LAYOUT_OPTIONS: { value: LayoutOption; label: string }[] = [
  { value: "preset", label: "Preset" },
  { value: "force", label: "Force-Directed" },
  { value: "geo", label: "GeoMap" }
];

function getLayoutLabel(option: LayoutOption): string {
  const match = LAYOUT_OPTIONS.find((o) => o.value === option);
  return match ? match.label : option;
}

interface LayoutMenuProps {
  currentLayout: LayoutOption;
  onSelect: (layout: LayoutOption) => void;
}

const LayoutMenu: React.FC<LayoutMenuProps> = ({ currentLayout, onSelect }) => (
  <div className="navbar-menu" role="menu">
    {LAYOUT_OPTIONS.map(({ value, label }) => (
      <button
        key={value}
        type="button"
        className="navbar-menu-option"
        onClick={() => onSelect(value)}
        role="menuitemradio"
        aria-checked={currentLayout === value}
      >
        <span>{label}</span>
        {currentLayout === value && (
          <i className="fa-solid fa-check navbar-menu-option-check" aria-hidden="true"></i>
        )}
      </button>
    ))}
  </div>
);

interface LayoutDropdownProps {
  layout: LayoutOption;
  onLayoutChange: (layout: LayoutOption) => void;
  onToggleLayout?: () => void;
}

const LayoutDropdown: React.FC<LayoutDropdownProps> = ({
  layout,
  onLayoutChange,
  onToggleLayout
}) => {
  const dropdown = useDropdown();
  const handleLayoutSelect = (nextLayout: LayoutOption) => {
    onLayoutChange(nextLayout);
    onToggleLayout?.();
    dropdown.close();
  };

  return (
    <div className="relative inline-block" ref={dropdown.ref}>
      <NavButton
        icon="fa-circle-nodes"
        title={`Layout: ${getLayoutLabel(layout)}`}
        onClick={dropdown.toggle}
        active={dropdown.isOpen}
        testId="navbar-layout"
      />
      {dropdown.isOpen && <LayoutMenu currentLayout={layout} onSelect={handleLayoutSelect} />}
    </div>
  );
};

interface GridSettingsMenuProps {
  value: number;
  gridStyle: GridStyle;
  onChange: (width: number) => void;
  onGridStyleChange: (style: GridStyle) => void;
}

const GRID_STYLE_OPTIONS: { value: GridStyle; label: string }[] = [
  { value: "dotted", label: "Dotted" },
  { value: "quadratic", label: "Quadractic" }
];

const GridSettingsMenu: React.FC<GridSettingsMenuProps> = ({
  value,
  gridStyle,
  onChange,
  onGridStyleChange
}) => {
  const handleChange = (evt: React.ChangeEvent<HTMLInputElement>) => {
    const next = parseFloat(evt.target.value);
    onChange(Number.isFinite(next) ? next : DEFAULT_GRID_LINE_WIDTH);
  };
  const handleReset = () => onChange(DEFAULT_GRID_LINE_WIDTH);
  const handleGridStyleReset = () => onGridStyleChange(DEFAULT_GRID_STYLE);
  return (
    <div className="navbar-menu grid-menu" role="menu">
      <div className="flex items-center gap-2 mb-2">
        <label className="text-2xs font-semibold text-default uppercase tracking-wide">
          Grid style
        </label>
      </div>
      {GRID_STYLE_OPTIONS.map(({ value: styleValue, label }) => (
        <button
          key={styleValue}
          type="button"
          className="navbar-menu-option"
          onClick={() => onGridStyleChange(styleValue)}
          role="menuitemradio"
          aria-checked={gridStyle === styleValue}
        >
          <span>{label}</span>
          {gridStyle === styleValue && (
            <i className="fa-solid fa-check navbar-menu-option-check" aria-hidden="true"></i>
          )}
        </button>
      ))}
      <button
        type="button"
        className="navbar-menu-option grid-reset-button mt-2"
        onClick={handleGridStyleReset}
      >
        Reset to {DEFAULT_GRID_STYLE}
      </button>
      <hr className="my-1 border-t border-default" />
      <div className="flex items-center gap-2 mb-2">
        <label className="text-2xs font-semibold text-default uppercase tracking-wide">
          Grid line width
        </label>
        <span className="grid-line-display">{value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min="0.00001"
        max="2"
        step="0.05"
        value={value}
        onChange={handleChange}
        className="grid-line-slider"
        aria-label="Grid line width"
      />
      <button
        type="button"
        className="navbar-menu-option grid-reset-button mt-2"
        onClick={handleReset}
      >
        Reset to {DEFAULT_GRID_LINE_WIDTH}
      </button>
    </div>
  );
};

interface GridDropdownProps {
  value: number;
  gridStyle: GridStyle;
  onChange: (width: number) => void;
  onGridStyleChange: (style: GridStyle) => void;
}

const GridDropdown: React.FC<GridDropdownProps> = ({
  value,
  gridStyle,
  onChange,
  onGridStyleChange
}) => {
  const dropdown = useDropdown();
  return (
    <div className="relative inline-block" ref={dropdown.ref}>
      <NavButton
        icon="fa-border-all"
        title="Grid settings"
        onClick={dropdown.toggle}
        active={dropdown.isOpen}
        testId="navbar-grid"
      />
      {dropdown.isOpen && (
        <GridSettingsMenu
          value={value}
          gridStyle={gridStyle}
          onChange={onChange}
          onGridStyleChange={onGridStyleChange}
        />
      )}
    </div>
  );
};

interface DeploymentMenuProps {
  isViewerMode: boolean;
  isProcessing: boolean;
  onDeployCleanup: () => void;
  onDestroyCleanup: () => void;
  onRedeploy: () => void;
  onRedeployCleanup: () => void;
}

const DeploymentMenu: React.FC<DeploymentMenuProps> = ({
  isViewerMode,
  isProcessing,
  onDeployCleanup,
  onDestroyCleanup,
  onRedeploy,
  onRedeployCleanup
}) => {
  const items = isViewerMode
    ? [
        { label: "Destroy (cleanup)", icon: "fa-broom", onClick: onDestroyCleanup, danger: true },
        { label: "Redeploy", icon: "fa-redo", onClick: onRedeploy, danger: false },
        {
          label: "Redeploy (cleanup)",
          icon: "fa-redo",
          onClick: onRedeployCleanup,
          danger: true
        }
      ]
    : [
        { label: "Deploy (cleanup)", icon: "fa-broom", onClick: onDeployCleanup, danger: true }
      ];

  return (
    <div className="navbar-deploy-menu" role="menu">
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          className={`btn-icon ${item.danger ? DANGER_CLASS : ""}`}
          onClick={item.onClick}
          disabled={isProcessing}
          title={item.label}
          aria-label={item.label}
        >
          <i className={`fas ${item.icon}`} aria-hidden="true"></i>
        </button>
      ))}
    </div>
  );
};

interface DeployControlProps {
  isViewerMode: boolean;
  isProcessing: boolean;
  processingMode: ProcessingMode | null;
}

const DeployControl: React.FC<DeployControlProps> = ({
  isViewerMode,
  isProcessing,
  processingMode
}) => {
  const { setProcessing } = useTopoViewerActions();
  const deploymentCommands = useDeploymentCommands();
  const activeProcessingMode = processingMode ?? (isViewerMode ? DESTROY_MODE : DEPLOY_MODE);
  const deployButtonClass = buildDeployButtonClass(
    isViewerMode,
    isProcessing,
    activeProcessingMode
  );

  const handleDeployClick = React.useCallback(() => {
    const nextMode = isViewerMode ? DESTROY_MODE : DEPLOY_MODE;
    setProcessing(true, nextMode);
    if (isViewerMode) {
      deploymentCommands.onDestroy();
    } else {
      deploymentCommands.onDeploy();
    }
  }, [deploymentCommands, isViewerMode, setProcessing]);

  const handleDeployCleanup = React.useCallback(() => {
    setProcessing(true, DEPLOY_MODE);
    deploymentCommands.onDeployCleanup();
  }, [deploymentCommands, setProcessing]);

  const handleDestroyCleanup = React.useCallback(() => {
    setProcessing(true, DESTROY_MODE);
    deploymentCommands.onDestroyCleanup();
  }, [deploymentCommands, setProcessing]);

  const handleRedeploy = React.useCallback(() => {
    setProcessing(true, DEPLOY_MODE);
    deploymentCommands.onRedeploy();
  }, [deploymentCommands, setProcessing]);

  const handleRedeployCleanup = React.useCallback(() => {
    setProcessing(true, DEPLOY_MODE);
    deploymentCommands.onRedeployCleanup();
  }, [deploymentCommands, setProcessing]);

  return (
    <div className="navbar-deploy relative inline-flex items-center">
      <NavButton
        icon={isViewerMode ? "fa-stop" : "fa-play"}
        title={isViewerMode ? "Destroy Lab" : "Deploy Lab"}
        onClick={handleDeployClick}
        disabled={isProcessing}
        className={deployButtonClass}
        testId="navbar-deploy"
      />
      <DeploymentMenu
        isViewerMode={isViewerMode}
        isProcessing={isProcessing}
        onDeployCleanup={handleDeployCleanup}
        onDestroyCleanup={handleDestroyCleanup}
        onRedeploy={handleRedeploy}
        onRedeployCleanup={handleRedeployCleanup}
      />
    </div>
  );
};

/**
 * Navbar Button Component
 */
interface NavButtonProps {
  icon: string;
  title: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  testId?: string;
  className?: string;
  ariaPressed?: boolean;
}

const NavButton: React.FC<NavButtonProps> = ({
  icon,
  title,
  onClick,
  active,
  disabled,
  testId,
  className,
  ariaPressed
}) => {
  const classes = [
    "btn-icon",
    active ? "active" : "",
    disabled ? "opacity-50 cursor-not-allowed" : "",
    className ?? ""
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      className={classes}
      title={title}
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      aria-pressed={ariaPressed}
    >
      <span className="inline-flex items-center justify-center text-xl">
        <i className={`fas ${icon}`}></i>
      </span>
    </button>
  );
};

/**
 * Logo section with easter egg click handling
 */
interface NavbarLogoProps {
  onClick?: () => void;
  clickProgress?: number;
  isPartyMode?: boolean;
}

const NavbarLogo: React.FC<NavbarLogoProps> = ({
  onClick,
  clickProgress = 0,
  isPartyMode = false
}) => (
  <button
    type="button"
    onClick={onClick}
    className="navbar-logo-button flex items-center bg-transparent border-none cursor-pointer p-0"
    aria-label="Containerlab logo"
  >
    <ContainerlabLogo
      className="navbar-logo"
      clickProgress={clickProgress}
      isExploded={isPartyMode}
    />
  </button>
);

/**
 * Navbar title section showing mode and lab name
 */
interface NavbarTitleProps {
  mode: "view" | "edit";
  labName: string | null;
}

const NavbarTitle: React.FC<NavbarTitleProps> = ({ mode, labName }) => {
  const modeClass = mode === "view" ? "viewer" : "editor";
  const modeLabel = mode === "view" ? "viewer" : "editor";
  const displayName = labName || "Unknown Lab";

  return (
    <div className="navbar-title pl-0">
      <span className="navbar-title-main">TopoViewer</span>
      <span className="navbar-title-sub">
        <span className={`mode-badge ${modeClass}`}>{modeLabel}</span>
        <span className="font-light">· {displayName}</span>
      </span>
    </div>
  );
};
