// Shared editor panel shell (tabbed or children mode).
import React from "react";
import Box from "@mui/material/Box";

import { useFooterControlsRef } from "../../../hooks/ui/useFooterControlsRef";
import type { FooterControlsRef } from "../../../hooks/ui/useFooterControlsRef";
import { FIELDSET_RESET_STYLE } from "../../panels/context-panel/ContextPanelScrollArea";

import type { TabDefinition } from "./TabNavigation";
import { TabNavigation } from "./TabNavigation";

export interface TabConfig {
  id: string;
  label: string;
  hidden?: boolean;
  /** The component to render for this tab. */
  component: React.ComponentType<any>;
}

export interface EditorPanelFooterConfig {
  onFooterRef?: (ref: FooterControlsRef | null) => void;
  hasChanges: boolean;
  onApply: () => void;
  onSave: () => void;
  onDiscard: () => void;
}

export interface EditorPanelProps {
  // Tabbed mode
  tabs?: TabConfig[];
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
  /** Props passed to the active tab component */
  tabProps?: Record<string, unknown>;
  // Non-tabbed mode
  children?: React.ReactNode;
  // Common
  readOnly?: boolean;
  footer?: EditorPanelFooterConfig;
}

export const EditorPanel: React.FC<EditorPanelProps> = ({
  tabs,
  activeTab,
  onTabChange,
  tabProps,
  children,
  readOnly = false,
  footer
}) => {
  // Wire up footer ref if provided
  useFooterControlsRef(
    footer?.onFooterRef,
    footer ? true : false,
    footer?.onApply ?? (() => {}),
    footer?.onSave ?? (() => {}),
    footer?.hasChanges ?? false,
    footer?.onDiscard
  );

  // Tabbed mode
  if (tabs && activeTab && onTabChange) {
    const tabDefs: TabDefinition[] = tabs
      .filter((t) => !t.hidden)
      .map((t) => ({ id: t.id, label: t.label }));

    const activeConfig = tabs.find((t) => t.id === activeTab);
    const Component = activeConfig?.component;

    return (
      <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <TabNavigation tabs={tabDefs} activeTab={activeTab} onTabChange={onTabChange} />
        <Box sx={{ flex: 1, overflow: "auto" }}>
          <fieldset disabled={readOnly} style={FIELDSET_RESET_STYLE}>
            {Component ? <Component {...(tabProps ?? {})} /> : null}
          </fieldset>
        </Box>
      </Box>
    );
  }

  // Children mode (non-tabbed)
  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <Box sx={{ flex: 1, overflow: "auto" }}>
        <fieldset disabled={readOnly} style={FIELDSET_RESET_STYLE}>
          {children}
        </fieldset>
      </Box>
    </Box>
  );
};
