/**
 * GroupEditorPanel - Draggable editor panel for group properties
 * Uses BasePanel for consistent look and feel
 */
import React, { useCallback } from "react";

import { BasePanel } from "../../shared/editor/BasePanel";
import type { GroupStyleAnnotation } from "../../../../shared/types/topology";
import type { GroupEditorData } from "../../../hooks/groups";
import { useGenericFormState, useEditorHandlers } from "../../../hooks/panels/useGenericFormState";

import { GroupFormContent } from "./GroupFormContent";

interface GroupEditorPanelProps {
  isVisible: boolean;
  groupData: GroupEditorData | null;
  onClose: () => void;
  onSave: (data: GroupEditorData) => void;
  onDelete?: (groupId: string) => void;
  onStyleChange?: (groupId: string, style: Partial<GroupStyleAnnotation>) => void;
}

export const GroupEditorPanel: React.FC<GroupEditorPanelProps> = ({
  isVisible,
  groupData,
  onClose,
  onSave,
  onDelete,
  onStyleChange
}) => {
  // Transform data to deep clone the style object
  const transformData = useCallback(
    (data: GroupEditorData) => ({
      ...data,
      style: { ...data.style }
    }),
    []
  );

  const { formData, updateField, hasChanges, resetInitialData, setFormData } = useGenericFormState(
    groupData,
    { transformData }
  );

  // Custom updateStyle that also triggers live preview
  const updateStyle = useCallback(
    <K extends keyof GroupStyleAnnotation>(field: K, value: GroupStyleAnnotation[K]) => {
      setFormData((prev) => {
        if (!prev) return null;
        // Apply live style change to the group
        if (onStyleChange) {
          onStyleChange(prev.id, { [field]: value });
        }
        return {
          ...prev,
          style: { ...prev.style, [field]: value }
        };
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

  if (!formData) return null;

  return (
    <BasePanel
      title="Edit Group"
      isVisible={isVisible}
      onClose={onClose}
      onPrimaryClick={handleSaveAndClose}
      onSecondaryClick={handleApply}
      primaryLabel="OK"
      secondaryLabel="Apply"
      hasChanges={hasChanges}
      storageKey="group-editor"
      width={380}
      testId="group-editor"
    >
      <GroupFormContent
        formData={formData}
        updateField={updateField}
        updateStyle={updateStyle}
        onDelete={onDelete ? handleDelete : undefined}
      />
    </BasePanel>
  );
};
