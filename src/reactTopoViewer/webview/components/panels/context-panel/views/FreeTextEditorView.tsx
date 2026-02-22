// Text annotation editor for the ContextPanel.
import React from "react";
import Box from "@mui/material/Box";

import type { FreeTextAnnotation } from "../../../../../shared/types/topology";
import { useGenericFormState, useEditorHandlersWithFooterRef } from "../../../../hooks/editor";
import { FIELDSET_RESET_STYLE } from "../ContextPanelScrollArea";
import { FreeTextFormContent } from "../../free-text-editor/FreeTextFormContent";
import { useAnnotationPreviewCommit } from "./useAnnotationPreviewCommit";

export interface FreeTextEditorViewProps {
  annotation: FreeTextAnnotation | null;
  onSave: (annotation: FreeTextAnnotation) => void;
  /** Live-preview changes on the canvas (visual only, no persist) */
  onPreview?: (annotation: FreeTextAnnotation) => boolean;
  /** Remove preview-only annotation (used when discarding a new annotation). */
  onPreviewDelete?: (id: string) => void;
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

function cloneAnnotation(annotation: FreeTextAnnotation): FreeTextAnnotation {
  return { ...annotation };
}

export const FreeTextEditorView: React.FC<FreeTextEditorViewProps> = ({
  annotation,
  onSave,
  onPreview,
  onPreviewDelete,
  onClose,
  onDelete,
  readOnly = false,
  onFooterRef
}) => {
  const { formData, updateField, hasChanges, resetInitialData, discardChanges } =
    useGenericFormState(annotation, {
      getIsNew: (a) => a?.text === ""
    });

  const { saveWithCommit, discardWithRevert } = useAnnotationPreviewCommit({
    annotation,
    formData,
    readOnly,
    onPreview,
    onPreviewDelete,
    onSave,
    discardChanges,
    snapshot: cloneAnnotation
  });

  const canSaveNow = formData ? canSave(formData) : false;
  useEditorHandlersWithFooterRef({
    formData,
    onSave: saveWithCommit,
    onClose,
    onDelete,
    resetInitialData,
    discardChanges: discardWithRevert,
    onFooterRef,
    canSave,
    hasChangesForFooter: hasChanges && canSaveNow
  });

  if (!formData) return null;

  const effectiveUpdateField: typeof updateField = readOnly ? () => {} : updateField;

  return (
    <Box sx={{ flex: 1, overflow: "auto" }}>
      <fieldset disabled={readOnly} style={FIELDSET_RESET_STYLE}>
        <FreeTextFormContent formData={formData} updateField={effectiveUpdateField} />
      </fieldset>
    </Box>
  );
};
