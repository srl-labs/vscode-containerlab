import type { Dispatch, SetStateAction } from "react";

export function applyFormUpdates<T extends object>(
  readOnly: boolean,
  setFormData: Dispatch<SetStateAction<T | null>>,
  updates: Partial<T>
): void {
  if (readOnly) return;
  setFormData((prev) => (prev ? { ...prev, ...updates } : null));
}
