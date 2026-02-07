/**
 * LinkEditorView - Link editor content for the ContextPanel
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Box from "@mui/material/Box";

import type { TabDefinition } from "../../../ui/editor";
import { TabNavigation } from "../../../ui/editor/TabNavigation";
import { useFooterControlsRef } from "../../../../hooks/ui";
import type { LinkEditorData, LinkEditorTabId } from "../../link-editor/types";
import { BasicTab } from "../../link-editor/BasicTab";
import { ExtendedTab, validateLinkEditorData } from "../../link-editor/ExtendedTab";

export interface LinkEditorViewProps {
  linkData: LinkEditorData | null;
  onSave: (data: LinkEditorData) => void;
  onApply: (data: LinkEditorData) => void;
  onAutoApplyOffset?: (data: LinkEditorData) => void;
  onFooterRef?: (ref: LinkEditorFooterRef | null) => void;
}

export interface LinkEditorFooterRef {
  handleApply: () => void;
  handleSave: () => void;
  hasChanges: boolean;
}

const ALL_TABS: TabDefinition[] = [
  { id: "basic", label: "Basic" },
  { id: "extended", label: "Extended" }
];

const BASIC_ONLY_TABS: TabDefinition[] = [{ id: "basic", label: "Basic" }];

function useLinkEditorForm(linkData: LinkEditorData | null) {
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

  const handleChange = useCallback((updates: Partial<LinkEditorData>) => {
    setFormData((prev) => (prev ? { ...prev, ...updates } : null));
  }, []);

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

  const markOffsetApplied = useCallback((offset?: number, enabled?: boolean) => {
    setInitialData((prev) => {
      if (!prev) return prev;
      try {
        const parsed = JSON.parse(prev) as LinkEditorData;
        const next = { ...parsed, endpointLabelOffset: offset, endpointLabelOffsetEnabled: enabled };
        const serialized = JSON.stringify(next);
        initialDataRef.current = serialized;
        return serialized;
      } catch {
        return prev;
      }
    });
  }, []);

  const hasChanges = formData && initialData ? JSON.stringify(formData) !== initialData : false;

  return { activeTab, setActiveTab, formData, handleChange, hasChanges, resetAfterApply, markOffsetApplied };
}

const ValidationBanner: React.FC<{ errors: string[] }> = ({ errors }) => {
  if (errors.length === 0) return null;
  return (
    <Box
      sx={{
        mb: 1,
        p: 1,
        borderRadius: 0.5,
        backgroundColor: "var(--vscode-inputValidation-errorBackground)",
        border: "1px solid var(--vscode-inputValidation-errorBorder)"
      }}
    >
      <Box sx={{ color: "var(--vscode-editorError-foreground)", fontSize: "0.875rem", fontWeight: 600 }}>
        Invalid link configuration
      </Box>
      <Box sx={{ color: "var(--vscode-editorError-foreground)", fontSize: "0.75rem", mt: 0.5 }}>
        {errors.map((error, i) => (
          <Box key={i}>{error}</Box>
        ))}
      </Box>
    </Box>
  );
};

export const LinkEditorView: React.FC<LinkEditorViewProps> = ({
  linkData,
  onSave,
  onApply,
  onAutoApplyOffset,
  onFooterRef
}) => {
  const { activeTab, setActiveTab, formData, handleChange, hasChanges, resetAfterApply, markOffsetApplied } =
    useLinkEditorForm(linkData);

  const validationErrors = useMemo(() => {
    if (!formData) return [];
    return validateLinkEditorData(formData);
  }, [formData]);

  const handleApply = useCallback(() => {
    if (formData && validationErrors.length === 0) {
      onApply(formData);
      resetAfterApply();
    }
  }, [formData, validationErrors, onApply, resetAfterApply]);

  const handleSave = useCallback(() => {
    if (formData && validationErrors.length === 0) onSave(formData);
  }, [formData, validationErrors, onSave]);

  const handleAutoApplyOffset = useCallback(
    (nextData: LinkEditorData) => {
      if (!onAutoApplyOffset) return;
      onAutoApplyOffset(nextData);
      markOffsetApplied(nextData.endpointLabelOffset, nextData.endpointLabelOffsetEnabled);
    },
    [onAutoApplyOffset, markOffsetApplied]
  );

  useFooterControlsRef(onFooterRef, Boolean(formData), handleApply, handleSave, hasChanges);

  if (!formData) return null;

  const isVethLink = !formData.sourceIsNetwork && !formData.targetIsNetwork;
  const tabs = isVethLink ? ALL_TABS : BASIC_ONLY_TABS;
  const effectiveActiveTab = !isVethLink && activeTab === "extended" ? "basic" : activeTab;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <TabNavigation
        tabs={tabs}
        activeTab={effectiveActiveTab}
        onTabChange={(id) => setActiveTab(id as LinkEditorTabId)}
      />
      <Box sx={{ p: 2, flex: 1, overflow: "auto" }}>
        <ValidationBanner errors={validationErrors} />
        {effectiveActiveTab === "basic" ? (
          <BasicTab data={formData} onChange={handleChange} onAutoApplyOffset={handleAutoApplyOffset} />
        ) : (
          <ExtendedTab data={formData} onChange={handleChange} />
        )}
      </Box>
    </Box>
  );
};
