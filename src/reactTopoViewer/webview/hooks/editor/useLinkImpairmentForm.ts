/**
 * useLinkImpairmentForm - Form state management for the Link Impairment Editor
 * Extracted from LinkImpairmentView.tsx
 */
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type {
  EndpointWithNetem,
  LinkImpairmentData,
  LinkImpairmentTabId,
  NetemState
} from "../../components/panels/link-impairment/types";
import {
  formatNetemData,
  validateLinkImpairmentState
} from "../../components/panels/link-impairment/LinkImpairmentUtils";

export interface UseLinkImpairmentFormReturn {
  activeTab: LinkImpairmentTabId;
  setActiveTab: (tab: LinkImpairmentTabId) => void;
  formData: LinkImpairmentData | null;
  handleChange: (updates: Partial<NetemState>) => void;
  hasChanges: boolean;
  resetAfterApply: () => void;
  discardChanges: () => void;
  validationErrors: string[];
}

export function useLinkImpairmentForm(
  netemData: LinkImpairmentData | null,
  readOnly = false
): UseLinkImpairmentFormReturn {
  const [activeTab, setActiveTab] = useState<LinkImpairmentTabId>("source");
  const [formData, setFormData] = useState<LinkImpairmentData | null>(null);
  const initialDataRef = useRef<string | null>(null);

  const hasChanges = useMemo(() => {
    if (formData) {
      const curr = { source: formData.sourceNetem, target: formData.targetNetem };
      const prev = {
        source: formData.extraData?.clabSourceNetem,
        target: formData.extraData?.clabTargetNetem
      };
      return JSON.stringify(curr) !== JSON.stringify(prev);
    }
    return false;
  }, [formData]);

  useEffect(() => {
    if (!netemData) return;
    setFormData((prev) => {
      const isNewLink = !prev || prev.id !== netemData.id;
      if (!isNewLink && hasChanges) return prev;

      const currentBaseline = {
        source: netemData.extraData?.clabSourceNetem,
        target: netemData.extraData?.clabTargetNetem
      };

      const isBaselineUpdated =
        prev && initialDataRef.current
          ? JSON.stringify(currentBaseline) !== initialDataRef.current
          : true;

      if (isNewLink || isBaselineUpdated) {
        const formatted = formatNetemData(netemData);
        const serialized = JSON.stringify({
          source: formatted.extraData?.clabSourceNetem,
          target: formatted.extraData?.clabTargetNetem
        });
        initialDataRef.current = serialized;
        if (isNewLink) setActiveTab("source");
        return { ...formatted };
      }
      return prev;
    });
  }, [hasChanges, netemData]);

  const handleChange = useCallback(
    (updates: Partial<NetemState>) => {
      if (readOnly) return;
      setFormData((prev) => {
        if (!prev) return prev;
        const newState = { ...prev };
        if (activeTab === "source") {
          newState.sourceNetem = { ...newState.sourceNetem, ...updates };
        } else {
          newState.targetNetem = { ...newState.targetNetem, ...updates };
        }
        return newState;
      });
    },
    [activeTab, readOnly]
  );

  const resetAfterApply = useCallback(() => {
    if (!formData) return;
    const updated: LinkImpairmentData = {
      ...formData,
      extraData: {
        ...formData.extraData,
        clabSourceNetem: formData.sourceNetem,
        clabTargetNetem: formData.targetNetem
      }
    };
    setFormData(updated);
  }, [formData]);

  const validationErrors: string[] = useMemo(() => {
    if (!formData) return [];
    const endpoints: EndpointWithNetem[] = [
      { node: formData.source, iface: formData.sourceEndpoint, netem: formData.sourceNetem },
      { node: formData.target, iface: formData.targetEndpoint, netem: formData.targetNetem }
    ];
    return endpoints.flatMap((endpoint) => {
      if (!endpoint.netem) return [];
      const errors = validateLinkImpairmentState(endpoint.netem);
      return errors.map((error) => `${endpoint.node}:${endpoint.iface} ${error}`);
    });
  }, [formData]);

  const discardChanges = useCallback(() => {
    if (!formData) return;
    const restored: LinkImpairmentData = {
      ...formData,
      sourceNetem: formData.extraData?.clabSourceNetem ?? formData.sourceNetem,
      targetNetem: formData.extraData?.clabTargetNetem ?? formData.targetNetem
    };
    setFormData(restored);
  }, [formData]);

  return {
    activeTab,
    setActiveTab,
    formData,
    handleChange,
    hasChanges,
    resetAfterApply,
    discardChanges,
    validationErrors
  };
}
