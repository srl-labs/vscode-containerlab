// Link impairment editor content for the ContextPanel.
import React, { useCallback, useMemo } from "react";

import { EditorPanel } from "../../../ui/editor/EditorPanel";
import type { TabConfig } from "../../../ui/editor/EditorPanel";
import { useFooterControlsRef } from "../../../../hooks/ui";
import { useLinkImpairmentForm } from "../../../../hooks/editor/useLinkImpairmentForm";
import type { LinkImpairmentData, LinkImpairmentTabId } from "../../link-impairment/types";
import { applyNetemSettings } from "../../link-impairment/LinkImpairmentUtils";
import { LinkImpairmentTab } from "../../link-impairment/LinkImpairmentTab";

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
  handleDiscard: () => void;
  hasChanges: boolean;
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
  const {
    activeTab,
    setActiveTab,
    formData,
    handleChange,
    hasChanges,
    resetAfterApply,
    discardChanges,
    validationErrors
  } = useLinkImpairmentForm(linkData, readOnly);

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

  useFooterControlsRef(
    onFooterRef,
    Boolean(formData),
    handleApply,
    handleSave,
    hasChanges,
    discardChanges
  );

  if (!formData) return null;

  // Dynamic tabs based on endpoint names
  const tabs: TabConfig[] = useMemo(
    () => [
      {
        id: "source",
        label: `${formData.source}:${formData.sourceEndpoint}`,
        component: LinkImpairmentTab
      },
      {
        id: "target",
        label: `${formData.target}:${formData.targetEndpoint}`,
        component: LinkImpairmentTab
      }
    ],
    [formData.source, formData.sourceEndpoint, formData.target, formData.targetEndpoint]
  );

  // Props specific to the active tab's endpoint
  const tabProps = useMemo(
    () => ({
      key: formData.id + activeTab,
      data: activeTab === "source" ? (formData.sourceNetem ?? {}) : (formData.targetNetem ?? {}),
      onChange: handleChange
    }),
    [formData, activeTab, handleChange]
  );

  return (
    <EditorPanel
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={(id) => setActiveTab(id as LinkImpairmentTabId)}
      tabProps={tabProps}
      readOnly={readOnly}
    />
  );
};
