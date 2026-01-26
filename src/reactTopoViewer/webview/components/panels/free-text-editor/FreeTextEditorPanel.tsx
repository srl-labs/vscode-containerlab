/**
 * Free Text Editor Panel - Draggable editor panel for text annotations
 * Uses BasePanel directly (no tabs needed)
 */
import React, { useCallback } from "react";

import { BasePanel } from "../../ui/editor/BasePanel";
import type { FreeTextAnnotation } from "../../../../shared/types/topology";
import { useGenericFormState, useEditorHandlers } from "../../../hooks/panels/useGenericFormState";

import { FreeTextFormContent } from "./FreeTextFormContent";

interface FreeTextEditorPanelProps {
  isVisible: boolean;
  annotation: FreeTextAnnotation | null;
  onClose: () => void;
  onSave: (annotation: FreeTextAnnotation) => void;
  onDelete?: (id: string) => void;
}

const getIsNew = (annotation: FreeTextAnnotation | null) => annotation?.text === "";
const canSave = (data: FreeTextAnnotation) => data.text.trim().length > 0;

export const FreeTextEditorPanel: React.FC<FreeTextEditorPanelProps> = ({
  isVisible,
  annotation,
  onClose,
  onSave,
  onDelete
}) => {
  const { formData, updateField, hasChanges, resetInitialData, isNew } = useGenericFormState(
    annotation,
    { getIsNew }
  );

  // Memoize canSave to avoid recreating on every render
  const validateSave = useCallback((data: FreeTextAnnotation) => canSave(data), []);

  const { handleApply, handleSaveAndClose, handleDelete } = useEditorHandlers({
    formData,
    onSave,
    onClose,
    onDelete,
    resetInitialData,
    canSave: validateSave
  });

  if (!formData) return null;

  const canSaveNow = canSave(formData);

  return (
    <BasePanel
      title={isNew ? "Add Text" : "Edit Text"}
      isVisible={isVisible}
      onClose={onClose}
      onPrimaryClick={handleSaveAndClose}
      onSecondaryClick={handleApply}
      primaryLabel="OK"
      secondaryLabel="Apply"
      hasChanges={hasChanges && canSaveNow}
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
