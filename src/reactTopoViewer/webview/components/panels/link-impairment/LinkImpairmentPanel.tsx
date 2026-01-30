/**
 * Link Impairment Panel Component
 * Shows link impairment values for a link
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { EditorPanel, type TabDefinition } from "../../ui/editor";

import { LinkImpairmentTab } from "./LinkImpairmentTab";
import type {
  EndpointWithNetem,
  LinkImpairmentData,
  LinkImpairmentTabId,
  NetemState
} from "./types";
import {
  formatNetemData,
  validateLinkImpairmentState,
  applyNetemSettings
} from "./LinkImpairmentUtils";

interface LinkImpairmentPanelProps {
  isVisible: boolean;
  linkData: LinkImpairmentData | null;
  onError: (error: string) => void;
  onSave: (data: LinkImpairmentData) => void;
  onApply: (data: LinkImpairmentData) => void;
  onClose: () => void;
}

/**
 * Custom hook to manage link impairment form state with change tracking
 */
function useLinkImpairmentForm(netemData: LinkImpairmentData | null) {
  const [activeTab, setActiveTab] = useState<LinkImpairmentTabId>("source");
  // current form value
  const [formData, setFormData] = useState<LinkImpairmentData | null>(null);
  // baseline from clab
  const initialDataRef = useRef<string | null>(null);

  // Compare with baseline
  const hasChanges = useMemo(() => {
    if (formData) {
      const curr = {
        source: formData.sourceNetem,
        target: formData.targetNetem
      };
      const prev = {
        source: formData.extraData?.clabSourceNetem,
        target: formData.extraData?.clabTargetNetem
      };
      return JSON.stringify(curr) !== JSON.stringify(prev);
    } else return false;
  }, [formData]);

  useEffect(() => {
    if (!netemData) return;
    setFormData((prev) => {
      const isNewLink = !prev || prev.id !== netemData.id;

      // compare baseline
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
        if (isNewLink) {
          setActiveTab("source");
        }
        return { ...formatted };
      }
      return prev;
    });
  }, [hasChanges, netemData]);

  const handleChange = useCallback(
    (updates: Partial<NetemState>) => {
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
    [activeTab]
  );

  // Update baseline after apply
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

  return {
    activeTab,
    setActiveTab,
    formData,
    handleChange,
    hasChanges,
    resetAfterApply,
    validationErrors
  };
}

export const LinkImpairmentPanel: React.FC<LinkImpairmentPanelProps> = ({
  isVisible,
  linkData,
  onError,
  onSave,
  onApply,
  onClose
}) => {
  const {
    activeTab,
    setActiveTab,
    formData,
    handleChange,
    hasChanges,
    resetAfterApply,
    validationErrors
  } = useLinkImpairmentForm(linkData);

  const handleSave = useCallback(() => {
    if (!formData) return;
    if (validationErrors.length > 0) {
      validationErrors.forEach(onError);
      return;
    }

    applyNetemSettings(formData);
    onSave(formData);
    onClose();
  }, [formData, onClose, onError, onSave, validationErrors]);

  const handleApply = useCallback(() => {
    if (!formData) return;
    if (validationErrors.length > 0) {
      validationErrors.forEach(onError);
      return;
    }

    applyNetemSettings(formData);
    onApply(formData);
    resetAfterApply();
  }, [formData, onApply, onError, resetAfterApply, validationErrors]);

  if (!formData) return null;

  const tabs: TabDefinition[] = [
    { id: "source", label: `${formData.source}:${formData.sourceEndpoint}` },
    { id: "target", label: `${formData.target}:${formData.targetEndpoint}` }
  ];

  return (
    <EditorPanel
      title="Link Impairments"
      isVisible={isVisible}
      onClose={onClose}
      onApply={handleApply}
      onSave={handleSave}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={(id) => {
        setActiveTab(id as LinkImpairmentTabId);
      }}
      storageKey="link-impairment-panel"
      width={400}
      hasChanges={hasChanges}
      testId="link-impairment-panel"
    >
      <LinkImpairmentTab
        key={formData.id + activeTab}
        data={activeTab === "source" ? (formData.sourceNetem ?? {}) : (formData.targetNetem ?? {})}
        onChange={handleChange}
      />
    </EditorPanel>
  );
};
