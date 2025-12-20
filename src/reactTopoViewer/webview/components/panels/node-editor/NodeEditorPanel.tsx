/**
 * Node Editor Panel - Multi-tab editor for node configuration
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';

import type { TabDefinition } from '../../shared/editor';
import { EditorPanel } from '../../shared/editor';

import type { NodeEditorData, NodeEditorTabId } from './types';
import { BasicTab } from './BasicTab';
import { ComponentsTab } from './ComponentsTab';
import { ConfigTab } from './ConfigTab';
import { RuntimeTab } from './RuntimeTab';
import { NetworkTab } from './NetworkTab';
import { AdvancedTab } from './AdvancedTab';

interface NodeEditorPanelProps {
  isVisible: boolean;
  nodeData: NodeEditorData | null;
  onClose: () => void;
  onSave: (data: NodeEditorData) => void;
  onApply: (data: NodeEditorData) => void;
  /** Array of property names that are inherited from defaults/kinds/groups */
  inheritedProps?: string[];
}

/** Base tabs available for all nodes */
const BASE_TABS: TabDefinition[] = [
  { id: 'basic', label: 'Basic' },
  { id: 'config', label: 'Configuration' },
  { id: 'runtime', label: 'Runtime' },
  { id: 'network', label: 'Network' },
  { id: 'advanced', label: 'Advanced' }
];

/** Components tab for SROS nodes */
const COMPONENTS_TAB: TabDefinition = { id: 'components', label: 'Components' };

/** Get tabs based on node kind */
function getTabsForNode(kind: string | undefined): TabDefinition[] {
  if (kind === 'nokia_srsim') {
    // Insert Components tab after Basic tab
    return [BASE_TABS[0], COMPONENTS_TAB, ...BASE_TABS.slice(1)];
  }
  return BASE_TABS;
}

/**
 * Custom hook to manage node editor form state with change tracking
 */
function useNodeEditorForm(nodeData: NodeEditorData | null) {
  const [activeTab, setActiveTab] = useState<NodeEditorTabId>('basic');
  const [formData, setFormData] = useState<NodeEditorData | null>(null);
  // For tracking unsaved changes (reset after Apply)
  const [lastAppliedData, setLastAppliedData] = useState<NodeEditorData | null>(null);
  // For tracking inheritance - original values when node was first loaded (never reset during session)
  const [originalData, setOriginalData] = useState<NodeEditorData | null>(null);
  const [loadedNodeId, setLoadedNodeId] = useState<string | null>(null);

  useEffect(() => {
    // Only reset form when loading a different node (by id)
    if (nodeData && nodeData.id !== loadedNodeId) {
      setFormData({ ...nodeData });
      setLastAppliedData({ ...nodeData });
      setOriginalData({ ...nodeData });
      setLoadedNodeId(nodeData.id);
      setActiveTab('basic');
    } else if (!nodeData && loadedNodeId) {
      // Panel closed - reset loadedNodeId so reopening same node reloads data
      setLoadedNodeId(null);
    }
  }, [nodeData, loadedNodeId]);

  const handleChange = useCallback((updates: Partial<NodeEditorData>) => {
    setFormData(prev => prev ? { ...prev, ...updates } : null);
  }, []);

  // Reset last applied data after apply (to track further changes)
  const resetAfterApply = useCallback(() => {
    if (formData) {
      setLastAppliedData({ ...formData });
    }
  }, [formData]);

  // Check if form has changes compared to last applied state
  const hasChanges = formData && lastAppliedData
    ? JSON.stringify(formData) !== JSON.stringify(lastAppliedData)
    : false;

  return { activeTab, setActiveTab, formData, handleChange, hasChanges, resetAfterApply, originalData };
}

/**
 * Renders the active tab content
 */
const TabContent: React.FC<{
  activeTab: NodeEditorTabId;
  formData: NodeEditorData;
  onChange: (updates: Partial<NodeEditorData>) => void;
  inheritedProps?: string[];
}> = ({ activeTab, formData, onChange, inheritedProps = [] }) => {
  switch (activeTab) {
    case 'basic': return <BasicTab data={formData} onChange={onChange} inheritedProps={inheritedProps} />;
    case 'components': return <ComponentsTab data={formData} onChange={onChange} inheritedProps={inheritedProps} />;
    case 'config': return <ConfigTab data={formData} onChange={onChange} inheritedProps={inheritedProps} />;
    case 'runtime': return <RuntimeTab data={formData} onChange={onChange} inheritedProps={inheritedProps} />;
    case 'network': return <NetworkTab data={formData} onChange={onChange} inheritedProps={inheritedProps} />;
    case 'advanced': return <AdvancedTab data={formData} onChange={onChange} inheritedProps={inheritedProps} />;
    default: return null;
  }
};

/**
 * Get the appropriate panel title based on node type
 */
function getPanelTitle(formData: NodeEditorData | null): string {
  if (!formData) return 'Node Editor';
  if (!formData.isCustomTemplate) return 'Node Editor';

  // For custom templates, check if we're creating or editing
  // edit-custom-node means editing existing, temp-custom-node means creating new
  if (formData.id === 'edit-custom-node') {
    return 'Edit Custom Node Template';
  }
  return 'Create Custom Node Template';
}

/**
 * Maps YAML property names to editor field names for value comparison.
 */
const YAML_TO_EDITOR_MAP: Record<string, keyof NodeEditorData> = {
  'startup-config': 'startupConfig',
  'enforce-startup-config': 'enforceStartupConfig',
  'suppress-startup-config': 'suppressStartupConfig',
  'env-files': 'envFiles',
  'restart-policy': 'restartPolicy',
  'auto-remove': 'autoRemove',
  'startup-delay': 'startupDelay',
  'mgmt-ipv4': 'mgmtIpv4',
  'mgmt-ipv6': 'mgmtIpv6',
  'network-mode': 'networkMode',
  'cpu-set': 'cpuSet',
  'shm-size': 'shmSize',
  'cap-add': 'capAdd',
  'image-pull-policy': 'imagePullPolicy',
};

/**
 * Check if a field value has changed from initial
 */
function hasFieldChanged(
  yamlKey: string,
  formData: NodeEditorData,
  initialData: NodeEditorData
): boolean {
  const editorKey = YAML_TO_EDITOR_MAP[yamlKey] || yamlKey;
  const currentVal = formData[editorKey as keyof NodeEditorData];
  const initialVal = initialData[editorKey as keyof NodeEditorData];
  return JSON.stringify(currentVal) !== JSON.stringify(initialVal);
}

export const NodeEditorPanel: React.FC<NodeEditorPanelProps> = ({
  isVisible,
  nodeData,
  onClose,
  onSave,
  onApply,
  inheritedProps = []
}) => {
  const { activeTab, setActiveTab, formData, handleChange, hasChanges, resetAfterApply, originalData } = useNodeEditorForm(nodeData);

  // Get dynamic tabs based on node kind
  const tabs = useMemo(() => getTabsForNode(formData?.kind), [formData?.kind]);

  // Filter inherited props - only show as inherited if value hasn't changed from ORIGINAL
  // This ensures badge stays gone after Apply if user changed from inherited value
  const effectiveInheritedProps = useMemo(() => {
    if (!formData || !originalData) return inheritedProps;
    return inheritedProps.filter(prop => !hasFieldChanged(prop, formData, originalData));
  }, [inheritedProps, formData, originalData]);

  const handleApply = useCallback(() => {
    if (formData) {
      onApply(formData);
      resetAfterApply(); // Reset change tracking after apply (but NOT originalData)
    }
  }, [formData, onApply, resetAfterApply]);

  const handleSave = useCallback(() => {
    if (formData) onSave(formData);
  }, [formData, onSave]);

  if (!formData) return null;

  const title = getPanelTitle(formData);

  return (
    <EditorPanel
      title={title}
      isVisible={isVisible}
      onClose={onClose}
      onApply={handleApply}
      onSave={handleSave}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={(id) => setActiveTab(id as NodeEditorTabId)}
      storageKey="node-editor"
      width={420}
      hasChanges={hasChanges}
      testId="node-editor"
    >
      <TabContent activeTab={activeTab} formData={formData} onChange={handleChange} inheritedProps={effectiveInheritedProps} />
    </EditorPanel>
  );
};
