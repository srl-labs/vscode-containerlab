import { useCallback } from "react";

/**
 * Small helper hook for editors that expose Apply + Save callbacks
 * based on an optional formData object.
 */
export function useApplySaveHandlers<T>(
  formData: T | null,
  onApply: (data: T) => void,
  onSave: (data: T) => void,
  afterApply?: () => void
): { handleApply: () => void; handleSave: () => void } {
  const handleApply = useCallback(() => {
    if (!formData) return;
    onApply(formData);
    afterApply?.();
  }, [formData, onApply, afterApply]);

  const handleSave = useCallback(() => {
    if (!formData) return;
    onSave(formData);
  }, [formData, onSave]);

  return { handleApply, handleSave };
}
