/**
 * GroupEditorView - Group editor content for the ContextPanel
 */
import React, { useCallback, useEffect } from "react";
import Box from "@mui/material/Box";

import type { GroupStyleAnnotation } from "../../../../../shared/types/topology";
import type { GroupEditorData } from "../../../../hooks/canvas";
import { useGenericFormState, useEditorHandlers } from "../../../../hooks/editor";
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
      <GroupFormContent
        formData={formData}
        updateField={updateField}
        updateStyle={updateStyle}
        onDelete={onDelete ? handleDelete : undefined}
      />
    </Box>
  );
};
