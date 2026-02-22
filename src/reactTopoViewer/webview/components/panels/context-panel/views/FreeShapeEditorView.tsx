// Shape annotation editor for the ContextPanel.
import React from "react";
import Box from "@mui/material/Box";

import type { FreeShapeAnnotation } from "../../../../../shared/types/topology";
import { useGenericFormState, useEditorHandlersWithFooterRef } from "../../../../hooks/editor";
import { normalizeShapeAnnotationColors } from "../../../../utils/color";
import { FIELDSET_RESET_STYLE } from "../ContextPanelScrollArea";
import { FreeShapeFormContent } from "../../free-shape-editor/FreeShapeFormContent";
import { useAnnotationPreviewCommit } from "./useAnnotationPreviewCommit";

export interface FreeShapeEditorViewProps {
  annotation: FreeShapeAnnotation | null;
  onSave: (annotation: FreeShapeAnnotation) => void;
  /** Live-preview changes on the canvas (visual only, no persist) */
  onPreview?: (annotation: FreeShapeAnnotation) => boolean;
  /** Remove preview-only annotation (used when discarding a new annotation). */
  onPreviewDelete?: (id: string) => void;
  onClose: () => void;
  onDelete?: (id: string) => void;
  /** Disable editing, but keep scrolling available */
  readOnly?: boolean;
  onFooterRef?: (ref: FreeShapeEditorFooterRef | null) => void;
}

export interface FreeShapeEditorFooterRef {
  handleApply: () => void;
  handleSave: () => void;
  handleDiscard: () => void;
  hasChanges: boolean;
}

export const FreeShapeEditorView: React.FC<FreeShapeEditorViewProps> = ({
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
      transformData: normalizeShapeAnnotationColors
    });

  const { saveWithCommit, discardWithRevert } = useAnnotationPreviewCommit({
    annotation,
    formData,
    readOnly,
    onPreview,
    onPreviewDelete,
    onSave,
    discardChanges,
    snapshot: normalizeShapeAnnotationColors
  });

  useEditorHandlersWithFooterRef({
    formData,
    onSave: saveWithCommit,
    onClose,
    onDelete,
    resetInitialData,
    discardChanges: discardWithRevert,
    onFooterRef,
    hasChangesForFooter: hasChanges
  });

  if (!formData) return null;

  const effectiveUpdateField: typeof updateField = readOnly ? () => {} : updateField;

  return (
    <Box sx={{ flex: 1, overflow: "auto" }}>
      <fieldset disabled={readOnly} style={FIELDSET_RESET_STYLE}>
        <FreeShapeFormContent formData={formData} updateField={effectiveUpdateField} />
      </fieldset>
    </Box>
  );
};
