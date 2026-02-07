/**
 * FreeShapeEditorView - Shape annotation editor content for the ContextPanel
 */
import React, { useEffect } from "react";
import Box from "@mui/material/Box";

import type { FreeShapeAnnotation } from "../../../../../shared/types/topology";
import { useGenericFormState, useEditorHandlers } from "../../../../hooks/editor";
import { normalizeShapeAnnotationColors } from "../../../../utils/color";
import { FreeShapeFormContent } from "../../free-shape-editor/FreeShapeFormContent";

export interface FreeShapeEditorViewProps {
  annotation: FreeShapeAnnotation | null;
  onSave: (annotation: FreeShapeAnnotation) => void;
  onClose: () => void;
  onDelete?: (id: string) => void;
  onFooterRef?: (ref: FreeShapeEditorFooterRef | null) => void;
}

export interface FreeShapeEditorFooterRef {
  handleApply: () => void;
  handleSave: () => void;
  hasChanges: boolean;
}

export const FreeShapeEditorView: React.FC<FreeShapeEditorViewProps> = ({
  annotation,
  onSave,
  onClose,
  onDelete,
  onFooterRef
}) => {
  const { formData, updateField, hasChanges, resetInitialData, isNew } = useGenericFormState(
    annotation,
    { transformData: normalizeShapeAnnotationColors }
  );

  const { handleApply, handleSaveAndClose, handleDelete } = useEditorHandlers({
    formData,
    onSave,
    onClose,
    onDelete,
    resetInitialData
  });

  useEffect(() => {
    if (onFooterRef) {
      onFooterRef(formData ? { handleApply, handleSave: handleSaveAndClose, hasChanges } : null);
    }
  }, [onFooterRef, formData, handleApply, handleSaveAndClose, hasChanges]);

  if (!formData) return null;

  return (
    <Box sx={{ p: 2, overflow: "auto", flex: 1 }}>
      <FreeShapeFormContent
        formData={formData}
        updateField={updateField}
        isNew={isNew}
        onDelete={onDelete ? handleDelete : undefined}
      />
    </Box>
  );
};
