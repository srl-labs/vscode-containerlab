/**
 * useNodeEditorForm - Form state management for the Node Editor
 * Extracted from NodeEditorView.tsx
 */
import { useState, useEffect, useCallback, useRef, useMemo } from "react";

import type { NodeEditorData, NodeEditorTabId } from "../../components/panels/node-editor/types";
import { convertEditorDataToNodeSaveData } from "../../../shared/utilities";

import { applyFormUpdates } from "./formState";

/** Maps YAML kebab-case keys to camelCase NodeEditorData keys */
export const YAML_TO_EDITOR_MAP: Partial<Record<string, keyof NodeEditorData>> = {
  "startup-config": "startupConfig",
  "enforce-startup-config": "enforceStartupConfig",
  "suppress-startup-config": "suppressStartupConfig",
  "env-files": "envFiles",
  "restart-policy": "restartPolicy",
  "auto-remove": "autoRemove",
  "startup-delay": "startupDelay",
  "mgmt-ipv4": "mgmtIpv4",
  "mgmt-ipv6": "mgmtIpv6",
  "network-mode": "networkMode",
  "cpu-set": "cpuSet",
  "shm-size": "shmSize",
  "cap-add": "capAdd",
  "image-pull-policy": "imagePullPolicy"
};

export function hasFieldChanged(
  yamlKey: string,
  formData: NodeEditorData,
  initialData: NodeEditorData
): boolean {
  const editorKey = YAML_TO_EDITOR_MAP[yamlKey] ?? yamlKey;
  const currentVal: unknown = Reflect.get(formData, editorKey);
  const initialVal: unknown = Reflect.get(initialData, editorKey);
  return JSON.stringify(currentVal) !== JSON.stringify(initialVal);
}

export interface UseNodeEditorFormReturn {
  activeTab: NodeEditorTabId;
  setActiveTab: (tab: NodeEditorTabId) => void;
  formData: NodeEditorData | null;
  handleChange: (updates: Partial<NodeEditorData>) => void;
  hasChanges: boolean;
  resetAfterApply: () => void;
  discardChanges: () => void;
  originalData: NodeEditorData | null;
}

function normalizeForDirtyCheck(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizeForDirtyCheck(entry))
      .filter((entry) => entry !== undefined && entry !== null);
  }

  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value)
      .map(([key, entry]) => [key, normalizeForDirtyCheck(entry)] as const)
      .filter(([, entry]) => entry !== undefined && entry !== null)
      .sort(([a], [b]) => a.localeCompare(b));

    if (entries.length === 0) return undefined;

    const normalized: Record<string, unknown> = {};
    for (const [key, entry] of entries) {
      normalized[key] = entry;
    }
    return normalized;
  }

  return value;
}

function toDirtySnapshot(data: NodeEditorData): string {
  const saveData = convertEditorDataToNodeSaveData(data);
  const normalized = normalizeForDirtyCheck(saveData);
  return JSON.stringify(normalized);
}

export function useNodeEditorForm(
  nodeData: NodeEditorData | null,
  readOnly = false
): UseNodeEditorFormReturn {
  const [activeTab, setActiveTab] = useState<NodeEditorTabId>("basic");
  const [formData, setFormData] = useState<NodeEditorData | null>(null);
  const [lastAppliedData, setLastAppliedData] = useState<NodeEditorData | null>(null);
  const [originalData, setOriginalData] = useState<NodeEditorData | null>(null);
  const [loadedNodeId, setLoadedNodeId] = useState<string | null>(null);
  const skipNextSyncRef = useRef(false);

  useEffect(() => {
    if (nodeData && nodeData.id !== loadedNodeId) {
      setFormData({ ...nodeData });
      setLastAppliedData({ ...nodeData });
      setOriginalData({ ...nodeData });
      setLoadedNodeId(nodeData.id);
      setActiveTab("basic");
      skipNextSyncRef.current = false;
    } else if (nodeData && nodeData.id === loadedNodeId) {
      if (skipNextSyncRef.current) {
        skipNextSyncRef.current = false;
        return;
      }
      setFormData({ ...nodeData });
      setLastAppliedData({ ...nodeData });
    } else if (nodeData === null && loadedNodeId !== null) {
      setLoadedNodeId(null);
      skipNextSyncRef.current = false;
    }
  }, [nodeData, loadedNodeId]);

  const handleChange = useCallback(
    (updates: Partial<NodeEditorData>) => {
      applyFormUpdates(readOnly, setFormData, updates);
    },
    [readOnly]
  );

  const resetAfterApply = useCallback(() => {
    if (formData) {
      setLastAppliedData({ ...formData });
      skipNextSyncRef.current = true;
    }
  }, [formData]);

  const discardChanges = useCallback(() => {
    if (lastAppliedData) setFormData({ ...lastAppliedData });
  }, [lastAppliedData]);

  const hasChanges = useMemo(() => {
    if (!formData || !lastAppliedData) return false;
    return toDirtySnapshot(formData) !== toDirtySnapshot(lastAppliedData);
  }, [formData, lastAppliedData]);

  return {
    activeTab,
    setActiveTab,
    formData,
    handleChange,
    hasChanges,
    resetAfterApply,
    discardChanges,
    originalData
  };
}
