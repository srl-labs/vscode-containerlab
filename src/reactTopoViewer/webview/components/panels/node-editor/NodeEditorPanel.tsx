/**
 * Node Editor Panel - Multi-tab editor for node configuration
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { EditorPanel, TabDefinition } from '../../shared/editor';
import { NodeEditorData, NodeEditorTabId } from './types';
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
  const [initialData, setInitialData] = useState<string | null>(null);

  useEffect(() => {
    if (nodeData) {
      setFormData({ ...nodeData });
      setInitialData(JSON.stringify(nodeData));
      setActiveTab('basic');
    }
  }, [nodeData]);

  const handleChange = useCallback((updates: Partial<NodeEditorData>) => {
    setFormData(prev => prev ? { ...prev, ...updates } : null);
  }, []);

  // Reset initial data after apply (to track further changes from the applied state)
  const resetInitialData = useCallback(() => {
    if (formData) {
      setInitialData(JSON.stringify(formData));
    }
  }, [formData]);

  // Check if form has changes compared to initial state
  const hasChanges = formData && initialData
    ? JSON.stringify(formData) !== initialData
    : false;

  return { activeTab, setActiveTab, formData, handleChange, hasChanges, resetInitialData };
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

export const NodeEditorPanel: React.FC<NodeEditorPanelProps> = ({
  isVisible,
  nodeData,
  onClose,
  onSave,
  onApply,
  inheritedProps = []
}) => {
  const { activeTab, setActiveTab, formData, handleChange, hasChanges, resetInitialData } = useNodeEditorForm(nodeData);

  // Get dynamic tabs based on node kind
  const tabs = useMemo(() => getTabsForNode(formData?.kind), [formData?.kind]);

  const handleApply = useCallback(() => {
    if (formData) {
      onApply(formData);
      resetInitialData(); // Reset tracking after apply
    }
  }, [formData, onApply, resetInitialData]);

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
      <TabContent activeTab={activeTab} formData={formData} onChange={handleChange} inheritedProps={inheritedProps} />
    </EditorPanel>
  );
};
