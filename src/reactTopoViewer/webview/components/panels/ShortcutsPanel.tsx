/**
 * ShortcutsPanel - Displays keyboard shortcuts and interactions
 * Migrated from legacy TopoViewer shortcuts-modal.html
 */
import React from 'react';

import { BasePanel } from '../shared/editor/BasePanel';

interface ShortcutsPanelProps {
  isVisible: boolean;
  onClose: () => void;
}

/** Platform detection for keyboard symbols */
const isMac = typeof window !== 'undefined' && typeof window.navigator !== 'undefined' && /macintosh/i.test(window.navigator.userAgent);

/** Converts modifier keys based on platform */
function formatKey(key: string): string {
  if (!isMac) return key;
  return key.replace(/Ctrl/g, 'Cmd').replace(/Alt/g, 'Option');
}

interface ShortcutRowProps {
  label: string;
  shortcut: string;
}

const ShortcutRow: React.FC<ShortcutRowProps> = ({ label, shortcut }) => (
  <div className="flex justify-between items-center py-0.5">
    <span className="text-default">{label}</span>
    <kbd className="shortcuts-kbd">{formatKey(shortcut)}</kbd>
  </div>
);

interface ShortcutSectionProps {
  title: string;
  icon: string;
  colorClass: string;
  children: React.ReactNode;
}

const ShortcutSection: React.FC<ShortcutSectionProps> = ({ title, icon, colorClass, children }) => (
  <section className="mb-4">
    <h4 className={`font-semibold mb-2 flex items-center gap-2 ${colorClass}`}>
      <i className={`fas ${icon}`} aria-hidden="true"></i>
      {title}
    </h4>
    <div className="space-y-1 text-sm">
      {children}
    </div>
  </section>
);

export const ShortcutsPanel: React.FC<ShortcutsPanelProps> = ({ isVisible, onClose }) => {
  return (
    <BasePanel
      title="Shortcuts & Interactions"
      isVisible={isVisible}
      onClose={onClose}
      initialPosition={{ x: window.innerWidth - 340, y: 72 }}
      width={320}
      storageKey="shortcuts"
      zIndex={30}
      footer={false}
      minWidth={280}
      minHeight={200}
    >
      <div className="shortcuts-panel-content">
        {/* Viewer Mode */}
        <ShortcutSection title="Viewer Mode" icon="fa-eye" colorClass="text-green-500">
          <ShortcutRow label="Select node/link" shortcut="Left Click" />
          <ShortcutRow label="Node actions" shortcut="Right Click" />
          <ShortcutRow label="Capture packets" shortcut="Right Click + Link" />
          <ShortcutRow label="Move nodes" shortcut="Drag" />
          <ShortcutRow label="Quick Item Search" shortcut="Ctrl + F" />
        </ShortcutSection>

        {/* Editor Mode */}
        <ShortcutSection title="Editor Mode" icon="fa-edit" colorClass="text-blue-500">
          <ShortcutRow label="Add node" shortcut="Shift + Click" />
          <ShortcutRow label="Create link" shortcut="Shift + Node" />
          <ShortcutRow label="Delete" shortcut="Alt + Click" />
          <ShortcutRow label="Release from group" shortcut="Ctrl + Click" />
          <ShortcutRow label="Context menu" shortcut="Right Click" />
          <ShortcutRow label="Select all" shortcut="Ctrl + A" />
          <ShortcutRow label="Copy selected" shortcut="Ctrl + C" />
          <ShortcutRow label="Paste" shortcut="Ctrl + V" />
          <ShortcutRow label="Duplicate selected" shortcut="Ctrl + D" />
          <ShortcutRow label="Undo" shortcut="Ctrl + Z" />
          <ShortcutRow label="Redo" shortcut="Ctrl + Y" />
          <ShortcutRow label="Create group" shortcut="G" />
          <ShortcutRow label="Delete selected" shortcut="Del" />
        </ShortcutSection>

        {/* Panel Controls */}
        <ShortcutSection title="Panel Controls" icon="fa-cog" colorClass="text-purple-500">
          <ShortcutRow label="Close panel" shortcut="Esc" />
          <ShortcutRow label="Submit form" shortcut="Enter" />
        </ShortcutSection>

        {/* Tips */}
        <ShortcutSection title="Tips" icon="fa-lightbulb" colorClass="text-orange-500">
          <ul className="list-disc list-inside text-secondary space-y-1.5 text-sm">
            <li>Use layout algorithms to auto-arrange</li>
            <li>
              Box Selection with <kbd className="shortcuts-kbd-inline">Shift</kbd> + <kbd className="shortcuts-kbd-inline">Click</kbd> and press <kbd className="shortcuts-kbd-inline">G</kbd> to group or <kbd className="shortcuts-kbd-inline">Del</kbd> to delete
            </li>
            <li>Double-click any item to directly edit</li>
            <li>Export as image from context menu</li>
          </ul>
        </ShortcutSection>
      </div>
    </BasePanel>
  );
};
