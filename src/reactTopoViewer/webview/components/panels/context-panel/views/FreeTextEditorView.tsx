// Text annotation editor for the ContextPanel.
import React, { useCallback } from "react";

import type { FreeTextAnnotation } from "../../../../../shared/types/topology";
import { useGenericFormState, useEditorHandlersWithFooterRef } from "../../../../hooks/editor";
import Box from "@mui/material/Box";

import { FIELDSET_RESET_STYLE } from "../ContextPanelScrollArea";
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
  const { formData, updateField, hasChanges, resetInitialData, discardChanges } =
    useGenericFormState(annotation, { getIsNew: (a) => a?.text === "" });

  const validateSave = useCallback((data: FreeTextAnnotation) => canSave(data), []);

  const canSaveNow = formData ? canSave(formData) : false;
  useEditorHandlersWithFooterRef({
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
    <Box sx={{ flex: 1, overflow: "auto" }}>
      <fieldset disabled={readOnly} style={FIELDSET_RESET_STYLE}>
        <FreeTextFormContent
          formData={formData}
          updateField={effectiveUpdateField}
        />
      </fieldset>
    </Box>
  );
};
