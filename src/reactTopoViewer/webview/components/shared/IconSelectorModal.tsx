/**
 * IconSelectorModal - Modal for selecting and customizing node icons
 * Built on top of BasePanel
 */
import React, { useCallback, useState, useEffect, useMemo, useRef } from 'react';

import type { NodeType } from '../../utils/SvgGenerator';
import { generateEncodedSVG } from '../../utils/SvgGenerator';
import { useEscapeKey } from '../../hooks/ui/useDomInteractions';

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

function getIconSrc(icon: string, color: string): string {
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
}

const IconButton = React.memo<IconButtonProps>(function IconButton({ icon, isSelected, iconSrc, cornerRadius, onClick }) {
  return (
    <button
      type="button"
      className={`flex w-full flex-col items-center gap-0.5 rounded p-1.5 transition-colors ${
        isSelected ? 'bg-[var(--vscode-list-activeSelectionBackground)]' : 'hover:bg-[var(--vscode-list-hoverBackground)]'
      }`}
      onClick={onClick}
      title={ICON_LABELS[icon] || icon}
    >
      <img src={iconSrc} alt={icon} className="rounded" style={{ width: 36, height: 36, borderRadius: `${(cornerRadius / 48) * 36}px` }} />
      <span className="max-w-full truncate text-[10px] text-[var(--vscode-foreground)]">{ICON_LABELS[icon] || icon}</span>
    </button>
  );
});

const ColorPicker: React.FC<{
  color: string; enabled: boolean; onColorChange: (c: string) => void; onToggle: (e: boolean) => void;
}> = ({ color, enabled, onColorChange, onToggle }) => (
  <div className="space-y-1">
    <label className="vscode-label text-xs">Icon Color</label>
    <div className="flex items-center gap-2">
      <input type="checkbox" checked={enabled} onChange={(e) => onToggle(e.target.checked)} className="h-4 w-4" />
      <input type="color" value={color} onChange={(e) => { onColorChange(e.target.value); onToggle(true); }}
        className="h-7 w-12 cursor-pointer rounded border border-[var(--vscode-panel-border)] p-0.5" disabled={!enabled} />
      <input type="text" value={enabled ? color : ''} onChange={(e) => { if (/^#[0-9A-Fa-f]{0,6}$/.test(e.target.value)) { onColorChange(e.target.value); onToggle(true); } }}
        className="input-field flex-1 text-xs" placeholder={DEFAULT_COLOR} maxLength={7} disabled={!enabled} />
    </div>
  </div>
);

const RadiusSlider: React.FC<{ value: number; onChange: (v: number) => void }> = ({ value, onChange }) => (
  <div className="space-y-1">
    <label className="vscode-label text-xs">Corner Radius: {value}px</label>
    <input type="range" min={0} max={MAX_RADIUS} value={value} onChange={(e) => onChange(Number(e.target.value))}
      className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-[var(--vscode-input-background)]" />
  </div>
);

const Preview: React.FC<{ icon: string; color: string; radius: number }> = ({ icon, color, radius }) => (
  <div className="space-y-1">
    <label className="vscode-label text-xs">Preview</label>
    <div className="flex items-center justify-center rounded border border-[var(--vscode-panel-border)] bg-[var(--vscode-input-background)] p-3">
      <img src={getIconSrc(icon, color)} alt="Preview" style={{ width: 56, height: 56, borderRadius: `${(radius / 48) * 56}px` }} />
    </div>
  </div>
);

export const IconSelectorModal: React.FC<IconSelectorModalProps> = ({
  isOpen, onClose, onSave, initialIcon = 'pe', initialColor = null, initialCornerRadius = 0
}) => {
  const { icon, setIcon, color, setColor, radius, setRadius, useColor, setUseColor, displayColor, resultColor } =
    useIconSelectorState(isOpen, initialIcon, initialColor, initialCornerRadius);

  useEscapeKey(isOpen, onClose);

  // Debounce color for icon grid to reduce SVG regeneration during color picker drag
  const debouncedGridColor = useDebouncedValue(displayColor, COLOR_DEBOUNCE_MS);

  // Memoize icon sources - only regenerate when debounced color changes
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
  }, [setIcon]);

  const handleSave = useCallback(() => {
    onSave(icon, resultColor, radius);
    onClose();
  }, [icon, resultColor, radius, onSave, onClose]);

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
      {/* Icon Grid */}
      <div className="space-y-1 mb-3">
        <label className="vscode-label text-xs">Icon Shape</label>
        <div className="grid grid-cols-7 gap-1 rounded border border-[var(--vscode-panel-border)] bg-[var(--vscode-input-background)] p-2">
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

      {/* Color, Radius, and Preview */}
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <div className="space-y-3">
          <ColorPicker color={color} enabled={useColor} onColorChange={setColor} onToggle={setUseColor} />
          <RadiusSlider value={radius} onChange={setRadius} />
        </div>
        <Preview icon={icon} color={displayColor} radius={radius} />
      </div>
    </BasePanel>
  );
};
