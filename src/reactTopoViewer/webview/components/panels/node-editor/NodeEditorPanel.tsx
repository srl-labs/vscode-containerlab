/**
 * Node Editor Panel - Multi-tab editor for node configuration
 */
import React, { useState, useEffect, useCallback } from 'react';
import { EditorPanel, TabDefinition } from '../../shared/editor';
import { NodeEditorData, NodeEditorTabId } from './types';
import { BasicTab } from './BasicTab';
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
}

const TABS: TabDefinition[] = [
  { id: 'basic', label: 'Basic' },
  { id: 'config', label: 'Configuration' },
  { id: 'runtime', label: 'Runtime' },
  { id: 'network', label: 'Network' },
  { id: 'advanced', label: 'Advanced' }
];

/**
 * Custom hook to manage node editor form state
 */
function useNodeEditorForm(nodeData: NodeEditorData | null) {
  const [activeTab, setActiveTab] = useState<NodeEditorTabId>('basic');
  const [formData, setFormData] = useState<NodeEditorData | null>(null);

  useEffect(() => {
    if (nodeData) {
      setFormData({ ...nodeData });
      setActiveTab('basic');
    }
  }, [nodeData]);

  const handleChange = useCallback((updates: Partial<NodeEditorData>) => {
    setFormData(prev => prev ? { ...prev, ...updates } : null);
  }, []);

  return { activeTab, setActiveTab, formData, handleChange };
}

/**
 * Renders the active tab content
 */
const TabContent: React.FC<{
  activeTab: NodeEditorTabId;
  formData: NodeEditorData;
  onChange: (updates: Partial<NodeEditorData>) => void;
}> = ({ activeTab, formData, onChange }) => {
  switch (activeTab) {
    case 'basic': return <BasicTab data={formData} onChange={onChange} />;
    case 'config': return <ConfigTab data={formData} onChange={onChange} />;
    case 'runtime': return <RuntimeTab data={formData} onChange={onChange} />;
    case 'network': return <NetworkTab data={formData} onChange={onChange} />;
    case 'advanced': return <AdvancedTab data={formData} onChange={onChange} />;
    default: return null;
  }
};

export const NodeEditorPanel: React.FC<NodeEditorPanelProps> = ({
  isVisible,
  nodeData,
  onClose,
  onSave,
  onApply
}) => {
  const { activeTab, setActiveTab, formData, handleChange } = useNodeEditorForm(nodeData);

  const handleApply = useCallback(() => {
    if (formData) onApply(formData);
  }, [formData, onApply]);

  const handleSave = useCallback(() => {
    if (formData) onSave(formData);
  }, [formData, onSave]);

  if (!formData) return null;

  return (
    <EditorPanel
      title="Node Editor"
      isVisible={isVisible}
      onClose={onClose}
      onApply={handleApply}
      onSave={handleSave}
      tabs={TABS}
      activeTab={activeTab}
      onTabChange={(id) => setActiveTab(id as NodeEditorTabId)}
      storageKey="node-editor"
      width={420}
    >
      <TabContent activeTab={activeTab} formData={formData} onChange={handleChange} />
    </EditorPanel>
  );
};
