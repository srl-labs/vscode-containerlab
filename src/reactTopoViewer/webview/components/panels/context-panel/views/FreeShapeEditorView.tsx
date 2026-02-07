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
  /** Disable editing, but keep scrolling available */
  readOnly?: boolean;
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
  readOnly = false,
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

  const effectiveUpdateField: typeof updateField = readOnly ? (() => {}) : updateField;
  const fieldsetStyle: React.CSSProperties = {
    border: 0,
    margin: 0,
    padding: 0,
    minInlineSize: 0
  };

  return (
    <ContextPanelScrollArea>
      <fieldset disabled={readOnly} style={fieldsetStyle}>
        <FreeShapeFormContent
          formData={formData}
          updateField={effectiveUpdateField}
          isNew={isNew}
          onDelete={!readOnly && onDelete ? handleDelete : undefined}
        />
      </fieldset>
    </ContextPanelScrollArea>
  );
};
