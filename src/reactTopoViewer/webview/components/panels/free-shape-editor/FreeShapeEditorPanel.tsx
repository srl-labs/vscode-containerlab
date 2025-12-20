/**
 * Free Shape Editor Panel - Draggable editor panel for shape annotations
 * Uses BasePanel directly (no tabs needed)
 */
import React, { useState, useEffect, useCallback } from 'react';

import { BasePanel } from '../../shared/editor/BasePanel';
import type { FreeShapeAnnotation } from '../../../../shared/types/topology';

import { FreeShapeFormContent } from './FreeShapeFormContent';

interface FreeShapeEditorPanelProps {
  isVisible: boolean;
  annotation: FreeShapeAnnotation | null;
  onClose: () => void;
  onSave: (annotation: FreeShapeAnnotation) => void;
  onDelete?: (id: string) => void;
}

/**
 * Hook to manage form state with change tracking
 */
function useFreeShapeForm(annotation: FreeShapeAnnotation | null) {
  const [formData, setFormData] = useState<FreeShapeAnnotation | null>(null);
  const [initialData, setInitialData] = useState<string | null>(null);

  useEffect(() => {
    if (annotation) {
      setFormData({ ...annotation });
      setInitialData(JSON.stringify(annotation));
    }
  }, [annotation]);

  const updateField = useCallback(<K extends keyof FreeShapeAnnotation>(
    field: K,
    value: FreeShapeAnnotation[K]
  ) => {
    setFormData(prev => prev ? { ...prev, [field]: value } : null);
  }, []);

  const resetInitialData = useCallback(() => {
    if (formData) setInitialData(JSON.stringify(formData));
  }, [formData]);

  const hasChanges = formData && initialData ? JSON.stringify(formData) !== initialData : false;
  // Shapes are never "new" in the same way text is (text needs content to be valid)
  const isNew = false;

  return { formData, updateField, hasChanges, resetInitialData, isNew };
}

export const FreeShapeEditorPanel: React.FC<FreeShapeEditorPanelProps> = ({
  isVisible,
  annotation,
  onClose,
  onSave,
  onDelete
}) => {
  const { formData, updateField, hasChanges, resetInitialData, isNew } = useFreeShapeForm(annotation);

  const handleApply = useCallback(() => {
    if (formData) {
      onSave(formData);
      resetInitialData();
    }
  }, [formData, onSave, resetInitialData]);

  const handleSaveAndClose = useCallback(() => {
    if (formData) {
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

  const titlePrefix = formData.shapeType.charAt(0).toUpperCase() + formData.shapeType.slice(1);

  return (
    <BasePanel
      title={`Edit ${titlePrefix}`}
      isVisible={isVisible}
      onClose={onClose}
      onPrimaryClick={handleSaveAndClose}
      onSecondaryClick={handleApply}
      primaryLabel="OK"
      secondaryLabel="Apply"
      hasChanges={hasChanges}
      storageKey="free-shape-editor"
      width={380}
      testId="free-shape-editor"
    >
      <FreeShapeFormContent
        formData={formData}
        updateField={updateField}
        isNew={isNew}
        onDelete={onDelete ? handleDelete : undefined}
      />
    </BasePanel>
  );
};
