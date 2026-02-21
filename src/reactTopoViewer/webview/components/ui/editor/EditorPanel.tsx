// Shared editor panel shell (tabbed or children mode).
import React from "react";
import Box from "@mui/material/Box";

import { useFooterControlsRef } from "../../../hooks/ui/useFooterControlsRef";
import type { FooterControlsRef } from "../../../hooks/ui/useFooterControlsRef";
import { FIELDSET_RESET_STYLE } from "../../panels/context-panel/ContextPanelScrollArea";

import type { TabDefinition } from "./TabNavigation";
import { TabNavigation } from "./TabNavigation";

export interface TabConfig<TProps extends object = Record<string, unknown>> {
  id: string;
  label: string;
  hidden?: boolean;
  /** The component to render for this tab. */
  component: React.ComponentType<TProps>;
}

export interface EditorPanelFooterConfig {
  onFooterRef?: (ref: FooterControlsRef | null) => void;
  hasChanges: boolean;
  onApply: () => void;
  onSave: () => void;
  onDiscard: () => void;
}

export interface EditorPanelProps<TProps extends object = Record<string, unknown>> {
  // Tabbed mode
  tabs?: Array<TabConfig<TProps>>;
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
  /** Props passed to the active tab component */
  tabProps?: TProps;
  // Non-tabbed mode
  children?: React.ReactNode;
  // Common
  readOnly?: boolean;
  footer?: EditorPanelFooterConfig;
}

interface FooterControlConfig {
  isEnabled: boolean;
  onApply: () => void;
  onSave: () => void;
  hasChanges: boolean;
  onDiscard?: () => void;
}

function resolveFooterControlConfig(footer?: EditorPanelFooterConfig): FooterControlConfig {
  if (!footer) {
    return {
      isEnabled: false,
      onApply: () => {},
      onSave: () => {},
      hasChanges: false,
      onDiscard: undefined
    };
  }

  return {
    isEnabled: true,
    onApply: footer.onApply,
    onSave: footer.onSave,
    hasChanges: footer.hasChanges,
    onDiscard: footer.onDiscard
  };
}

function renderTabbedMode<TProps extends object>(
  tabs: Array<TabConfig<TProps>>,
  activeTab: string,
  onTabChange: (tabId: string) => void,
  tabProps: TProps | undefined,
  readOnly: boolean
): React.ReactElement {
  const tabDefs: TabDefinition[] = tabs
    .filter((tab) => tab.hidden !== true)
    .map(({ id, label }) => ({ id, label }));
  const activeConfig = tabs.find((tab) => tab.id === activeTab);
  const ActiveComponent = activeConfig?.component;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <TabNavigation tabs={tabDefs} activeTab={activeTab} onTabChange={onTabChange} />
      <Box sx={{ flex: 1, overflow: "auto" }}>
        <fieldset disabled={readOnly} style={FIELDSET_RESET_STYLE}>
          {ActiveComponent && tabProps !== undefined ? <ActiveComponent {...tabProps} /> : null}
        </fieldset>
      </Box>
    </Box>
  );
}

function renderChildrenMode(children: React.ReactNode, readOnly: boolean): React.ReactElement {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <Box sx={{ flex: 1, overflow: "auto" }}>
        <fieldset disabled={readOnly} style={FIELDSET_RESET_STYLE}>
          {children}
        </fieldset>
      </Box>
    </Box>
  );
}

export function EditorPanel<TProps extends object = Record<string, unknown>>({
  tabs,
  activeTab,
  onTabChange,
  tabProps,
  children,
  readOnly = false,
  footer
}: EditorPanelProps<TProps>): React.ReactElement {
  const footerConfig = resolveFooterControlConfig(footer);

  // Wire up footer ref if provided
  useFooterControlsRef(
    footer?.onFooterRef,
    footerConfig.isEnabled,
    footerConfig.onApply,
    footerConfig.onSave,
    footerConfig.hasChanges,
    footerConfig.onDiscard
  );

  // Tabbed mode
  if (tabs !== undefined && activeTab !== undefined && activeTab.length > 0 && onTabChange !== undefined) {
    return renderTabbedMode(tabs, activeTab, onTabChange, tabProps, readOnly);
  }

  // Children mode (non-tabbed)
  return renderChildrenMode(children, readOnly);
}
