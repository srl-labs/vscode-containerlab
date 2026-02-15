// Text annotation editor for the ContextPanel.
import React, { useCallback } from "react";

import type { FreeTextAnnotation } from "../../../../../shared/types/topology";
import { useGenericFormState, useEditorHandlersWithFooterRef } from "../../../../hooks/editor";
import { EditorFieldset } from "../ContextPanelScrollArea";
import { FreeTextFormContent } from "../../free-text-editor/FreeTextFormContent";

export interface FreeTextEditorViewProps {
  annotation: FreeTextAnnotation | null;
  onSave: (annotation: FreeTextAnnotation) => void;
  onClose: () => void;
  onDelete?: (id: string) => void;
  /** Disable editing, but keep scrolling available */
  readOnly?: boolean;
  onFooterRef?: (ref: FreeTextEditorFooterRef | null) => void;
}

export interface FreeTextEditorFooterRef {
  handleApply: () => void;
  handleSave: () => void;
  handleDiscard: () => void;
  hasChanges: boolean;
}

function canSave(data: FreeTextAnnotation): boolean {
  return data.text.trim().length > 0;
}

export const FreeTextEditorView: React.FC<FreeTextEditorViewProps> = ({
  annotation,
  onSave,
  onClose,
  onDelete,
  readOnly = false,
  onFooterRef
}) => {
  const { formData, updateField, hasChanges, resetInitialData, discardChanges, isNew } =
    useGenericFormState(annotation, { getIsNew: (a) => a?.text === "" });

  const validateSave = useCallback((data: FreeTextAnnotation) => canSave(data), []);

  const canSaveNow = formData ? canSave(formData) : false;
  const { handleDelete } = useEditorHandlersWithFooterRef({
    formData,
    onSave,
    onClose,
    onDelete,
    resetInitialData,
    discardChanges,
    onFooterRef,
    canSave: validateSave,
    hasChangesForFooter: hasChanges && canSaveNow
  });

  if (!formData) return null;

  const effectiveUpdateField: typeof updateField = readOnly ? () => {} : updateField;

  return (
    <EditorFieldset readOnly={readOnly}>
      <FreeTextFormContent
        formData={formData}
        updateField={effectiveUpdateField}
        isNew={isNew}
        onDelete={!readOnly && onDelete ? handleDelete : undefined}
      />
    </EditorFieldset>
  );
};
