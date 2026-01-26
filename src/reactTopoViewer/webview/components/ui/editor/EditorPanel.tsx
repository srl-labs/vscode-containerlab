/**
 * EditorPanel - Panel with tabs and Apply/OK footer
 * Built on top of BasePanel
 */
import type { ReactNode } from "react";
import React from "react";

import { BasePanel } from "./BasePanel";
import type { TabDefinition } from "./TabNavigation";
import { TabNavigation } from "./TabNavigation";

interface EditorPanelProps {
  title: string;
  isVisible: boolean;
  onClose: () => void;
  onApply: () => void;
  onSave: () => void;
  children: ReactNode;
  width?: number;
  height?: number;
  initialPosition?: { x: number; y: number };
  tabs?: TabDefinition[];
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
  storageKey?: string;
  /** When true, highlights the Apply button to indicate unsaved changes */
  hasChanges?: boolean;
  /** Enable diagonal resizing (default: true) */
  resizable?: boolean;
  /** Minimum width when resizing */
  minWidth?: number;
  /** Minimum height when resizing */
  minHeight?: number;
  /** Test ID for E2E testing */
  testId?: string;
}

export const EditorPanel: React.FC<EditorPanelProps> = ({
  title,
  isVisible,
  onClose,
  onApply,
  onSave,
  children,
  width = 400,
  height,
  initialPosition, // undefined = center the panel
  tabs,
  activeTab,
  onTabChange,
  storageKey,
  hasChanges = false,
  resizable = true,
  minWidth,
  minHeight,
  testId
}) => (
  <BasePanel
    title={title}
    isVisible={isVisible}
    onClose={onClose}
    width={width}
    height={height}
    initialPosition={initialPosition}
    storageKey={storageKey}
    onSecondaryClick={onApply}
    onPrimaryClick={onSave}
    secondaryLabel="Apply"
    primaryLabel="OK"
    hasChanges={hasChanges}
    resizable={resizable}
    minWidth={minWidth}
    minHeight={minHeight}
    testId={testId}
  >
    {tabs && activeTab && onTabChange && (
      <TabNavigation tabs={tabs} activeTab={activeTab} onTabChange={onTabChange} />
    )}
    {children}
  </BasePanel>
);
