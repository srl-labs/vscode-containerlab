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
      setFormData((prev) => {
        if (!prev) return null;
        if (onStyleChange) onStyleChange(prev.id, { [field]: value });
        return { ...prev, style: { ...prev.style, [field]: value } };
      });
    },
    [setFormData, onStyleChange]
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
      <GroupFormContent
        formData={formData}
        updateField={updateField}
        updateStyle={updateStyle}
        onDelete={onDelete ? handleDelete : undefined}
      />
    </ContextPanelScrollArea>
  );
};
