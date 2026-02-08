/**
 * NodeEditorView - Node editor content for the ContextPanel
 * Reuses useNodeEditorForm logic, renders tab content directly.
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Box from "@mui/material/Box";

import type { TabDefinition } from "../../../ui/editor";
import { TabNavigation } from "../../../ui/editor/TabNavigation";
import { useApplySaveHandlers, useFooterControlsRef } from "../../../../hooks/ui";
import { FIELDSET_RESET_STYLE } from "../ContextPanelScrollArea";
import type { NodeEditorData, NodeEditorTabId } from "../../node-editor/types";
import { BasicTab } from "../../node-editor/BasicTab";
import { ComponentsTab } from "../../node-editor/ComponentsTab";
import { ConfigTab } from "../../node-editor/ConfigTab";
import { RuntimeTab } from "../../node-editor/RuntimeTab";
import { NetworkTab } from "../../node-editor/NetworkTab";
import { AdvancedTab } from "../../node-editor/AdvancedTab";

export interface NodeEditorViewProps {
  nodeData: NodeEditorData | null;
  onSave: (data: NodeEditorData) => void;
  onApply: (data: NodeEditorData) => void;
  inheritedProps?: string[];
  /** Disable editing, but keep scrolling and tab navigation available */
  readOnly?: boolean;
  /** Exposed for ContextPanel footer */
  onFooterRef?: (ref: NodeEditorFooterRef | null) => void;
}

export interface NodeEditorFooterRef {
  handleApply: () => void;
  handleSave: () => void;
  hasChanges: boolean;
}

const BASE_TABS: TabDefinition[] = [
  { id: "basic", label: "Basic" },
  { id: "config", label: "Configuration" },
  { id: "runtime", label: "Runtime" },
  { id: "network", label: "Network" },
  { id: "advanced", label: "Advanced" }
];

const COMPONENTS_TAB: TabDefinition = { id: "components", label: "Components" };

function getTabsForNode(kind: string | undefined): TabDefinition[] {
  if (kind === "nokia_srsim") {
    return [BASE_TABS[0], COMPONENTS_TAB, ...BASE_TABS.slice(1)];
  }
  return BASE_TABS;
}

const YAML_TO_EDITOR_MAP: Record<string, keyof NodeEditorData> = {
  "startup-config": "startupConfig",
  "enforce-startup-config": "enforceStartupConfig",
  "suppress-startup-config": "suppressStartupConfig",
  "env-files": "envFiles",
  "restart-policy": "restartPolicy",
  "auto-remove": "autoRemove",
  "startup-delay": "startupDelay",
  "mgmt-ipv4": "mgmtIpv4",
  "mgmt-ipv6": "mgmtIpv6",
  "network-mode": "networkMode",
  "cpu-set": "cpuSet",
  "shm-size": "shmSize",
  "cap-add": "capAdd",
  "image-pull-policy": "imagePullPolicy"
};

function hasFieldChanged(yamlKey: string, formData: NodeEditorData, initialData: NodeEditorData): boolean {
  const editorKey = YAML_TO_EDITOR_MAP[yamlKey] || yamlKey;
  const currentVal = formData[editorKey as keyof NodeEditorData];
  const initialVal = initialData[editorKey as keyof NodeEditorData];
  return JSON.stringify(currentVal) !== JSON.stringify(initialVal);
}

function useNodeEditorForm(nodeData: NodeEditorData | null) {
  const [activeTab, setActiveTab] = useState<NodeEditorTabId>("basic");
  const [formData, setFormData] = useState<NodeEditorData | null>(null);
  const [lastAppliedData, setLastAppliedData] = useState<NodeEditorData | null>(null);
  const [originalData, setOriginalData] = useState<NodeEditorData | null>(null);
  const [loadedNodeId, setLoadedNodeId] = useState<string | null>(null);
  const skipNextSyncRef = useRef(false);

  useEffect(() => {
    if (nodeData && nodeData.id !== loadedNodeId) {
      setFormData({ ...nodeData });
      setLastAppliedData({ ...nodeData });
      setOriginalData({ ...nodeData });
      setLoadedNodeId(nodeData.id);
      setActiveTab("basic");
      skipNextSyncRef.current = false;
    } else if (nodeData && nodeData.id === loadedNodeId) {
      if (skipNextSyncRef.current) {
        skipNextSyncRef.current = false;
        return;
      }
      setFormData({ ...nodeData });
      setLastAppliedData({ ...nodeData });
    } else if (!nodeData && loadedNodeId) {
      setLoadedNodeId(null);
      skipNextSyncRef.current = false;
    }
  }, [nodeData, loadedNodeId]);

  const handleChange = useCallback((updates: Partial<NodeEditorData>) => {
    setFormData((prev) => (prev ? { ...prev, ...updates } : null));
  }, []);

  const resetAfterApply = useCallback(() => {
    if (formData) {
      setLastAppliedData({ ...formData });
      skipNextSyncRef.current = true;
    }
  }, [formData]);

  const hasChanges = formData && lastAppliedData
    ? JSON.stringify(formData) !== JSON.stringify(lastAppliedData)
    : false;

  return { activeTab, setActiveTab, formData, handleChange, hasChanges, resetAfterApply, originalData };
}

const TAB_COMPONENTS: Record<
  NodeEditorTabId,
  React.FC<{
    data: NodeEditorData;
    onChange: (updates: Partial<NodeEditorData>) => void;
    inheritedProps: string[];
  }>
> = {
  basic: BasicTab,
  components: ComponentsTab,
  config: ConfigTab,
  runtime: RuntimeTab,
  network: NetworkTab,
  advanced: AdvancedTab
};

export const NodeEditorView: React.FC<NodeEditorViewProps> = ({
  nodeData,
  onSave,
  onApply,
  inheritedProps = [],
  readOnly = false,
  onFooterRef
}) => {
  const { activeTab, setActiveTab, formData, handleChange, hasChanges, resetAfterApply, originalData } =
    useNodeEditorForm(nodeData);

  const tabs = useMemo(() => getTabsForNode(formData?.kind), [formData?.kind]);

  const effectiveInheritedProps = useMemo(() => {
    if (!formData || !originalData) return inheritedProps;
    return inheritedProps.filter((prop) => !hasFieldChanged(prop, formData, originalData));
  }, [inheritedProps, formData, originalData]);

  const { handleApply, handleSave } = useApplySaveHandlers(formData, onApply, onSave, resetAfterApply);

  useFooterControlsRef(onFooterRef, Boolean(formData), handleApply, handleSave, hasChanges);

  if (!formData) return null;

  const Component = TAB_COMPONENTS[activeTab];
  const effectiveOnChange = readOnly ? () => {} : handleChange;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <TabNavigation
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={(id) => setActiveTab(id as NodeEditorTabId)}
      />
      <Box sx={{ p: 2, flex: 1, overflow: "auto" }}>
        <fieldset disabled={readOnly} style={FIELDSET_RESET_STYLE}>
          {Component ? (
            <Component
              data={formData}
              onChange={effectiveOnChange}
              inheritedProps={effectiveInheritedProps}
            />
          ) : null}
        </fieldset>
      </Box>
    </Box>
  );
};
