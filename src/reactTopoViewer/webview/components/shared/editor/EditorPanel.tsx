/**
 * EditorPanel - Panel with tabs and Apply/OK footer
 * Built on top of BasePanel
 */
import React, { ReactNode } from 'react';
import { BasePanel } from './BasePanel';
import { TabNavigation, TabDefinition } from './TabNavigation';

interface EditorPanelProps {
  title: string;
  isVisible: boolean;
  onClose: () => void;
  onApply: () => void;
  onSave: () => void;
  children: ReactNode;
  width?: number;
  initialPosition?: { x: number; y: number };
  tabs?: TabDefinition[];
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
  storageKey?: string;
}

export const EditorPanel: React.FC<EditorPanelProps> = ({
  title,
  isVisible,
  onClose,
  onApply,
  onSave,
  children,
  width = 400,
  initialPosition = { x: 20, y: 80 },
  tabs,
  activeTab,
  onTabChange,
  storageKey
}) => (
  <BasePanel
    title={title}
    isVisible={isVisible}
    onClose={onClose}
    width={width}
    initialPosition={initialPosition}
    storageKey={storageKey}
    onSecondaryClick={onApply}
    onPrimaryClick={onSave}
    secondaryLabel="Apply"
    primaryLabel="OK"
  >
    {tabs && activeTab && onTabChange && (
      <TabNavigation tabs={tabs} activeTab={activeTab} onTabChange={onTabChange} />
    )}
    {children}
  </BasePanel>
);
