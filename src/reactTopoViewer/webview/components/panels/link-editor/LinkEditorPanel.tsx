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

const TABS: TabDefinition[] = [
  { id: 'basic', label: 'Basic' },
  { id: 'extended', label: 'Extended' }
];

/**
 * Custom hook to manage link editor form state
 */
function useLinkEditorForm(linkData: LinkEditorData | null) {
  const [activeTab, setActiveTab] = useState<LinkEditorTabId>('basic');
  const [formData, setFormData] = useState<LinkEditorData | null>(null);

  useEffect(() => {
    if (linkData) {
      setFormData({ ...linkData });
      setActiveTab('basic');
    }
  }, [linkData]);

  const handleChange = useCallback((updates: Partial<LinkEditorData>) => {
    setFormData(prev => prev ? { ...prev, ...updates } : null);
  }, []);

  return { activeTab, setActiveTab, formData, handleChange };
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
  const { activeTab, setActiveTab, formData, handleChange } = useLinkEditorForm(linkData);

  const validationErrors = useMemo(() => {
    if (!formData) return [];
    return validateLinkEditorData(formData);
  }, [formData]);

  const handleApply = useCallback(() => {
    if (formData && validationErrors.length === 0) {
      onApply(formData);
    }
  }, [formData, validationErrors, onApply]);

  const handleSave = useCallback(() => {
    if (formData && validationErrors.length === 0) {
      onSave(formData);
    }
  }, [formData, validationErrors, onSave]);

  if (!formData) return null;

  const isNewLink = !linkData?.id || linkData.id.startsWith('temp-');
  const title = isNewLink ? 'Create Link' : 'Link Editor';

  return (
    <EditorPanel
      title={title}
      isVisible={isVisible}
      onClose={onClose}
      onApply={handleApply}
      onSave={handleSave}
      tabs={TABS}
      activeTab={activeTab}
      onTabChange={(id) => setActiveTab(id as LinkEditorTabId)}
      storageKey="link-editor"
      width={400}
    >
      <ValidationBanner errors={validationErrors} />
      <TabContent
        activeTab={activeTab}
        formData={formData}
        onChange={handleChange}
      />
    </EditorPanel>
  );
};
