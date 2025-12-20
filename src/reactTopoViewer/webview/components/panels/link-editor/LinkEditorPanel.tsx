/**
 * Link Editor Panel - Multi-tab editor for link configuration
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';

import { EditorPanel, TabDefinition } from '../../shared/editor';

import { LinkEditorData, LinkEditorTabId } from './types';
import { BasicTab } from './BasicTab';
import { ExtendedTab, validateLinkEditorData } from './ExtendedTab';

interface LinkEditorPanelProps {
  isVisible: boolean;
  linkData: LinkEditorData | null;
  onClose: () => void;
  onSave: (data: LinkEditorData) => void;
  onApply: (data: LinkEditorData) => void;
}

const ALL_TABS: TabDefinition[] = [
  { id: 'basic', label: 'Basic' },
  { id: 'extended', label: 'Extended' }
];

const BASIC_ONLY_TABS: TabDefinition[] = [
  { id: 'basic', label: 'Basic' }
];

/**
 * Custom hook to manage link editor form state with change tracking
 */
function useLinkEditorForm(linkData: LinkEditorData | null) {
  const [activeTab, setActiveTab] = useState<LinkEditorTabId>('basic');
  const [formData, setFormData] = useState<LinkEditorData | null>(null);
  const [initialData, setInitialData] = useState<string | null>(null);

  useEffect(() => {
    if (linkData) {
      setFormData({ ...linkData });
      setInitialData(JSON.stringify(linkData));
      setActiveTab('basic');
    }
  }, [linkData]);

  const handleChange = useCallback((updates: Partial<LinkEditorData>) => {
    setFormData(prev => prev ? { ...prev, ...updates } : null);
  }, []);

  // Reset initial data after apply (to track further changes from the applied state)
  // Also update the original values to the current values so subsequent saves work
  const resetAfterApply = useCallback(() => {
    if (formData) {
      // Update original values to current values (the link in YAML now has these)
      const updatedFormData: LinkEditorData = {
        ...formData,
        originalSource: formData.source,
        originalTarget: formData.target,
        originalSourceEndpoint: formData.sourceEndpoint,
        originalTargetEndpoint: formData.targetEndpoint,
      };
      setFormData(updatedFormData);
      setInitialData(JSON.stringify(updatedFormData));
    }
  }, [formData]);

  // Check if form has changes compared to initial state
  const hasChanges = formData && initialData
    ? JSON.stringify(formData) !== initialData
    : false;

  return { activeTab, setActiveTab, formData, handleChange, hasChanges, resetAfterApply };
}

/**
 * Renders the active tab content
 */
const TabContent: React.FC<{
  activeTab: LinkEditorTabId;
  formData: LinkEditorData;
  onChange: (updates: Partial<LinkEditorData>) => void;
}> = ({ activeTab, formData, onChange }) => {
  switch (activeTab) {
    case 'basic':
      return <BasicTab data={formData} onChange={onChange} />;
    case 'extended':
      return <ExtendedTab data={formData} onChange={onChange} />;
    default:
      return null;
  }
};

/**
 * Validation banner component
 */
const ValidationBanner: React.FC<{ errors: string[] }> = ({ errors }) => {
  if (errors.length === 0) return null;

  return (
    <div
      className="mb-2 p-2 rounded"
      style={{
        backgroundColor: 'var(--vscode-inputValidation-errorBackground)',
        border: '1px solid var(--vscode-inputValidation-errorBorder)'
      }}
    >
      <div className="text-[var(--vscode-editorError-foreground)] text-sm font-semibold">
        Invalid link configuration
      </div>
      <div className="text-[var(--vscode-editorError-foreground)] text-xs mt-1">
        {errors.map((error, i) => (
          <div key={i}>{error}</div>
        ))}
      </div>
    </div>
  );
};

export const LinkEditorPanel: React.FC<LinkEditorPanelProps> = ({
  isVisible,
  linkData,
  onClose,
  onSave,
  onApply
}) => {
  const { activeTab, setActiveTab, formData, handleChange, hasChanges, resetAfterApply } = useLinkEditorForm(linkData);

  const validationErrors = useMemo(() => {
    if (!formData) return [];
    return validateLinkEditorData(formData);
  }, [formData]);

  const handleApply = useCallback(() => {
    if (formData && validationErrors.length === 0) {
      onApply(formData);
      resetAfterApply(); // Reset tracking and update original values after apply
    }
  }, [formData, validationErrors, onApply, resetAfterApply]);

  const handleSave = useCallback(() => {
    if (formData && validationErrors.length === 0) {
      onSave(formData);
    }
  }, [formData, validationErrors, onSave]);

  if (!formData) return null;

  const isNewLink = !linkData?.id || linkData.id.startsWith('temp-');
  const title = isNewLink ? 'Create Link' : 'Link Editor';

  // Only show Extended tab for veth links (both endpoints are regular nodes)
  const isVethLink = !formData.sourceIsNetwork && !formData.targetIsNetwork;
  const tabs = isVethLink ? ALL_TABS : BASIC_ONLY_TABS;

  // Force basic tab if on extended tab but not a veth link
  const effectiveActiveTab = (!isVethLink && activeTab === 'extended') ? 'basic' : activeTab;

  return (
    <EditorPanel
      title={title}
      isVisible={isVisible}
      onClose={onClose}
      onApply={handleApply}
      onSave={handleSave}
      tabs={tabs}
      activeTab={effectiveActiveTab}
      onTabChange={(id) => setActiveTab(id as LinkEditorTabId)}
      storageKey="link-editor"
      width={400}
      hasChanges={hasChanges}
      testId="link-editor"
    >
      <ValidationBanner errors={validationErrors} />
      <TabContent
        activeTab={effectiveActiveTab}
        formData={formData}
        onChange={handleChange}
      />
    </EditorPanel>
  );
};
