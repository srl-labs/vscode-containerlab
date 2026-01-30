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
import { DEFAULT_GRID_LINE_WIDTH, useDropdown } from "../../hooks/ui";
import type { LayoutOption } from "../../hooks/ui";
import { saveViewerSettings } from "../../services";
import {
  ENDPOINT_LABEL_OFFSET_MAX,
  ENDPOINT_LABEL_OFFSET_MIN
} from "../../annotations/endpointLabelOffset";

import { ContainerlabLogo } from "./ContainerlabLogo";
import { NavbarLoadingIndicator } from "./NavbarLoadingIndicator";

interface NavbarProps {
  onZoomToFit?: () => void;
  onToggleLayout?: () => void;
  layout: LayoutOption;
  onLayoutChange: (layout: LayoutOption) => void;
  gridLineWidth: number;
  onGridLineWidthChange: (width: number) => void;
  onLabSettings?: () => void;
  onToggleSplit?: () => void;
  onFindNode?: () => void;
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
  isPartyMode = false
}) => {
  const mode = useMode();
  const labName = useLabName();
  const linkLabelMode = useLinkLabelMode();
  const showDummyLinks = useShowDummyLinks();
  const endpointLabelOffset = useEndpointLabelOffset();
  const isLocked = useIsLocked();
  const isProcessing = useIsProcessing();
  const processingMode = useProcessingMode();

  const { setLinkLabelMode, toggleDummyLinks, setEndpointLabelOffset } = useTopoViewerActions();
  const saveEndpointLabelOffset = React.useCallback(() => {
    void saveViewerSettings({ endpointLabelOffset });
  }, [endpointLabelOffset]);

  const linkDropdown = useDropdown();
  const layoutDropdown = useDropdown();
  const gridDropdown = useDropdown();

  const handleLinkLabelModeChange = (mode: LinkLabelMode) => {
    setLinkLabelMode(mode);
    linkDropdown.close();
  };

  const handleEndpointLabelOffsetChange = (value: number) => {
    setEndpointLabelOffset(value);
  };

  const handleLayoutSelect = (nextLayout: LayoutOption) => {
    onLayoutChange(nextLayout);
    onToggleLayout?.();
    layoutDropdown.close();
  };

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

        {/* Undo - only show in edit mode */}
        {mode === "edit" && (
          <NavButton
            icon="fa-rotate-left"
            title="Undo (Ctrl+Z)"
            onClick={onUndo}
            disabled={!canUndo}
            testId="navbar-undo"
          />
        )}

        {/* Redo - only show in edit mode */}
        {mode === "edit" && (
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
        <div className="relative inline-block" ref={layoutDropdown.ref}>
          <NavButton
            icon="fa-circle-nodes"
            title={`Layout: ${getLayoutLabel(layout)}`}
            onClick={layoutDropdown.toggle}
            active={layoutDropdown.isOpen}
            testId="navbar-layout"
          />
          {layoutDropdown.isOpen && (
            <LayoutMenu currentLayout={layout} onSelect={handleLayoutSelect} />
          )}
        </div>

        {/* Grid line width */}
        <div className="relative inline-block" ref={gridDropdown.ref}>
          <NavButton
            icon="fa-border-all"
            title="Grid line width"
            onClick={gridDropdown.toggle}
            active={gridDropdown.isOpen}
            testId="navbar-grid"
          />
          {gridDropdown.isOpen && (
            <GridSettingsMenu value={gridLineWidth} onChange={onGridLineWidthChange} />
          )}
        </div>

        {/* Find Node */}
        <NavButton
          icon="fa-binoculars"
          title="Find Node"
          onClick={onFindNode}
          testId="navbar-find-node"
        />

        {/* Link Labels Dropdown */}
        <div className="relative inline-block" ref={linkDropdown.ref}>
          <NavButton
            icon="fa-tag"
            title="Link Labels"
            onClick={linkDropdown.toggle}
            active={linkDropdown.isOpen}
            testId="navbar-link-labels"
          />
          {linkDropdown.isOpen && (
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

const LAYOUT_OPTIONS: { value: LayoutOption; label: string }[] = [
  { value: "preset", label: "Preset" },
  { value: "cose", label: "Force-Directed (COSE)" },
  { value: "cola", label: "Cola" },
  { value: "radial", label: "Radial" },
  { value: "hierarchical", label: "Hierarchical" },
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

interface GridSettingsMenuProps {
  value: number;
  onChange: (width: number) => void;
}

const GridSettingsMenu: React.FC<GridSettingsMenuProps> = ({ value, onChange }) => {
  const handleChange = (evt: React.ChangeEvent<HTMLInputElement>) => {
    const next = parseFloat(evt.target.value);
    onChange(Number.isFinite(next) ? next : DEFAULT_GRID_LINE_WIDTH);
  };
  const handleReset = () => onChange(DEFAULT_GRID_LINE_WIDTH);
  return (
    <div className="navbar-menu grid-menu" role="menu">
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
}

const NavButton: React.FC<NavButtonProps> = ({
  icon,
  title,
  onClick,
  active,
  disabled,
  testId
}) => {
  return (
    <button
      className={`btn-icon ${active ? "active" : ""} ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
      title={title}
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
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
