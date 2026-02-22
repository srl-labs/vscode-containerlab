import type { Dispatch, SetStateAction } from "react";

export function hasFormChanges<T>(formData: T | null, initialData: T | null): boolean {
  return formData !== null && initialData !== null
    ? JSON.stringify(formData) !== JSON.stringify(initialData)
    : false;
}

export function discardFormChanges<T>(
  initialData: T | null,
  setFormData: Dispatch<SetStateAction<T | null>>
): void {
  if (initialData !== null) {
    setFormData({ ...initialData });
  }
}
