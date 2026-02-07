/**
 * FreeTextEditorView - Text annotation editor content for the ContextPanel
 */
import React, { useCallback, useEffect } from "react";
import Box from "@mui/material/Box";

import type { FreeTextAnnotation } from "../../../../../shared/types/topology";
import { useGenericFormState, useEditorHandlers } from "../../../../hooks/editor";
import { FreeTextFormContent } from "../../free-text-editor/FreeTextFormContent";

export interface FreeTextEditorViewProps {
  annotation: FreeTextAnnotation | null;
  onSave: (annotation: FreeTextAnnotation) => void;
  onClose: () => void;
  onDelete?: (id: string) => void;
  onFooterRef?: (ref: FreeTextEditorFooterRef | null) => void;
}

export interface FreeTextEditorFooterRef {
  handleApply: () => void;
  handleSave: () => void;
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
  onFooterRef
}) => {
  const { formData, updateField, hasChanges, resetInitialData, isNew } = useGenericFormState(
    annotation,
    { getIsNew: (a) => a?.text === "" }
  );

  const validateSave = useCallback((data: FreeTextAnnotation) => canSave(data), []);

  const { handleApply, handleSaveAndClose, handleDelete } = useEditorHandlers({
    formData,
    onSave,
    onClose,
    onDelete,
    resetInitialData,
    canSave: validateSave
  });

  useEffect(() => {
    if (onFooterRef) {
      const canSaveNow = formData ? canSave(formData) : false;
      onFooterRef(formData ? { handleApply, handleSave: handleSaveAndClose, hasChanges: hasChanges && canSaveNow } : null);
    }
  }, [onFooterRef, formData, handleApply, handleSaveAndClose, hasChanges]);

  if (!formData) return null;

  return (
    <Box sx={{ p: 2, overflow: "auto", flex: 1 }}>
      <FreeTextFormContent
        formData={formData}
        updateField={updateField}
        isNew={isNew}
        onDelete={onDelete ? handleDelete : undefined}
      />
    </Box>
  );
};
