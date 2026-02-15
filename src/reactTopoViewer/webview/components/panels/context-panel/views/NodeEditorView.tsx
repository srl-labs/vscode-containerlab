// Node editor content for the ContextPanel.
import React, { useMemo } from "react";

import { EditorPanel } from "../../../ui/editor/EditorPanel";
import type { TabConfig } from "../../../ui/editor/EditorPanel";
import { useApplySaveHandlers, useFooterControlsRef } from "../../../../hooks/ui";
import { useNodeEditorForm, hasFieldChanged } from "../../../../hooks/editor/useNodeEditorForm";
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
  handleDiscard: () => void;
  hasChanges: boolean;
}

const BASE_TABS: TabConfig[] = [
  { id: "basic", label: "Basic", component: BasicTab },
  { id: "config", label: "Configuration", component: ConfigTab },
  { id: "runtime", label: "Runtime", component: RuntimeTab },
  { id: "network", label: "Network", component: NetworkTab },
  { id: "advanced", label: "Advanced", component: AdvancedTab }
];

const COMPONENTS_TAB: TabConfig = {
  id: "components",
  label: "Components",
  component: ComponentsTab
};

function getTabsForNode(kind: string | undefined): TabConfig[] {
  if (kind === "nokia_srsim") {
    return [BASE_TABS[0], COMPONENTS_TAB, ...BASE_TABS.slice(1)];
  }
  return BASE_TABS;
}

export const NodeEditorView: React.FC<NodeEditorViewProps> = ({
  nodeData,
  onSave,
  onApply,
  inheritedProps = [],
  readOnly = false,
  onFooterRef
}) => {
  const {
    activeTab,
    setActiveTab,
    formData,
    handleChange,
    hasChanges,
    resetAfterApply,
    discardChanges,
    originalData
  } = useNodeEditorForm(nodeData, readOnly);

  const tabs = useMemo(() => getTabsForNode(formData?.kind), [formData?.kind]);

  const effectiveInheritedProps = useMemo(() => {
    if (!formData || !originalData) return inheritedProps;
    return inheritedProps.filter((prop) => !hasFieldChanged(prop, formData, originalData));
  }, [inheritedProps, formData, originalData]);

  const { handleApply, handleSave } = useApplySaveHandlers(
    formData,
    onApply,
    onSave,
    resetAfterApply
  );

  useFooterControlsRef(
    onFooterRef,
    Boolean(formData),
    handleApply,
    handleSave,
    hasChanges,
    discardChanges
  );

  if (!formData) return null;

  const tabProps = {
    data: formData,
    onChange: handleChange,
    inheritedProps: effectiveInheritedProps
  };

  return (
    <EditorPanel
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={(id) => setActiveTab(id as NodeEditorTabId)}
      tabProps={tabProps}
      readOnly={readOnly}
    />
  );
};
