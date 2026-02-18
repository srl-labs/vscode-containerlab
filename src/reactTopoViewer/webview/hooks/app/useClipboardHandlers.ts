/**
 * useClipboardHandlers - Unified clipboard operations with debouncing
 *
 * Provides debounced copy/paste/duplicate/delete handlers
 * using the React Flow clipboard hook.
 */
import React from "react";
import type { ReactFlowInstance } from "@xyflow/react";

import type { TopoNode, TopoEdge } from "../../../shared/types/graph";

import { useClipboard, type UseClipboardOptions } from "./useClipboard";
/**
 * Annotations interface subset for clipboard operations
 * Avoids circular dependency with AnnotationContext.tsx
 */
interface AnnotationsClipboardSubset {
  getNodeMembership: (nodeId: string) => string | null;
  addNodeToGroup: (nodeId: string, groupId: string) => void;
  deleteAllSelected: () => void;
}

/** Debounce interval in milliseconds */
const DEBOUNCE_MS = 50;

/**
 * Configuration for useClipboardHandlers hook
 */
export interface ClipboardHandlersConfig {
  annotations: AnnotationsClipboardSubset;
  rfInstance?: ReactFlowInstance | null;
  /** Callback for node creation (includes YAML persistence and undo) */
  handleNodeCreatedCallback?: (
    nodeId: string,
    nodeElement: TopoNode,
    position: { x: number; y: number }
  ) => void;
  /** Callback for edge creation (includes YAML persistence and undo) */
  handleEdgeCreated?: (
    sourceId: string,
    targetId: string,
    edgeData: {
      id: string;
      source: string;
      target: string;
      sourceEndpoint: string;
      targetEndpoint: string;
    }
  ) => void;
  /** Batch paste handler for unified undo/redo */
  handleBatchPaste?: (result: { nodes: TopoNode[]; edges: TopoEdge[] }) => void;
}

/**
 * Return type for useClipboardHandlers hook
 */
export interface ClipboardHandlersReturn {
  /** Debounced copy handler */
  handleUnifiedCopy: () => void;
  /** Debounced paste handler */
  handleUnifiedPaste: () => void;
  /** Debounced duplicate handler (copy + paste) */
  handleUnifiedDuplicate: () => void;
  /** Delete selected elements (graph + annotations) */
  handleUnifiedDelete: () => void;
  /** Check if clipboard has data (async) */
  hasClipboardData: () => boolean;
}

/**
 * Hook that provides debounced clipboard operations.
 */
export function useClipboardHandlers(config: ClipboardHandlersConfig): ClipboardHandlersReturn {
  const {
    annotations,
    handleNodeCreatedCallback,
    handleEdgeCreated,
    handleBatchPaste,
    rfInstance
  } = config;

  // Build clipboard options with persistence callbacks
  const clipboardOptions: UseClipboardOptions = React.useMemo(
    () => ({
      rfInstance,
      onNodeCreated: handleNodeCreatedCallback,
      onEdgeCreated: handleEdgeCreated,
      getNodeMembership: annotations.getNodeMembership,
      addNodeToGroup: annotations.addNodeToGroup,
      onPasteComplete: handleBatchPaste
    }),
    [
      rfInstance,
      handleNodeCreatedCallback,
      handleEdgeCreated,
      handleBatchPaste,
      annotations.getNodeMembership,
      annotations.addNodeToGroup
    ]
  );

  // Use the React Flow clipboard hook with persistence callbacks
  const clipboard = useClipboard(clipboardOptions);

  // Track if clipboard has data (synced periodically)
  const [hasData, setHasData] = React.useState(false);

  // Check clipboard on mount and after operations
  const checkClipboard = React.useCallback(async () => {
    const has = await clipboard.hasClipboardData();
    setHasData(has);
  }, [clipboard]);

  React.useEffect(() => {
    void checkClipboard();
  }, [checkClipboard]);

  // Debounce refs
  const lastCopyTimeRef = React.useRef(0);
  const lastPasteTimeRef = React.useRef(0);
  const lastDuplicateTimeRef = React.useRef(0);

  // Debounced copy
  const handleUnifiedCopy = React.useCallback(() => {
    const now = Date.now();
    if (now - lastCopyTimeRef.current < DEBOUNCE_MS) return;
    lastCopyTimeRef.current = now;
    void clipboard.copy().then(() => checkClipboard());
  }, [clipboard, checkClipboard]);

  // Debounced paste
  const handleUnifiedPaste = React.useCallback(() => {
    const now = Date.now();
    if (now - lastPasteTimeRef.current < DEBOUNCE_MS) return;
    lastPasteTimeRef.current = now;
    void clipboard.paste();
  }, [clipboard]);

  // Debounced duplicate (copy + paste)
  const handleUnifiedDuplicate = React.useCallback(() => {
    const now = Date.now();
    if (now - lastDuplicateTimeRef.current < DEBOUNCE_MS) return;
    lastDuplicateTimeRef.current = now;
    void clipboard.copy().then(async (success) => {
      if (success) {
        await clipboard.paste();
      }
    });
  }, [clipboard]);

  // Delete handler (graph elements + annotations)
  const handleUnifiedDelete = React.useCallback(() => {
    annotations.deleteAllSelected();
  }, [annotations]);

  // Synchronous check (uses cached state)
  const hasClipboardData = React.useCallback(() => hasData, [hasData]);

  return {
    handleUnifiedCopy,
    handleUnifiedPaste,
    handleUnifiedDuplicate,
    handleUnifiedDelete,
    hasClipboardData
  };
}
