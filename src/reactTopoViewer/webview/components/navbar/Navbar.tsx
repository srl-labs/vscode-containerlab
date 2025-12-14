/**
 * Navbar Component for React TopoViewer
 * Complete implementation matching legacy features
 */
import React, { useState, useRef, useEffect } from 'react';
import { useTopoViewer, LinkLabelMode } from '../../context/TopoViewerContext';
import { DEFAULT_GRID_LINE_WIDTH } from '../../hooks';
import type { LayoutOption } from '../../hooks';
import { ContainerlabLogo } from './ContainerlabLogo';

interface NavbarProps {
  onZoomToFit?: () => void;
  onToggleLayout?: () => void;
  layout: LayoutOption;
  onLayoutChange: (layout: LayoutOption) => void;
  gridLineWidth: number;
  onGridLineWidthChange: (width: number) => void;
  geoMode: 'pan' | 'edit';
  onGeoModeChange: (mode: 'pan' | 'edit') => void;
  isGeoLayout: boolean;
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
}

function useDropdown(): {
  isOpen: boolean;
  toggle: () => void;
  close: () => void;
  ref: React.RefObject<HTMLDivElement | null>;
} {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return {
    isOpen,
    toggle: () => setIsOpen(prev => !prev),
    close: () => setIsOpen(false),
    ref
  };
}

export const Navbar: React.FC<NavbarProps> = ({
  onZoomToFit,
  onToggleLayout,
  layout,
  onLayoutChange,
  gridLineWidth,
  onGridLineWidthChange,
  geoMode,
  onGeoModeChange,
  isGeoLayout,
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
  onRedo
}) => {
  const { state, setLinkLabelMode, toggleDummyLinks } = useTopoViewer();

  const linkDropdown = useDropdown();
  const layoutDropdown = useDropdown();
  const gridDropdown = useDropdown();

  const handleLinkLabelModeChange = (mode: LinkLabelMode) => {
    setLinkLabelMode(mode);
    linkDropdown.close();
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
        <a
          href="https://containerlab.dev/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center"
        >
          <ContainerlabLogo className="navbar-logo" />
        </a>
        <div className="navbar-title pl-0">
          <span className="navbar-title-main">TopoViewer</span>
          <span className="navbar-title-sub">
            <span className={`mode-badge ${state.mode === 'view' ? 'viewer' : 'editor'}`}>
              {state.mode === 'view' ? 'viewer' : 'editor'}
            </span>
            <span className="font-light">· {state.labName || 'Unknown Lab'}</span>
          </span>
        </div>
      </div>

      {/* Center: Buttons */}
      <div className="navbar-buttons">
        {/* Lab Settings */}
        <NavButton
          icon="fa-gear"
          title="Lab Settings"
          onClick={onLabSettings}
        />

        {/* Undo - only show in edit mode */}
        {state.mode === 'edit' && (
          <NavButton
            icon="fa-rotate-left"
            title="Undo (Ctrl+Z)"
            onClick={onUndo}
            disabled={!canUndo}
          />
        )}

        {/* Redo - only show in edit mode */}
        {state.mode === 'edit' && (
          <NavButton
            icon="fa-rotate-right"
            title="Redo (Ctrl+Y)"
            onClick={onRedo}
            disabled={!canRedo}
          />
        )}

        {/* Fit to Viewport */}
        <NavButton
          icon="fa-expand"
          title="Fit to Viewport"
          onClick={onZoomToFit}
        />

        {/* Toggle YAML Split View */}
        <NavButton
          icon="fa-columns"
          title="Toggle YAML Split View"
          onClick={onToggleSplit}
        />

        {/* Layout Manager */}
        <div className="relative inline-block" ref={layoutDropdown.ref}>
          <NavButton
            icon="fa-circle-nodes"
            title={`Layout: ${getLayoutLabel(layout)}`}
            onClick={layoutDropdown.toggle}
            active={layoutDropdown.isOpen}
          />
          {layoutDropdown.isOpen && (
            <LayoutMenu
              currentLayout={layout}
              onSelect={handleLayoutSelect}
            />
          )}
        </div>

        {/* Grid line width */}
        <div className="relative inline-block" ref={gridDropdown.ref}>
          <NavButton
            icon="fa-border-all"
            title="Grid line width"
            onClick={gridDropdown.toggle}
            active={gridDropdown.isOpen}
          />
          {gridDropdown.isOpen && (
            <GridSettingsMenu
              value={gridLineWidth}
              onChange={onGridLineWidthChange}
            />
          )}
        </div>

        {/* Find Node */}
        <NavButton
          icon="fa-binoculars"
          title="Find Node"
          onClick={onFindNode}
        />

        {/* Link Labels Dropdown */}
        <div className="relative inline-block" ref={linkDropdown.ref}>
          <NavButton
            icon="fa-tag"
            title="Link Labels"
            onClick={linkDropdown.toggle}
            active={linkDropdown.isOpen}
          />
          {linkDropdown.isOpen && (
            <LinkLabelMenu
              currentMode={state.linkLabelMode}
              showDummyLinks={state.showDummyLinks}
              onModeChange={handleLinkLabelModeChange}
              onToggleDummyLinks={toggleDummyLinks}
            />
          )}
        </div>

        {/* Capture Viewport */}
        <NavButton
          icon="fa-camera"
          title="Capture Viewport as SVG"
          onClick={onCaptureViewport}
        />

        {/* Shortcuts */}
        <NavButton
          icon="fa-keyboard"
          title="Shortcuts"
          onClick={onShowShortcuts}
        />

        {/* Toggle Shortcut Display */}
        <NavButton
          icon={shortcutDisplayEnabled ? 'fa-eye' : 'fa-eye-slash'}
          title="Toggle Shortcut Display"
          onClick={onToggleShortcutDisplay}
          active={shortcutDisplayEnabled}
        />

        {/* About */}
        <NavButton
          icon="fa-circle-info"
          title="About TopoViewer"
          onClick={onShowAbout}
        />

        {/* Geo mode toggle (when applicable) */}
        {isGeoLayout && (
          <GeoModeToggle
            mode={geoMode}
            onChange={onGeoModeChange}
          />
        )}
      </div>

      {/* Loading Indicator */}
      {state.isLoading && (
        <div className="navbar-loading-indicator" role="presentation" aria-hidden="true">
          <div className="navbar-loading-indicator__bar"></div>
        </div>
      )}
    </nav>
  );
};

/**
 * Link Label Menu Component
 */
interface LinkLabelMenuProps {
  currentMode: LinkLabelMode;
  showDummyLinks: boolean;
  onModeChange: (mode: LinkLabelMode) => void;
  onToggleDummyLinks: () => void;
}

const LINK_LABEL_MODES: { value: LinkLabelMode; label: string }[] = [
  { value: 'show-all', label: 'Show Labels' },
  { value: 'on-select', label: 'Show Link Labels on Select' },
  { value: 'hide', label: 'No Labels' }
];

const LinkLabelMenu: React.FC<LinkLabelMenuProps> = ({
  currentMode,
  showDummyLinks,
  onModeChange,
  onToggleDummyLinks
}) => {
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
    </div>
  );
};

const LAYOUT_OPTIONS: { value: LayoutOption; label: string }[] = [
  { value: 'preset', label: 'Preset' },
  { value: 'cose', label: 'Force-Directed (COSE)' },
  { value: 'cola', label: 'Cola' },
  { value: 'radial', label: 'Radial' },
  { value: 'hierarchical', label: 'Hierarchical' },
  { value: 'geo', label: 'Geo Map' }
];

function getLayoutLabel(option: LayoutOption): string {
  const match = LAYOUT_OPTIONS.find(o => o.value === option);
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
        <label className="text-2xs font-semibold text-default uppercase tracking-wide">Grid line width</label>
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

interface GeoModeToggleProps {
  mode: 'pan' | 'edit';
  onChange: (mode: 'pan' | 'edit') => void;
}

const GeoModeToggle: React.FC<GeoModeToggleProps> = ({ mode, onChange }) => (
  <div className="flex items-center gap-1 px-2 py-1 rounded border border-[var(--vscode-panel-border,#3c3c3c)] bg-[var(--vscode-editor-background,#1e1e1e)]">
    <span className="text-xs text-[var(--text-secondary,#9ca3af)]">Geo mode</span>
    <div className="inline-flex rounded overflow-hidden border border-[var(--vscode-panel-border,#3c3c3c)]">
      <button
        type="button"
        className={`px-2 py-1 text-xs ${mode === 'pan' ? 'bg-[var(--accent,#3b82f6)] text-white' : 'bg-transparent text-[var(--text-secondary,#9ca3af)]'}`}
        onClick={() => onChange('pan')}
      >
        Pan
      </button>
      <button
        type="button"
        className={`px-2 py-1 text-xs ${mode === 'edit' ? 'bg-[var(--accent,#3b82f6)] text-white' : 'bg-transparent text-[var(--text-secondary,#9ca3af)]'}`}
        onClick={() => onChange('edit')}
      >
        Edit
      </button>
    </div>
  </div>
);

/**
 * Navbar Button Component
 */
interface NavButtonProps {
  icon: string;
  title: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
}

const NavButton: React.FC<NavButtonProps> = ({ icon, title, onClick, active, disabled }) => {
  return (
    <button
      className={`btn-icon ${active ? 'active' : ''} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      title={title}
      onClick={onClick}
      disabled={disabled}
    >
      <span className="inline-flex items-center justify-center text-xl">
        <i className={`fas ${icon}`}></i>
      </span>
    </button>
  );
};
