/**
 * useLinkEditorForm - Form state management for the Link Editor
 * Extracted from LinkEditorView.tsx
 */
import { useState, useEffect, useCallback, useRef } from "react";

import type { LinkEditorData, LinkEditorTabId } from "../../components/panels/link-editor/types";

export interface UseLinkEditorFormReturn {
  activeTab: LinkEditorTabId;
  setActiveTab: (tab: LinkEditorTabId) => void;
  formData: LinkEditorData | null;
  handleChange: (updates: Partial<LinkEditorData>) => void;
  hasChanges: boolean;
  resetAfterApply: () => void;
  discardChanges: () => void;
}

export function useLinkEditorForm(
  linkData: LinkEditorData | null,
  readOnly = false
): UseLinkEditorFormReturn {
  const [activeTab, setActiveTab] = useState<LinkEditorTabId>("basic");
  const [formData, setFormData] = useState<LinkEditorData | null>(null);
  const [initialData, setInitialData] = useState<string | null>(null);
  const initialDataRef = useRef<string | null>(null);

  useEffect(() => {
    initialDataRef.current = initialData;
  }, [initialData]);

  useEffect(() => {
    if (!linkData) return;
    setFormData((prev) => {
      const isNewLink = !prev || prev.id !== linkData.id;
      const hasPendingChanges =
        prev && initialDataRef.current ? JSON.stringify(prev) !== initialDataRef.current : false;
      if (isNewLink || !hasPendingChanges) {
        const serialized = JSON.stringify(linkData);
        initialDataRef.current = serialized;
        setInitialData(serialized);
        if (isNewLink) setActiveTab("basic");
        return { ...linkData };
      }
      return prev;
    });
  }, [linkData]);

  const handleChange = useCallback(
    (updates: Partial<LinkEditorData>) => {
      if (readOnly) return;
      setFormData((prev) => (prev ? { ...prev, ...updates } : null));
    },
    [readOnly]
  );

  const resetAfterApply = useCallback(() => {
    if (formData) {
      const updatedFormData: LinkEditorData = {
        ...formData,
        originalSource: formData.source,
        originalTarget: formData.target,
        originalSourceEndpoint: formData.sourceEndpoint,
        originalTargetEndpoint: formData.targetEndpoint
      };
      setFormData(updatedFormData);
      setInitialData(JSON.stringify(updatedFormData));
    }
  }, [formData]);

  const discardChanges = useCallback(() => {
    if (initialData) setFormData(JSON.parse(initialData) as LinkEditorData);
  }, [initialData]);

  const hasChanges = formData && initialData ? JSON.stringify(formData) !== initialData : false;

  return {
    activeTab,
    setActiveTab,
    formData,
    handleChange,
    hasChanges,
    resetAfterApply,
    discardChanges
  };
}
