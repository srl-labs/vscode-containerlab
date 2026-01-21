/**
 * Link Impairment Panel Component
 * Shows link impairment values for
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { LinkData } from "../../../hooks/useAppState";
import type { TabDefinition } from "../../shared/editor";
import { EditorPanel } from "../../shared/editor";
import type { NetemState } from "../../../../shared/parsing/types";
import { postCommand } from "../../../utils/extensionMessaging";

import { LinkImpairmentTab } from "./LinkImpairmentTab";

interface EndpointWithNetem {
  node?: string;
  iface?: string;
  netem?: NetemState;
}

type LinkImpairmentTabId = "source" | "target";

export type LinkImpairmentData = LinkData & {
  sourceNetem?: NetemState;
  targetNetem?: NetemState;
  extraData?: {
    clabSourceNetem?: NetemState;
    clabSourceLongName?: string;
    clabTargetNetem?: NetemState;
    clabTargetLongName?: string;
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
 * Strips units for loss, rate, and corruption from containerlab input.
 * @param data to normalize
 * @returns formatted values
 */
function stripNetemDataUnit(data: NetemState): NetemState {
  return {
    delay: data.delay,
    jitter: data.jitter,
    loss: data.loss ? parseFloat(data.loss.replace("%", "")).toString() : data.loss,
    rate: data.rate ? parseFloat(data.rate).toString() : data.rate,
    corruption: data.corruption
      ? parseFloat(data.corruption.replace("%", "")).toString()
      : data.corruption
  };
}

/**
 * Strip units for clab netem states. Assign source and target netem from clab state if absent.
 * @param data raw link impairment data
 */
function formatNetemData(data: LinkImpairmentData): LinkImpairmentData {
  const formattedData: LinkImpairmentData = { ...data };
  if (formattedData.extraData?.clabSourceNetem) {
    formattedData.extraData.clabSourceNetem = stripNetemDataUnit(
      formattedData.extraData?.clabSourceNetem
    );
    formattedData.sourceNetem = formattedData.extraData.clabSourceNetem;
  }
  if (formattedData.extraData?.clabTargetNetem) {
    formattedData.extraData.clabTargetNetem = stripNetemDataUnit(
      formattedData.extraData?.clabTargetNetem
    );
    formattedData.targetNetem = formattedData.extraData.clabTargetNetem;
  }
  return formattedData;
}

/**
 * Custom hook to manage link impairment form state with change tracking
 */
function useLinkImpairmentForm(netemData: LinkImpairmentData | null) {
  const [activeTab, setActiveTab] = useState<LinkImpairmentTabId>("source");
  // current form value
  const [formData, setFormData] = useState<LinkImpairmentData | null>(null);
  // initialBaseline, stores only the clab netem
  const [initialData, setInitialData] = useState<string | null>(null);
  const initialDataRef = useRef<string | null>(null);

  useEffect(() => {
    initialDataRef.current = initialData;
  }, [initialData]);

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

      console.log({ currentBaseline, initial: initialDataRef.current });

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
        setInitialData(serialized);
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

  return { activeTab, setActiveTab, formData, handleChange, hasChanges, resetAfterApply };
}

// Field validations
const TIME_UNIT_RE = /^\d+(ms|s)$/;
const ERR_TIME_UNIT =
  "Input should be a number and a time unit. Either ms (milliseconds) or s (seconds)";
const PERCENTAGE_RE = /^(?:[1-9]\d?|100|0)$/;
const ERR_PERCENTAGE = "Input should be a number between 0 and 100.";
const NUMBER_RE = /^\d+$/;
const ERR_NUMBER = "Input should be a number.";

type FormatCheck = {
  format: RegExp;
  error: string;
};

const NETEM_FIELD_FORMAT: Record<keyof NetemState, FormatCheck> = {
  delay: { format: TIME_UNIT_RE, error: ERR_TIME_UNIT },
  jitter: { format: TIME_UNIT_RE, error: ERR_TIME_UNIT },
  loss: { format: PERCENTAGE_RE, error: ERR_PERCENTAGE },
  rate: { format: NUMBER_RE, error: ERR_NUMBER },
  corruption: { format: PERCENTAGE_RE, error: ERR_PERCENTAGE }
};

/**
 * Validate netem data.
 * @param netemState to validate
 * @returns list of errors
 */
const validateLinkImpairmentState = (netemState: NetemState): string[] => {
  const errors: string[] = [];

  // Format check
  Object.keys(netemState).forEach((k) => {
    const key = k as keyof NetemState;
    if (!NETEM_FIELD_FORMAT[key].format.test(netemState[key]!)) {
      errors.push(`${key} - ${NETEM_FIELD_FORMAT[key].error}`);
    }
  });

  // Cross-field validations
  const delayVal = parseFloat(netemState.delay || "") || 0;
  const jitterVal = parseFloat(netemState.jitter || "") || 0;
  if (jitterVal > 0 && delayVal === 0) {
    errors.push("cannot set jitter when delay is 0");
  }
  return errors;
};

/**
 * Apply netem settings.
 * @param data retrieved from link impairment panel
 */
function applyNetemSettings(data: LinkImpairmentData): void {
  if (JSON.stringify(data.sourceNetem) !== JSON.stringify(data.extraData?.clabSourceNetem)) {
    postCommand("clab-link-impairment", {
      nodeName: data.extraData?.clabSourceLongName ?? data.source, // FIXME: Should it be done this way?
      interfaceName: data.sourceEndpoint,
      data: data.sourceNetem
    });
  }

  if (JSON.stringify(data.targetNetem) !== JSON.stringify(data.extraData?.clabTargetNetem)) {
    postCommand("clab-link-impairment", {
      nodeName: data.extraData?.clabTargetLongName ?? data.target,
      interfaceName: data.targetEndpoint,
      data: data.targetNetem
    });
  }
}

export const LinkImpairmentPanel: React.FC<LinkImpairmentPanelProps> = ({
  isVisible,
  linkData,
  onError,
  onSave,
  onApply,
  onClose
}) => {
  console.log(linkData);
  const { activeTab, setActiveTab, formData, handleChange, hasChanges, resetAfterApply } =
    useLinkImpairmentForm(linkData);

  const validationErrors: string[] = useMemo(() => {
    if (!formData) return [];
    const endpoints: EndpointWithNetem[] = [
      { node: formData.source, iface: formData.sourceEndpoint, netem: formData.sourceNetem },
      { node: formData.target, iface: formData.targetEndpoint, netem: formData.targetNetem }
    ];

    return endpoints.flatMap((endpoint) => {
      if (!endpoint.netem) return [];
      const errors = validateLinkImpairmentState(endpoint.netem);
      return errors.map((error) => `${endpoint.node}:${endpoint.iface} - ${error}`);
    });
  }, [formData]);

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
