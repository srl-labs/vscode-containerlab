// Link editor content for the ContextPanel.
import React, { useCallback, useEffect, useRef, useMemo } from "react";

import { EditorPanel } from "../../../ui/editor/EditorPanel";
import type { TabConfig } from "../../../ui/editor/EditorPanel";
import { useFooterControlsRef } from "../../../../hooks/ui";
import { useLinkEditorForm } from "../../../../hooks/editor/useLinkEditorForm";
import type { LinkEditorData, LinkEditorTabId } from "../../link-editor/types";
import { validateLinkEditorData, ExtendedTab  } from "../../link-editor/ExtendedTab";
import { BasicTab } from "../../link-editor/BasicTab";

export interface LinkEditorBannerRef {
  errors: string[];
}

export interface LinkEditorViewProps {
  linkData: LinkEditorData | null;
  onSave: (data: LinkEditorData) => void;
  onApply: (data: LinkEditorData) => void;
  /** Live-preview offset changes on the canvas (visual only, no persist) */
  previewOffset?: (data: LinkEditorData) => void;
  /** Revert offset preview to initial state */
  revertOffset?: () => void;
  /** Disable editing, but keep scrolling and tab navigation available */
  readOnly?: boolean;
  onFooterRef?: (ref: LinkEditorFooterRef | null) => void;
  onBannerRef?: (ref: LinkEditorBannerRef | null) => void;
}

export interface LinkEditorFooterRef {
  handleApply: () => void;
  handleSave: () => void;
  handleDiscard: () => void;
  hasChanges: boolean;
}

const ALL_TABS: TabConfig[] = [
  { id: "basic", label: "Basic", component: BasicTab },
  { id: "extended", label: "Extended", component: ExtendedTab }
];

const BASIC_ONLY_TABS: TabConfig[] = [{ id: "basic", label: "Basic", component: BasicTab }];

export const LinkEditorView: React.FC<LinkEditorViewProps> = ({
  linkData,
  onSave,
  onApply,
  previewOffset,
  revertOffset,
  readOnly = false,
  onFooterRef,
  onBannerRef
}) => {
  const {
    activeTab,
    setActiveTab,
    formData,
    handleChange,
    hasChanges,
    resetAfterApply,
    discardChanges
  } = useLinkEditorForm(linkData, readOnly);

  // Stable refs for unmount cleanup
  const revertRef = useRef(revertOffset);
  revertRef.current = revertOffset;
  const hasOffsetPreviewRef = useRef(false);

  // Reset preview flag when the edited link changes
  useEffect(() => {
    hasOffsetPreviewRef.current = false;
  }, [linkData?.id]);

  // Revert on unmount if there are uncommitted offset preview changes
  useEffect(() => {
    return () => {
      if (hasOffsetPreviewRef.current) revertRef.current?.();
    };
  }, []);

  const validationErrors = useMemo(() => {
    if (!formData) return [];
    return validateLinkEditorData(formData);
  }, [formData]);

  // Expose validation errors to ContextPanel banner
  useEffect(() => {
    onBannerRef?.({ errors: validationErrors });
    return () => onBannerRef?.(null);
  }, [validationErrors, onBannerRef]);

  const handleApply = useCallback(() => {
    if (formData && validationErrors.length === 0) {
      onApply(formData);
      resetAfterApply();
      hasOffsetPreviewRef.current = false;
    }
  }, [formData, validationErrors, onApply, resetAfterApply]);

  const handleSave = useCallback(() => {
    if (formData && validationErrors.length === 0) {
      onSave(formData);
      hasOffsetPreviewRef.current = false;
    }
  }, [formData, validationErrors, onSave]);

  // Wrap discard to also revert offset preview
  const handleDiscard = useCallback(() => {
    discardChanges();
    if (hasOffsetPreviewRef.current) {
      revertRef.current?.();
      hasOffsetPreviewRef.current = false;
    }
  }, [discardChanges]);

  // Wrap previewOffset to track preview state
  const handlePreviewOffset = useCallback(
    (data: LinkEditorData) => {
      previewOffset?.(data);
      hasOffsetPreviewRef.current = true;
    },
    [previewOffset]
  );

  useFooterControlsRef(
    onFooterRef,
    Boolean(formData),
    handleApply,
    handleSave,
    hasChanges,
    handleDiscard
  );

  if (!formData) return null;

  const isVethLink = !formData.sourceIsNetwork && !formData.targetIsNetwork;
  const tabs = isVethLink ? ALL_TABS : BASIC_ONLY_TABS;
  const effectiveActiveTab = !isVethLink && activeTab === "extended" ? "basic" : activeTab;

  const tabProps = {
    data: formData,
    onChange: handleChange,
    onPreviewOffset: handlePreviewOffset
  };

  return (
    <EditorPanel
      tabs={tabs}
      activeTab={effectiveActiveTab}
      onTabChange={(id) => setActiveTab(id as LinkEditorTabId)}
      tabProps={tabProps}
      readOnly={readOnly}
    />
  );
};
