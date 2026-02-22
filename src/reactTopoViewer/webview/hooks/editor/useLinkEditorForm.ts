/**
 * useLinkEditorForm - Form state management for the Link Editor
 * Extracted from LinkEditorView.tsx
 */
import { useState, useEffect, useCallback, useRef } from "react";

import type { LinkEditorData, LinkEditorTabId } from "../../components/panels/link-editor/types";

import { applyFormUpdates } from "./formState";
import { discardFormChanges, hasFormChanges } from "./formChangeTracking";

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
  const [initialData, setInitialData] = useState<LinkEditorData | null>(null);
  const initialDataRef = useRef<LinkEditorData | null>(null);

  useEffect(() => {
    initialDataRef.current = initialData;
  }, [initialData]);

  useEffect(() => {
    if (!linkData) return;
    setFormData((prev) => {
      const isNewLink = prev === null || prev.id !== linkData.id;
      const hasPendingChanges =
        prev !== null && initialDataRef.current !== null
          ? JSON.stringify(prev) !== JSON.stringify(initialDataRef.current)
          : false;
      if (isNewLink || !hasPendingChanges) {
        const nextInitialData = { ...linkData };
        initialDataRef.current = nextInitialData;
        setInitialData(nextInitialData);
        if (isNewLink) setActiveTab("basic");
        return { ...linkData };
      }
      return prev;
    });
  }, [linkData]);

  const handleChange = useCallback(
    (updates: Partial<LinkEditorData>) => {
      applyFormUpdates(readOnly, setFormData, updates);
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
      setInitialData(updatedFormData);
    }
  }, [formData]);

  const discardChanges = useCallback(() => {
    discardFormChanges(initialData, setFormData);
  }, [initialData]);

  const hasChanges = hasFormChanges(formData, initialData);

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
