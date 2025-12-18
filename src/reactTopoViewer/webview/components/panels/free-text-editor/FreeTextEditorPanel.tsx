/**
 * Free Text Editor Panel - Draggable editor panel for text annotations
 * Uses BasePanel directly (no tabs needed)
 */
import React, { useState, useEffect, useCallback } from 'react';
import { BasePanel } from '../../shared/editor/BasePanel';
import { FreeTextAnnotation } from '../../../../shared/types/topology';
import { FreeTextFormContent } from './FreeTextFormContent';

interface FreeTextEditorPanelProps {
  isVisible: boolean;
  annotation: FreeTextAnnotation | null;
  onClose: () => void;
  onSave: (annotation: FreeTextAnnotation) => void;
  onDelete?: (id: string) => void;
}

/**
 * Hook to manage form state with change tracking
 */
function useFreeTextForm(annotation: FreeTextAnnotation | null) {
  const [formData, setFormData] = useState<FreeTextAnnotation | null>(null);
  const [initialData, setInitialData] = useState<string | null>(null);

  useEffect(() => {
    if (annotation) {
      setFormData({ ...annotation });
      setInitialData(JSON.stringify(annotation));
    }
  }, [annotation]);

  const updateField = useCallback(<K extends keyof FreeTextAnnotation>(
    field: K,
    value: FreeTextAnnotation[K]
  ) => {
    setFormData(prev => prev ? { ...prev, [field]: value } : null);
  }, []);

  const resetInitialData = useCallback(() => {
    if (formData) setInitialData(JSON.stringify(formData));
  }, [formData]);

  const hasChanges = formData && initialData ? JSON.stringify(formData) !== initialData : false;
  const isNew = annotation?.text === '';

  return { formData, updateField, hasChanges, resetInitialData, isNew };
}

export const FreeTextEditorPanel: React.FC<FreeTextEditorPanelProps> = ({
  isVisible,
  annotation,
  onClose,
  onSave,
  onDelete
}) => {
  const { formData, updateField, hasChanges, resetInitialData, isNew } = useFreeTextForm(annotation);

  const handleApply = useCallback(() => {
    if (formData?.text.trim()) {
      onSave(formData);
      resetInitialData();
    }
  }, [formData, onSave, resetInitialData]);

  const handleSaveAndClose = useCallback(() => {
    if (formData?.text.trim()) {
      onSave(formData);
      onClose();
    }
  }, [formData, onSave, onClose]);

  const handleDelete = useCallback(() => {
    if (formData && onDelete) {
      onDelete(formData.id);
      onClose();
    }
  }, [formData, onDelete, onClose]);

  if (!formData) return null;

  const canSave = formData.text.trim().length > 0;

  return (
    <BasePanel
      title={isNew ? 'Add Text' : 'Edit Text'}
      isVisible={isVisible}
      onClose={onClose}
      onPrimaryClick={handleSaveAndClose}
      onSecondaryClick={handleApply}
      primaryLabel="OK"
      secondaryLabel="Apply"
      hasChanges={hasChanges && canSave}
      storageKey="free-text-editor"
      width={400}
      testId="free-text-editor"
    >
      <FreeTextFormContent
        formData={formData}
        updateField={updateField}
        isNew={isNew}
        onDelete={onDelete ? handleDelete : undefined}
      />
    </BasePanel>
  );
};
