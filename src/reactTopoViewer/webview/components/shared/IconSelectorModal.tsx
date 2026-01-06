/**
 * IconSelectorModal - Modal for selecting and customizing node icons
 * Built on top of BasePanel. Supports both built-in and custom icons.
 */
import React, { useCallback, useState, useEffect, useMemo, useRef } from 'react';

import type { NodeType } from '../../utils/SvgGenerator';
import { generateEncodedSVG } from '../../utils/SvgGenerator';
import { useEscapeKey } from '../../hooks/ui/useDomInteractions';
import { useTopoViewerState } from '../../context/TopoViewerContext';
import { postCommand } from '../../utils/extensionMessaging';
import { isBuiltInIcon } from '../../../shared/types/icons';

import { BasePanel } from './editor/BasePanel';

const AVAILABLE_ICONS: NodeType[] = [
  'pe', 'dcgw', 'leaf', 'switch', 'bridge', 'spine',
  'super-spine', 'server', 'pon', 'controller', 'rgw', 'ue', 'cloud', 'client'
];

const ICON_LABELS: Record<string, string> = {
  'pe': 'PE Router', 'dcgw': 'DC Gateway', 'leaf': 'Leaf', 'switch': 'Switch',
  'bridge': 'Bridge', 'spine': 'Spine', 'super-spine': 'Super Spine',
  'server': 'Server', 'pon': 'PON', 'controller': 'Controller',
  'rgw': 'RGW', 'ue': 'User Equipment', 'cloud': 'Cloud', 'client': 'Client'
};

const DEFAULT_COLOR = '#1a73e8';
const MAX_RADIUS = 40;
const COLOR_DEBOUNCE_MS = 50;

/**
 * Get icon source - for built-in icons applies color, for custom icons returns as-is
 */
function getIconSrc(icon: string, color: string, customIconDataUri?: string): string {
  // Custom icons render as-is (no color tinting)
  if (customIconDataUri) {
    return customIconDataUri;
  }
  // Built-in icons with color
  try { return generateEncodedSVG(icon as NodeType, color); }
  catch { return generateEncodedSVG('pe', color); }
}

/**
 * Hook to debounce a value - returns debounced value that updates after delay
 */
function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

interface UseIconSelectorStateReturn {
  icon: string;
  setIcon: (icon: string) => void;
  color: string;
  setColor: (color: string) => void;
  radius: number;
  setRadius: (radius: number) => void;
  useColor: boolean;
  setUseColor: (useColor: boolean) => void;
  displayColor: string;
  resultColor: string | null;
}

/**
 * Hook to manage icon selector form state
 */
function useIconSelectorState(
  isOpen: boolean,
  initialIcon: string,
  initialColor: string | null,
  initialCornerRadius: number
): UseIconSelectorStateReturn {
  const [icon, setIcon] = useState(initialIcon);
  const [color, setColor] = useState(initialColor || DEFAULT_COLOR);
  const [radius, setRadius] = useState(initialCornerRadius);
  const [useColor, setUseColor] = useState(!!initialColor);

  useEffect(() => {
    if (isOpen) {
      setIcon(initialIcon);
      setColor(initialColor || DEFAULT_COLOR);
      setRadius(initialCornerRadius);
      setUseColor(!!initialColor);
    }
  }, [isOpen, initialIcon, initialColor, initialCornerRadius]);

  const displayColor = useColor ? color : DEFAULT_COLOR;
  const resultColor = useColor && color !== DEFAULT_COLOR ? color : null;

  return { icon, setIcon, color, setColor, radius, setRadius, useColor, setUseColor, displayColor, resultColor };
}

interface IconSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (icon: string, color: string | null, cornerRadius: number) => void;
  initialIcon?: string;
  initialColor?: string | null;
  initialCornerRadius?: number;
}

interface IconButtonProps {
  icon: string;
  isSelected: boolean;
  iconSrc: string;
  cornerRadius: number;
  onClick: () => void;
  onDelete?: () => void;
  isCustom?: boolean;
  source?: 'workspace' | 'global';
}

const IconButton = React.memo<IconButtonProps>(function IconButton({
  icon, isSelected, iconSrc, cornerRadius, onClick, onDelete, isCustom, source
}) {
  return (
    <div className="relative group">
      <button
        type="button"
        className={`flex w-full flex-col items-center gap-0.5 rounded-sm p-1.5 transition-colors ${
          isSelected ? 'bg-[var(--vscode-list-activeSelectionBackground)]' : 'hover:bg-[var(--vscode-list-hoverBackground)]'
        }`}
        onClick={onClick}
        title={(ICON_LABELS[icon] || icon) + (source ? ' (' + source + ')' : '')}
      >
        <img src={iconSrc} alt={icon} className="rounded-sm" style={{ width: 36, height: 36, borderRadius: `${(cornerRadius / 48) * 36}px` }} />
        <span className="max-w-full truncate text-[10px] text-[var(--vscode-foreground)]">{ICON_LABELS[icon] || icon}</span>
      </button>
      {/* Delete button for global custom icons */}
      {isCustom && source === 'global' && onDelete && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="absolute -top-1 -right-1 w-4 h-4 bg-[var(--vscode-errorForeground)] text-white rounded-sm text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
          title={`Delete ${icon}`}
        >
          x
        </button>
      )}
    </div>
  );
});

const ColorPicker: React.FC<{
  color: string; enabled: boolean; onColorChange: (c: string) => void; onToggle: (e: boolean) => void;
}> = ({ color, enabled, onColorChange, onToggle }) => (
  <div className="space-y-1">
    <label className="field-label">Icon Color</label>
    <div className="flex items-center gap-2">
      <input type="checkbox" checked={enabled} onChange={(e) => onToggle(e.target.checked)} className="h-4 w-4" />
      <input type="color" value={color} onChange={(e) => { onColorChange(e.target.value); onToggle(true); }}
        className="h-7 w-12 cursor-pointer rounded-sm border border-[var(--vscode-panel-border)] p-0.5" disabled={!enabled} />
      <input type="text" value={enabled ? color : ''} onChange={(e) => { if (/^#[0-9A-Fa-f]{0,6}$/.test(e.target.value)) { onColorChange(e.target.value); onToggle(true); } }}
        className="input-field flex-1 text-xs" placeholder={DEFAULT_COLOR} maxLength={7} disabled={!enabled} />
    </div>
  </div>
);

const RadiusSlider: React.FC<{ value: number; onChange: (v: number) => void }> = ({ value, onChange }) => (
  <div className="space-y-1">
    <label className="field-label">Corner Radius: {value}px</label>
    <input type="range" min={0} max={MAX_RADIUS} value={value} onChange={(e) => onChange(Number(e.target.value))}
      className="h-2 w-full cursor-pointer appearance-none rounded-sm bg-[var(--vscode-input-background)]" />
  </div>
);

export const IconSelectorModal: React.FC<IconSelectorModalProps> = ({
  isOpen, onClose, onSave, initialIcon = 'pe', initialColor = null, initialCornerRadius = 0
}) => {
  const { state } = useTopoViewerState();
  const customIcons = state.customIcons;

  const { icon, setIcon, color, setColor, radius, setRadius, useColor, setUseColor, displayColor, resultColor } =
    useIconSelectorState(isOpen, initialIcon, initialColor, initialCornerRadius);

  useEscapeKey(isOpen, onClose);

  // Debounce color for icon grid to reduce SVG regeneration during color picker drag
  const debouncedGridColor = useDebouncedValue(displayColor, COLOR_DEBOUNCE_MS);

  // Check if current icon is a custom icon
  const currentCustomIcon = useMemo(() => {
    return customIcons.find(ci => ci.name === icon);
  }, [customIcons, icon]);

  // Memoize icon sources for built-in icons - only regenerate when debounced color changes
  const iconSources = useMemo(() => {
    const sources: Record<string, string> = {};
    for (const i of AVAILABLE_ICONS) {
      sources[i] = getIconSrc(i, debouncedGridColor);
    }
    return sources;
  }, [debouncedGridColor]);

  // Memoize click handlers to prevent IconButton re-renders
  const iconClickHandlers = useRef<Record<string, () => void>>({});
  useMemo(() => {
    for (const i of AVAILABLE_ICONS) {
      iconClickHandlers.current[i] = () => setIcon(i);
    }
    // Add handlers for custom icons
    for (const ci of customIcons) {
      iconClickHandlers.current[ci.name] = () => setIcon(ci.name);
    }
  }, [setIcon, customIcons]);

  const handleSave = useCallback(() => {
    onSave(icon, resultColor, radius);
    onClose();
  }, [icon, resultColor, radius, onSave, onClose]);

  const handleUploadIcon = useCallback(() => {
    postCommand('icon-upload');
  }, []);

  const handleDeleteIcon = useCallback((iconName: string) => {
    postCommand('icon-delete', { iconName });
  }, []);

  // Get preview icon source
  const previewIconSrc = useMemo(() => {
    if (currentCustomIcon) {
      return currentCustomIcon.dataUri;
    }
    return getIconSrc(icon, displayColor);
  }, [icon, displayColor, currentCustomIcon]);

  return (
    <BasePanel
      title="Select Icon"
      isVisible={isOpen}
      onClose={onClose}
      storageKey="icon-selector"
      backdrop={true}
      width={400}
      onSecondaryClick={onClose}
      onPrimaryClick={handleSave}
      secondaryLabel="Cancel"
      primaryLabel="Apply"
    >
      {/* Built-in Icons Grid */}
      <div className="space-y-1 mb-3">
        <label className="field-label">Built-in Icons</label>
        <div className="grid grid-cols-7 gap-1 rounded-sm border border-[var(--vscode-panel-border)] bg-[var(--vscode-input-background)] p-2">
          {AVAILABLE_ICONS.map((i) => (
            <IconButton
              key={i}
              icon={i}
              isSelected={icon === i}
              iconSrc={iconSources[i]}
              cornerRadius={radius}
              onClick={iconClickHandlers.current[i]}
            />
          ))}
        </div>
      </div>

      {/* Custom Icons Section */}
      <div className="space-y-1 mb-3">
        <div className="flex items-center justify-between">
          <label className="field-label">Custom Icons</label>
          <button
            type="button"
            onClick={handleUploadIcon}
            className="text-xs px-2 py-0.5 rounded-sm bg-[var(--vscode-button-secondaryBackground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)] text-[var(--vscode-button-secondaryForeground)]"
            title="Add custom icon"
          >
            + Add
          </button>
        </div>
        {customIcons.length > 0 ? (
          <div className="grid grid-cols-7 gap-1 rounded-sm border border-[var(--vscode-panel-border)] bg-[var(--vscode-input-background)] p-2">
            {customIcons.map((ci) => (
              <IconButton
                key={ci.name}
                icon={ci.name}
                isSelected={icon === ci.name}
                iconSrc={ci.dataUri}
                cornerRadius={radius}
                onClick={iconClickHandlers.current[ci.name]}
                onDelete={() => handleDeleteIcon(ci.name)}
                isCustom={true}
                source={ci.source}
              />
            ))}
          </div>
        ) : (
          <div className="text-xs text-[var(--vscode-descriptionForeground)] italic p-2 text-center border border-dashed border-[var(--vscode-panel-border)] rounded-sm">
            No custom icons. Click &quot;+ Add&quot; to upload.
          </div>
        )}
      </div>

      {/* Color, Radius, and Preview */}
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <div className="space-y-3">
          {/* Only show color picker for built-in icons */}
          {isBuiltInIcon(icon) ? (
            <ColorPicker color={color} enabled={useColor} onColorChange={setColor} onToggle={setUseColor} />
          ) : (
            <div className="text-xs text-[var(--vscode-descriptionForeground)] italic">
              Custom icons use their original colors
            </div>
          )}
          <RadiusSlider value={radius} onChange={setRadius} />
        </div>
        <PreviewCustom iconSrc={previewIconSrc} radius={radius} />
      </div>
    </BasePanel>
  );
};

/**
 * Preview component that accepts direct icon source
 */
const PreviewCustom: React.FC<{ iconSrc: string; radius: number }> = ({ iconSrc, radius }) => (
  <div className="space-y-1">
    <label className="field-label">Preview</label>
    <div className="flex items-center justify-center rounded-sm border border-[var(--vscode-panel-border)] bg-[var(--vscode-input-background)] p-3">
      <img src={iconSrc} alt="Preview" style={{ width: 56, height: 56, borderRadius: `${(radius / 48) * 56}px` }} />
    </div>
  </div>
);
