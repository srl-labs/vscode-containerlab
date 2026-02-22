/**
 * useNetworkEditorForm - Form state management for the Network Editor
 * Extracted from NetworkEditorView.tsx
 */
import { useState, useEffect, useCallback } from "react";

import type { NetworkEditorData } from "../../components/panels/network-editor/types";
import { discardFormChanges, hasFormChanges } from "./formChangeTracking";

export interface UseNetworkEditorFormReturn {
  formData: NetworkEditorData | null;
  handleChange: (updates: Partial<NetworkEditorData>) => void;
  hasChanges: boolean;
  resetInitialData: () => void;
  discardChanges: () => void;
}

export function useNetworkEditorForm(
  nodeData: NetworkEditorData | null,
  readOnly = false
): UseNetworkEditorFormReturn {
  const [formData, setFormData] = useState<NetworkEditorData | null>(null);
  const [initialData, setInitialData] = useState<NetworkEditorData | null>(null);

  useEffect(() => {
    if (nodeData) {
      const nextData = { ...nodeData };
      setFormData(nextData);
      setInitialData(nextData);
    }
  }, [nodeData]);

  const handleChange = useCallback(
    (updates: Partial<NetworkEditorData>) => {
      if (readOnly) return;
      setFormData((prev) => (prev ? { ...prev, ...updates } : null));
    },
    [readOnly]
  );

  const resetInitialData = useCallback(() => {
    if (formData) setInitialData({ ...formData });
  }, [formData]);

  const discardChanges = useCallback(() => {
    discardFormChanges(initialData, setFormData);
  }, [initialData]);

  const hasChanges = hasFormChanges(formData, initialData);

  return { formData, handleChange, hasChanges, resetInitialData, discardChanges };
}
