import { useFooterControlsRef, type FooterControlsRef } from "../ui";

import { useEditorHandlers } from "./useGenericFormState";

interface UseEditorHandlersWithFooterRefOptions<T extends { id: string }> {
  formData: T | null;
  onSave: (data: T) => void;
  onClose: () => void;
  onDelete?: (id: string) => void;
  resetInitialData: () => void;
  canSave?: (data: T) => boolean;

  onFooterRef?: (ref: FooterControlsRef | null) => void;
  hasChangesForFooter: boolean;
}

/**
 * Wraps the standard editor handlers with context-panel footer wiring.
 * This keeps per-view components smaller and avoids clone-heavy boilerplate.
 */
export function useEditorHandlersWithFooterRef<T extends { id: string }>(
  options: UseEditorHandlersWithFooterRefOptions<T>
) {
  const {
    formData,
    onSave,
    onClose,
    onDelete,
    resetInitialData,
    canSave,
    onFooterRef,
    hasChangesForFooter
  } = options;

  const handlers = useEditorHandlers<T>({
    formData,
    onSave,
    onClose,
    onDelete,
    resetInitialData,
    canSave
  });

  useFooterControlsRef(
    onFooterRef,
    Boolean(formData),
    handlers.handleApply,
    handlers.handleSaveAndClose,
    hasChangesForFooter
  );

  return handlers;
}
