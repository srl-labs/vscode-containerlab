/**
 * FreeShapeEditorView - Shape annotation editor content for the ContextPanel
 */
import React from "react";

import type { FreeShapeAnnotation } from "../../../../../shared/types/topology";
import { useGenericFormState, useEditorHandlersWithFooterRef } from "../../../../hooks/editor";
import { normalizeShapeAnnotationColors } from "../../../../utils/color";
import { ContextPanelScrollArea } from "../ContextPanelScrollArea";
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

  const { handleDelete } = useEditorHandlersWithFooterRef({
    formData,
    onSave,
    onClose,
    onDelete,
    resetInitialData,
    onFooterRef,
    hasChangesForFooter: hasChanges
  });

  if (!formData) return null;

  return (
    <ContextPanelScrollArea>
      <FreeShapeFormContent
        formData={formData}
        updateField={updateField}
        isNew={isNew}
        onDelete={onDelete ? handleDelete : undefined}
      />
    </ContextPanelScrollArea>
  );
};
