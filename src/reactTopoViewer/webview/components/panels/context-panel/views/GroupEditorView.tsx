// Group editor for the ContextPanel.
import React, { useCallback, useEffect, useRef } from "react";
import Box from "@mui/material/Box";

import type { GroupStyleAnnotation } from "../../../../../shared/types/topology";
import type { GroupEditorData } from "../../../../hooks/canvas";
import { useGenericFormState, useEditorHandlersWithFooterRef } from "../../../../hooks/editor";
import { FIELDSET_RESET_STYLE } from "../ContextPanelScrollArea";
import { GroupFormContent } from "../../group-editor/GroupFormContent";

export interface GroupEditorViewProps {
  groupData: GroupEditorData | null;
  onSave: (data: GroupEditorData) => void;
  onClose: () => void;
  onDelete?: (groupId: string) => void;
  /** Live-preview style changes on the canvas (visual only, no persist) */
  onStylePreview?: (groupId: string, style: Partial<GroupStyleAnnotation>) => void;
  /** Disable editing, but keep scrolling available */
  readOnly?: boolean;
  onFooterRef?: (ref: GroupEditorFooterRef | null) => void;
}

export interface GroupEditorFooterRef {
  handleApply: () => void;
  handleSave: () => void;
  handleDiscard: () => void;
  hasChanges: boolean;
}

export const GroupEditorView: React.FC<GroupEditorViewProps> = ({
  groupData,
  onSave,
  onClose,
  onDelete,
  onStylePreview,
  readOnly = false,
  onFooterRef,
}) => {
  // Stable refs for unmount cleanup
  const previewRef = useRef(onStylePreview);
  previewRef.current = onStylePreview;
  const initialStyleRef = useRef<Partial<GroupStyleAnnotation> | null>(null);
  const groupIdRef = useRef<string | null>(null);
  const hasPreviewRef = useRef(false);

  // Track initial style for revert
  useEffect(() => {
    if (groupData) {
      initialStyleRef.current = { ...groupData.style };
      groupIdRef.current = groupData.id;
      hasPreviewRef.current = false;
    }
  }, [groupData]);

  // Revert on unmount if there are uncommitted preview changes
  useEffect(() => {
    return () => {
      if (
        hasPreviewRef.current &&
        groupIdRef.current !== null &&
        initialStyleRef.current !== null
      ) {
        previewRef.current?.(groupIdRef.current, initialStyleRef.current);
      }
    };
  }, []);

  const transformData = useCallback(
    (data: GroupEditorData) => ({ ...data, style: { ...data.style } }),
    []
  );

  const { formData, updateField, hasChanges, resetInitialData, discardChanges, setFormData } =
    useGenericFormState(groupData, { transformData });

  const updateStyle = useCallback(
    <K extends keyof GroupStyleAnnotation>(field: K, value: GroupStyleAnnotation[K]) => {
      if (readOnly) return;
      setFormData((prev) => {
        if (!prev) return null;
        previewRef.current?.(prev.id, { [field]: value });
        hasPreviewRef.current = true;
        return { ...prev, style: { ...prev.style, [field]: value } };
      });
    },
    [setFormData, readOnly]
  );

  // Wrap discard to also revert the canvas preview
  const discardWithRevert = useCallback(() => {
    discardChanges();
    if (groupIdRef.current !== null && initialStyleRef.current !== null) {
      previewRef.current?.(groupIdRef.current, initialStyleRef.current);
      hasPreviewRef.current = false;
    }
  }, [discardChanges]);

  // Wrap save to mark preview as committed
  const saveWithCommit = useCallback(
    (data: GroupEditorData) => {
      hasPreviewRef.current = false;
      initialStyleRef.current = { ...data.style };
      onSave(data);
    },
    [onSave]
  );

  const effectiveUpdateField: typeof updateField = readOnly ? () => {} : updateField;

  useEditorHandlersWithFooterRef({
    formData,
    onSave: saveWithCommit,
    onClose,
    onDelete,
    resetInitialData,
    discardChanges: discardWithRevert,
    onFooterRef,
    hasChangesForFooter: hasChanges,
  });

  if (!formData) return null;

  return (
    <Box sx={{ flex: 1, overflow: "auto" }}>
      <fieldset disabled={readOnly} style={FIELDSET_RESET_STYLE}>
        <GroupFormContent
          formData={formData}
          updateField={effectiveUpdateField}
          updateStyle={updateStyle}
        />
      </fieldset>
    </Box>
  );
};
