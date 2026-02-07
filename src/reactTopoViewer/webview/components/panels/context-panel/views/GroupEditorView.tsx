/**
 * GroupEditorView - Group editor content for the ContextPanel
 */
import React, { useCallback } from "react";

import type { GroupStyleAnnotation } from "../../../../../shared/types/topology";
import type { GroupEditorData } from "../../../../hooks/canvas";
import { useGenericFormState, useEditorHandlersWithFooterRef } from "../../../../hooks/editor";
import { ContextPanelScrollArea } from "../ContextPanelScrollArea";
import { GroupFormContent } from "../../group-editor/GroupFormContent";

export interface GroupEditorViewProps {
  groupData: GroupEditorData | null;
  onSave: (data: GroupEditorData) => void;
  onClose: () => void;
  onDelete?: (groupId: string) => void;
  onStyleChange?: (groupId: string, style: Partial<GroupStyleAnnotation>) => void;
  /** Disable editing, but keep scrolling available */
  readOnly?: boolean;
  onFooterRef?: (ref: GroupEditorFooterRef | null) => void;
}

export interface GroupEditorFooterRef {
  handleApply: () => void;
  handleSave: () => void;
  hasChanges: boolean;
}

export const GroupEditorView: React.FC<GroupEditorViewProps> = ({
  groupData,
  onSave,
  onClose,
  onDelete,
  onStyleChange,
  readOnly = false,
  onFooterRef
}) => {
  const transformData = useCallback(
    (data: GroupEditorData) => ({ ...data, style: { ...data.style } }),
    []
  );

  const { formData, updateField, hasChanges, resetInitialData, setFormData } = useGenericFormState(
    groupData,
    { transformData }
  );

  const updateStyle = useCallback(
    <K extends keyof GroupStyleAnnotation>(field: K, value: GroupStyleAnnotation[K]) => {
      if (readOnly) return;
      setFormData((prev) => {
        if (!prev) return null;
        if (onStyleChange) onStyleChange(prev.id, { [field]: value });
        return { ...prev, style: { ...prev.style, [field]: value } };
      });
    },
    [setFormData, onStyleChange, readOnly]
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
        <GroupFormContent
          formData={formData}
          updateField={effectiveUpdateField}
          updateStyle={updateStyle}
          onDelete={!readOnly && onDelete ? handleDelete : undefined}
        />
      </fieldset>
    </ContextPanelScrollArea>
  );
};
