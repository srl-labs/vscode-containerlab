/**
 * useClipboardHandlers - Unified clipboard operations with debouncing
 *
 * Extracts clipboard handling from App.tsx:
 * - useUnifiedClipboard call
 * - Debounced copy/paste/duplicate/delete handlers
 * - Viewport center calculation
 */
import React from "react";

import {
  useUnifiedClipboard,
  type UseUnifiedClipboardOptions
} from "../clipboard/useUnifiedClipboard";
import type {
  GroupStyleAnnotation,
  FreeTextAnnotation,
  FreeShapeAnnotation
} from "../../../shared/types/topology";

/**
 * Annotations interface subset for clipboard operations
 * Avoids circular dependency with AnnotationContext.tsx
 */
interface AnnotationsClipboardSubset {
  groups: GroupStyleAnnotation[];
  textAnnotations: FreeTextAnnotation[];
  shapeAnnotations: FreeShapeAnnotation[];
  getNodeMembership: (nodeId: string) => string | null;
  getGroupMembers: (groupId: string) => string[];
  selectedGroupIds: Set<string>;
  selectedTextIds: Set<string>;
  selectedShapeIds: Set<string>;
  addGroupWithUndo: (group: GroupStyleAnnotation) => void;
  saveTextAnnotation: (annotation: FreeTextAnnotation) => void;
  saveShapeAnnotation: (annotation: FreeShapeAnnotation) => void;
  addNodeToGroup: (nodeId: string, groupId: string) => void;
  generateGroupId: () => string;
  deleteAllSelected: () => void;
}

/** Debounce interval in milliseconds */
const DEBOUNCE_MS = 50;

/**
 * Configuration for useClipboardHandlers hook
 */
export interface ClipboardHandlersConfig {
  cyCompat: null;
  annotations: AnnotationsClipboardSubset;
  undoRedo: {
    beginBatch: () => void;
    endBatch: () => void;
  };
  handleNodeCreatedCallback: UseUnifiedClipboardOptions["onCreateNode"];
  handleEdgeCreated: UseUnifiedClipboardOptions["onCreateEdge"];
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
  /** Check if clipboard has data */
  hasClipboardData: () => boolean;
}

/**
 * Hook that provides debounced clipboard operations.
 *
 * Consolidates ~70 lines of clipboard code from App.tsx into a single hook.
 */
export function useClipboardHandlers(config: ClipboardHandlersConfig): ClipboardHandlersReturn {
  const { cyCompat, annotations, undoRedo, handleNodeCreatedCallback, handleEdgeCreated } = config;

  // Viewport center for paste operations
  const getViewportCenter = React.useCallback(() => {
    // Disabled during ReactFlow migration - use default center
    // TODO: Use ReactFlow's getViewport() for actual center
    void cyCompat;
    return { x: 0, y: 0 };
  }, [cyCompat]);

  // Unified clipboard hook
  const unifiedClipboard = useUnifiedClipboard({
    cyCompat,
    groups: annotations.groups,
    textAnnotations: annotations.textAnnotations,
    shapeAnnotations: annotations.shapeAnnotations,
    getNodeMembership: annotations.getNodeMembership,
    getGroupMembers: annotations.getGroupMembers,
    selectedGroupIds: annotations.selectedGroupIds,
    selectedTextAnnotationIds: annotations.selectedTextIds,
    selectedShapeAnnotationIds: annotations.selectedShapeIds,
    onAddGroup: annotations.addGroupWithUndo,
    onAddTextAnnotation: annotations.saveTextAnnotation,
    onAddShapeAnnotation: annotations.saveShapeAnnotation,
    onAddNodeToGroup: annotations.addNodeToGroup,
    generateGroupId: annotations.generateGroupId,
    onCreateNode: handleNodeCreatedCallback,
    onCreateEdge: handleEdgeCreated,
    beginUndoBatch: undoRedo.beginBatch,
    endUndoBatch: undoRedo.endBatch
  });

  const getPasteAnchor = React.useCallback(() => {
    const viewportCenter = getViewportCenter();
    // Disabled during ReactFlow migration - always use viewport center
    void cyCompat;
    const clipboardData = unifiedClipboard.getClipboardData();
    if (!clipboardData) return viewportCenter;

    // For now, always prefer the origin when available since extent() isn't available
    return clipboardData.origin ?? viewportCenter;
  }, [cyCompat, getViewportCenter, unifiedClipboard]);

  // Debounce refs
  const lastCopyTimeRef = React.useRef(0);
  const lastPasteTimeRef = React.useRef(0);
  const lastDuplicateTimeRef = React.useRef(0);

  // Debounced copy
  const handleUnifiedCopy = React.useCallback(() => {
    const now = Date.now();
    if (now - lastCopyTimeRef.current < DEBOUNCE_MS) return;
    lastCopyTimeRef.current = now;
    unifiedClipboard.copy();
  }, [unifiedClipboard]);

  // Debounced paste
  const handleUnifiedPaste = React.useCallback(() => {
    const now = Date.now();
    if (now - lastPasteTimeRef.current < DEBOUNCE_MS) return;
    lastPasteTimeRef.current = now;
    unifiedClipboard.paste(getPasteAnchor());
  }, [unifiedClipboard, getPasteAnchor]);

  // Debounced duplicate
  const handleUnifiedDuplicate = React.useCallback(() => {
    const now = Date.now();
    if (now - lastDuplicateTimeRef.current < DEBOUNCE_MS) return;
    lastDuplicateTimeRef.current = now;
    if (unifiedClipboard.copy()) unifiedClipboard.paste(getPasteAnchor());
  }, [unifiedClipboard, getPasteAnchor]);

  // Delete handler (graph elements + annotations)
  const handleUnifiedDelete = React.useCallback(() => {
    // Graph deletion is handled by keyboard/context-menu handlers that go through
    // state + persistence. This unified delete is for annotations only.
    annotations.deleteAllSelected();
  }, [annotations]);

  return {
    handleUnifiedCopy,
    handleUnifiedPaste,
    handleUnifiedDuplicate,
    handleUnifiedDelete,
    hasClipboardData: unifiedClipboard.hasClipboardData
  };
}
