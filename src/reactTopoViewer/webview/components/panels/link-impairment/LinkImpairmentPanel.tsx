/**
 * Link Impairment Panel Component
 * Shows link impairment values for
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { LinkData } from "../../../hooks/useAppState";
import type { TabDefinition } from "../../shared/editor";
import { EditorPanel } from "../../shared/editor";
import type { NetemState } from "../../../../shared/parsing/types";

import { LinkImpairmentTab } from "./LinkImpairmentTab";

interface EndpointWithNetem {
  node?: string;
  intf?: string;
  netem?: NetemState;
}

type LinkImpairmentTabId = "source" | "target";

export type LinkImpairmentData = LinkData & {
  sourceNetem?: NetemState;
  targetNetem?: NetemState;
  extraData?: {
    clabSourceNetem?: NetemState;
    clabTargetNetem?: NetemState;
    [key: string]: unknown;
  };
};

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
  const [formData, setFormData] = useState<LinkImpairmentData | null>(null);
  const [initialData, setInitialData] = useState<string | null>(null);
  const initialDataRef = useRef<string | null>(null);

  useEffect(() => {
    initialDataRef.current = initialData;
  }, [initialData]);

  useEffect(() => {
    if (!netemData) return;
    setFormData((prev) => {
      const isNewLink = !prev || prev.id !== netemData.id;
      netemData.sourceNetem = netemData.extraData?.clabSourceNetem;
      netemData.targetNetem = netemData.extraData?.clabTargetNetem;

      const hasPendingChanges =
        prev && initialDataRef.current ? JSON.stringify(prev) !== initialDataRef.current : false;
      if (isNewLink || !hasPendingChanges) {
        const serialized = JSON.stringify(netemData);
        initialDataRef.current = serialized;
        setInitialData(serialized);
        if (isNewLink) {
          setActiveTab("source");
        }
        return { ...netemData };
      }
      return prev;
    });
  }, [netemData]);

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

  const hasChanges = formData && initialData ? JSON.stringify(formData) !== initialData : false;

  return { activeTab, setActiveTab, formData, handleChange, hasChanges };
}

const validateLinkImpairmentData = (netemState: NetemState): string[] => {
  const errors: string[] = [];
  const delayVal = parseFloat(netemState.delay || "") || 0;
  const jitterVal = parseFloat(netemState.jitter || "") || 0;
  if (jitterVal > 0 && delayVal === 0) {
    errors.push("cannot set jitter when delay is 0");
  }
  return errors;
};

export const LinkImpairmentPanel: React.FC<LinkImpairmentPanelProps> = ({
  isVisible,
  linkData,
  onError,
  onSave,
  onApply,
  onClose
}) => {
  const { activeTab, setActiveTab, formData, handleChange, hasChanges } =
    useLinkImpairmentForm(linkData);

  const validationErrors: string[] = useMemo(() => {
    if (!formData) return [];
    const endpoints: EndpointWithNetem[] = [
      { node: formData.source, intf: formData.sourceEndpoint, netem: formData.sourceNetem },
      { node: formData.target, intf: formData.targetEndpoint, netem: formData.targetNetem }
    ];

    return endpoints.flatMap((endpoint) => {
      if (!endpoint.netem) return [];
      const errors = validateLinkImpairmentData(endpoint.netem);
      return errors.map((error) => `${endpoint.node}:${endpoint.intf} - ${error}`);
    });
  }, [formData]);

  const handleSave = useCallback(() => {
    if (!formData) return;

    if (validationErrors.length > 0) {
      validationErrors.forEach(onError);
      return;
    }
    onSave(formData);
    onClose();
  }, [formData, onClose, onError, onSave, validationErrors]);

  const handleApply = useCallback(() => {
    if (!formData) return;

    if (validationErrors.length > 0) {
      validationErrors.forEach(onError);
      return;
    }
    onApply(formData);
  }, [formData, onApply, onError, validationErrors]);

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
