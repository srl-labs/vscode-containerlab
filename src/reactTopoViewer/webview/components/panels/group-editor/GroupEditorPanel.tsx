/**
 * GroupEditorPanel - Draggable editor panel for group properties
 * Uses BasePanel for consistent look and feel
 */
import React, { useState, useEffect, useCallback } from 'react';
import { BasePanel } from '../../shared/editor/BasePanel';
import type { GroupStyleAnnotation } from '../../../../shared/types/topology';
import type { GroupEditorData } from '../../../hooks/groups/groupTypes';
import { GroupFormContent } from './GroupFormContent';

interface GroupEditorPanelProps {
  isVisible: boolean;
  groupData: GroupEditorData | null;
  onClose: () => void;
  onSave: (data: GroupEditorData) => void;
  onDelete?: (groupId: string) => void;
  onStyleChange?: (groupId: string, style: Partial<GroupStyleAnnotation>) => void;
}

/**
 * Hook to manage form state with change tracking
 */
function useGroupForm(
  groupData: GroupEditorData | null,
  onStyleChange?: (groupId: string, style: Partial<GroupStyleAnnotation>) => void
) {
  const [formData, setFormData] = useState<GroupEditorData | null>(null);
  const [initialData, setInitialData] = useState<string | null>(null);

  useEffect(() => {
    if (groupData) {
      setFormData({ ...groupData, style: { ...groupData.style } });
      setInitialData(JSON.stringify(groupData));
    }
  }, [groupData]);

  const updateField = useCallback(<K extends keyof GroupEditorData>(
    field: K,
    value: GroupEditorData[K]
  ) => {
    setFormData(prev => prev ? { ...prev, [field]: value } : null);
  }, []);

  const updateStyle = useCallback(<K extends keyof GroupStyleAnnotation>(
    field: K,
    value: GroupStyleAnnotation[K]
  ) => {
    setFormData(prev => {
      if (!prev) return null;
      // Apply live style change to Cytoscape node
      if (onStyleChange) {
        onStyleChange(prev.id, { [field]: value });
      }
      return {
        ...prev,
        style: { ...prev.style, [field]: value }
      };
    });
  }, [onStyleChange]);

  const resetInitialData = useCallback(() => {
    if (formData) setInitialData(JSON.stringify(formData));
  }, [formData]);

  const hasChanges = formData && initialData ? JSON.stringify(formData) !== initialData : false;

  return { formData, updateField, updateStyle, hasChanges, resetInitialData };
}

export const GroupEditorPanel: React.FC<GroupEditorPanelProps> = ({
  isVisible,
  groupData,
  onClose,
  onSave,
  onDelete,
  onStyleChange
}) => {
  const { formData, updateField, updateStyle, hasChanges, resetInitialData } = useGroupForm(groupData, onStyleChange);

  const handleApply = useCallback(() => {
    if (formData) {
      onSave(formData);
      resetInitialData();
    }
  }, [formData, onSave, resetInitialData]);

  const handleSaveAndClose = useCallback(() => {
    if (formData) {
      onSave(formData);
      onClose();
    }
  }, [formData, onSave, onClose]);

  const handleDelete = useCallback(() => {
    if (formData && onDelete) {
      onDelete(formData.id);
      onClose();
    }
  }, [formData, onDelete, onClose]);

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
