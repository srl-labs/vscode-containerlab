/**
 * LinkImpairmentView - Link impairment editor content for the ContextPanel
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Box from "@mui/material/Box";

import type { TabDefinition } from "../../../ui/editor";
import { TabNavigation } from "../../../ui/editor/TabNavigation";
import { useFooterControlsRef } from "../../../../hooks/ui";
import { FIELDSET_RESET_STYLE } from "../ContextPanelScrollArea";
import { LinkImpairmentTab } from "../../link-impairment/LinkImpairmentTab";
import type {
  EndpointWithNetem,
  LinkImpairmentData,
  LinkImpairmentTabId,
  NetemState
} from "../../link-impairment/types";
import {
  formatNetemData,
  validateLinkImpairmentState,
  applyNetemSettings
} from "../../link-impairment/LinkImpairmentUtils";

export interface LinkImpairmentViewProps {
  linkData: LinkImpairmentData | null;
  onError: (error: string) => void;
  onSave: (data: LinkImpairmentData) => void;
  onApply: (data: LinkImpairmentData) => void;
  onClose: () => void;
  /** Disable editing, but keep scrolling and tab navigation available */
  readOnly?: boolean;
  onFooterRef?: (ref: LinkImpairmentFooterRef | null) => void;
}

export interface LinkImpairmentFooterRef {
  handleApply: () => void;
  handleSave: () => void;
  hasChanges: boolean;
}

function useLinkImpairmentForm(netemData: LinkImpairmentData | null) {
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

  return { activeTab, setActiveTab, formData, handleChange, hasChanges, resetAfterApply, validationErrors };
}

export const LinkImpairmentView: React.FC<LinkImpairmentViewProps> = ({
  linkData,
  onError,
  onSave,
  onApply,
  onClose,
  readOnly = false,
  onFooterRef
}) => {
  const { activeTab, setActiveTab, formData, handleChange, hasChanges, resetAfterApply, validationErrors } =
    useLinkImpairmentForm(linkData);

  const handleSave = useCallback(() => {
    if (readOnly) return;
    if (!formData) return;
    if (validationErrors.length > 0) {
      validationErrors.forEach(onError);
      return;
    }
    applyNetemSettings(formData);
    onSave(formData);
    onClose();
  }, [formData, onClose, onError, onSave, readOnly, validationErrors]);

  const handleApply = useCallback(() => {
    if (readOnly) return;
    if (!formData) return;
    if (validationErrors.length > 0) {
      validationErrors.forEach(onError);
      return;
    }
    applyNetemSettings(formData);
    onApply(formData);
    resetAfterApply();
  }, [formData, onApply, onError, readOnly, resetAfterApply, validationErrors]);

  useFooterControlsRef(onFooterRef, Boolean(formData), handleApply, handleSave, hasChanges);

  if (!formData) return null;

  const tabs: TabDefinition[] = [
    { id: "source", label: `${formData.source}:${formData.sourceEndpoint}` },
    { id: "target", label: `${formData.target}:${formData.targetEndpoint}` }
  ];

  const effectiveOnChange = readOnly ? () => {} : handleChange;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <TabNavigation
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={(id) => setActiveTab(id as LinkImpairmentTabId)}
      />
      <Box sx={{ p: 2, flex: 1, overflow: "auto" }}>
        <fieldset disabled={readOnly} style={FIELDSET_RESET_STYLE}>
          <LinkImpairmentTab
            key={formData.id + activeTab}
            data={
              activeTab === "source"
                ? (formData.sourceNetem ?? {})
                : (formData.targetNetem ?? {})
            }
            onChange={effectiveOnChange}
          />
        </fieldset>
      </Box>
    </Box>
  );
};
