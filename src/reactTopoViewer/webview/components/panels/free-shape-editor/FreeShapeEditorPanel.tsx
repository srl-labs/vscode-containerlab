/**
 * Free Shape Editor Panel - Draggable editor panel for shape annotations
 * Uses BasePanel directly (no tabs needed)
 */
import React from "react";

import { BasePanel } from "../../shared/editor/BasePanel";
import type { FreeShapeAnnotation } from "../../../../shared/types/topology";
import { useGenericFormState, useEditorHandlers } from "../../../hooks/panels/useGenericFormState";
import { normalizeShapeAnnotationColors } from "../../../utils/color";

import { FreeShapeFormContent } from "./FreeShapeFormContent";

interface FreeShapeEditorPanelProps {
  isVisible: boolean;
  annotation: FreeShapeAnnotation | null;
  onClose: () => void;
  onSave: (annotation: FreeShapeAnnotation) => void;
  onDelete?: (id: string) => void;
}

export const FreeShapeEditorPanel: React.FC<FreeShapeEditorPanelProps> = ({
  isVisible,
  annotation,
  onClose,
  onSave,
  onDelete
}) => {
  const { formData, updateField, hasChanges, resetInitialData, isNew } = useGenericFormState(
    annotation,
    { transformData: normalizeShapeAnnotationColors }
  );

  const { handleApply, handleSaveAndClose, handleDelete } = useEditorHandlers({
    formData,
    onSave,
    onClose,
    onDelete,
    resetInitialData
  });

  if (!formData) return null;

  const titlePrefix = formData.shapeType.charAt(0).toUpperCase() + formData.shapeType.slice(1);

  return (
    <BasePanel
      title={`Edit ${titlePrefix}`}
      isVisible={isVisible}
      onClose={onClose}
      onPrimaryClick={handleSaveAndClose}
      onSecondaryClick={handleApply}
      primaryLabel="OK"
      secondaryLabel="Apply"
      hasChanges={hasChanges}
      storageKey="free-shape-editor"
      width={380}
      testId="free-shape-editor"
    >
      <FreeShapeFormContent
        formData={formData}
        updateField={updateField}
        isNew={isNew}
        onDelete={onDelete ? handleDelete : undefined}
      />
    </BasePanel>
  );
};
