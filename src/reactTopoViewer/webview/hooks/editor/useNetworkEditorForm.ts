/**
 * useNetworkEditorForm - Form state management for the Network Editor
 * Extracted from NetworkEditorView.tsx
 */
import { useState, useEffect, useCallback } from "react";

import type { NetworkEditorData } from "../../components/panels/network-editor/types";

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
  const [initialData, setInitialData] = useState<string | null>(null);

  useEffect(() => {
    if (nodeData) {
      setFormData({ ...nodeData });
      setInitialData(JSON.stringify(nodeData));
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
    if (formData) setInitialData(JSON.stringify(formData));
  }, [formData]);

  const discardChanges = useCallback(() => {
    if (initialData) setFormData(JSON.parse(initialData) as NetworkEditorData);
  }, [initialData]);

  const hasChanges = formData && initialData ? JSON.stringify(formData) !== initialData : false;

  return { formData, handleChange, hasChanges, resetInitialData, discardChanges };
}
