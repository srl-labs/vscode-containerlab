/**
 * IconSelectorModal - Modal for selecting and customizing node icons
 * Built on top of BasePanel
 */
import React, { useCallback } from 'react';
import { BasePanel } from './editor/BasePanel';
import { generateEncodedSVG, NodeType } from '../../utils/SvgGenerator';
import { useEscapeKey } from '../../hooks/ui/useEscapeKey';
import { useIconSelectorState } from '../../hooks/panels/useIconSelector';

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

function getIconSrc(icon: string, color: string): string {
  try { return generateEncodedSVG(icon as NodeType, color); }
  catch { return generateEncodedSVG('pe', color); }
}

interface IconSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (icon: string, color: string | null, cornerRadius: number) => void;
  initialIcon?: string;
  initialColor?: string | null;
  initialCornerRadius?: number;
}

const IconButton: React.FC<{
  icon: string; isSelected: boolean; color: string; cornerRadius: number; onClick: () => void;
}> = ({ icon, isSelected, color, cornerRadius, onClick }) => (
  <button
    type="button"
    className={`flex w-full flex-col items-center gap-0.5 rounded p-1.5 transition-colors ${
      isSelected ? 'bg-[var(--vscode-list-activeSelectionBackground)]' : 'hover:bg-[var(--vscode-list-hoverBackground)]'
    }`}
    onClick={onClick}
    title={ICON_LABELS[icon] || icon}
  >
    <img src={getIconSrc(icon, color)} alt={icon} className="rounded" style={{ width: 36, height: 36, borderRadius: `${(cornerRadius / 48) * 36}px` }} />
    <span className="max-w-full truncate text-[10px] text-[var(--vscode-foreground)]">{ICON_LABELS[icon] || icon}</span>
  </button>
);

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
              color={displayColor}
              cornerRadius={radius}
              onClick={() => setIcon(i)}
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
