/**
 * Link Impairment Panel Component
 * Shows link impairment values for
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";

import type { LinkData } from "../../../hooks/useAppState";
import type { TabDefinition } from "../../shared/editor";
import { EditorPanel } from "../../shared/editor";

import { LinkImpairmentTab } from "./LinkImpairmentTab";

interface NetemState {
  delay?: string;
  jitter?: string;
  loss?: string;
  rate?: string;
  corruption?: string;
}

interface EndpointNetemData {
  node: string;
  interface: string;
  netem: NetemState;
}

type LinkImpairmentTabId = "a" | "b";

type LinkImpairmentData = LinkData & {
  endpointA?: EndpointNetemData;
  endpointB?: EndpointNetemData;
  extraData?: {
    clabSourceNetem?: NetemState;
    clabTargetNetem?: NetemState;
    [key: string]: unknown;
  };
};

interface LinkImpairmentPanelProps {
  isVisible: boolean;
  linkData: LinkImpairmentData | null;
  onClose: () => void;
}

function useLinkImpairmentForm(
  netemData: {
    a: EndpointNetemData;
    b: EndpointNetemData;
  } | null
) {
  const [activeTab, setActiveTab] = useState<LinkImpairmentTabId>("a");
  const [formValues, setFormValues] = useState<Record<LinkImpairmentTabId, NetemState>>({
    a: netemData?.a?.netem ?? {},
    b: netemData?.b?.netem ?? {}
  });
  const [hasChanges, setHasChanges] = useState<boolean>(false);

  const handleChange = useCallback(
    (updates: Partial<NetemState>) => {
      setHasChanges(true);
      setFormValues((prev) => {
        const newState = { ...prev };
        newState[activeTab] = { ...newState[activeTab], ...updates };
        return newState;
      });
    },
    [activeTab]
  );

  return { activeTab, setActiveTab, formValues, handleChange, hasChanges };
}

/**
 * Get endpoint data from link data, extracting stats from extraData
 */
function getEndpoints(linkData: LinkImpairmentData | null): {
  a: EndpointNetemData;
  b: EndpointNetemData;
} | null {
  if (!linkData) return null;

  const extraData = linkData.extraData || {};

  const a: EndpointNetemData = linkData.endpointA || {
    node: linkData.source,
    interface: linkData.sourceEndpoint || "N/A",
    netem: extraData.clabSourceNetem || {}
  };

  const b: EndpointNetemData = linkData.endpointB || {
    node: linkData.target,
    interface: linkData.targetEndpoint || "N/A",
    netem: extraData.clabTargetNetem || {}
  };

  a.netem = { delay: "0ms" };
  b.netem = { delay: "2ms", jitter: "5ms" };

  return { a, b };
}

/**
 * Validation banner component
 */
const ValidationBanner: React.FC<{ errors: string[] }> = ({ errors }) => {
  if (errors.length === 0) return null;

  return (
    <div
      className="mb-2 p-2 rounded-sm"
      style={{
        backgroundColor: "var(--vscode-inputValidation-errorBackground)",
        border: "1px solid var(--vscode-inputValidation-errorBorder)"
      }}
    >
      <div className="text-(--vscode-editorError-foreground) text-sm font-semibold">
        Invalid link impairment configuration
      </div>
      <div className="text-(--vscode-editorError-foreground) text-xs mt-1">
        {errors.map((error, i) => (
          <div key={i}>{error}</div>
        ))}
      </div>
    </div>
  );
};

const validateLinkImpairmentData = (netemState: NetemState): string[] => {
  const errors: string[] = [];
  if (netemState.jitter && !netemState.delay) {
    errors.push("Cannot set jitter when delay is 0");
  }
  return errors;
};

export const LinkImpairmentPanel: React.FC<LinkImpairmentPanelProps> = ({
  isVisible,
  linkData,
  onClose
}) => {
  const endpoints = getEndpoints(linkData);
  const { activeTab, setActiveTab, formValues, handleChange, hasChanges } =
    useLinkImpairmentForm(endpoints);

  const validationErrors: string[] = useMemo(() => {
    if (!formValues || !endpoints) return [];
    return Object.keys(formValues).flatMap((k: string) => {
      const errors = validateLinkImpairmentData(formValues[k as LinkImpairmentTabId]);
      return errors.map((error) => `${endpoints[k as LinkImpairmentTabId].node}: ${error}`);
    });
  }, [endpoints, formValues]);

  if (!endpoints) return null;

  const tabs: TabDefinition[] = [
    { id: "a", label: `${endpoints.a.node}:${endpoints.a.interface}` },
    { id: "b", label: `${endpoints.b.node}:${endpoints.b.interface}` }
  ];

  return (
    <EditorPanel
      title="Link Impairments"
      isVisible={isVisible}
      onClose={onClose}
      onApply={() => {}}
      onSave={() => {}}
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
      <ValidationBanner errors={validationErrors} />
      <LinkImpairmentTab key={activeTab} data={formValues[activeTab]} onChange={handleChange} />
    </EditorPanel>
  );
};
