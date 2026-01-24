/**
 * Graph Undo/Redo Handlers for React Flow
 * Composes smaller hooks to provide complete undo/redo functionality
 */
import { useCallback, useMemo } from "react";
import type { Node, Edge } from "@xyflow/react";

import type { CyElement } from "../../../shared/types/messages";
import type {
  NodePositionEntry,
  GraphChange,
  UndoRedoActionAnnotation,
  UndoRedoAction
} from "../state/useUndoRedo";
import { log } from "../../utils/logger";

import { useUndoRedoState } from "./useUndoRedoState";
import { useUndoRedoAppliers } from "./useUndoRedoAppliers";
import { useUndoRedoDeleteHandlers } from "./useUndoRedoDeleteHandlers";

/**
 * Options for the useGraphUndoRedoHandlers hook
 */
export interface UseGraphUndoRedoHandlersOptions {
  mode: "edit" | "view";
  getNodes: () => Node[];
  getEdges: () => Edge[];
  setNodePositions: (positions: NodePositionEntry[]) => void;
  addNode: (node: CyElement) => void;
  addEdge: (edge: CyElement) => void;
  removeNodeAndEdges: (nodeId: string) => void;
  removeEdge: (edgeId: string) => void;
  updateNodes: (updater: (nodes: Node[]) => Node[]) => void;
  updateEdges: (updater: (edges: Edge[]) => Edge[]) => void;
  applyAnnotationChange?: (action: UndoRedoActionAnnotation, isUndo: boolean) => void;
}

/**
 * Return type for the useGraphUndoRedoHandlers hook
 */
export interface UseGraphUndoRedoHandlersReturn {
  undoRedo: {
    canUndo: boolean;
    canRedo: boolean;
    undoCount: number;
    redoCount: number;
    undo: () => void;
    redo: () => void;
    pushAction: (action: UndoRedoAction) => void;
    recordMove: (beforePositions: NodePositionEntry[], afterPositions: NodePositionEntry[]) => void;
    clearHistory: () => void;
  };
  handleDeleteNodeWithUndo: (nodeId: string) => void;
  handleDeleteLinkWithUndo: (edgeId: string) => void;
  recordPropertyEdit: (action: {
    entityType: "node" | "link";
    entityId: string;
    before: Record<string, unknown>;
    after: Record<string, unknown>;
  }) => void;
}

/**
 * Hook for graph undo/redo handlers with React Flow integration
 */
export function useGraphUndoRedoHandlers(
  options: UseGraphUndoRedoHandlersOptions
): UseGraphUndoRedoHandlersReturn {
  const {
    mode,
    getNodes,
    getEdges,
    setNodePositions,
    addNode,
    addEdge,
    removeNodeAndEdges,
    removeEdge,
    updateNodes,
    updateEdges,
    applyAnnotationChange
  } = options;

  const isEnabled = mode === "edit";

  // Get appliers first (needs isApplyingRef from state)
  const appliersOptions = useMemo(
    () => ({
      setNodePositions,
      addNode,
      addEdge,
      removeNodeAndEdges,
      removeEdge,
      updateNodes,
      updateEdges,
      applyAnnotationChange,
      isApplyingRef: { current: false }
    }),
    [
      setNodePositions,
      addNode,
      addEdge,
      removeNodeAndEdges,
      removeEdge,
      updateNodes,
      updateEdges,
      applyAnnotationChange
    ]
  );

  const { applyAction } = useUndoRedoAppliers(appliersOptions);

  // Core undo/redo state
  const undoRedoState = useUndoRedoState({
    isEnabled,
    onApplyAction: applyAction
  });

  // Update the ref in appliers to use the one from state
  appliersOptions.isApplyingRef = undoRedoState.isApplyingRef;

  // Delete handlers
  const { handleDeleteNodeWithUndo, handleDeleteLinkWithUndo } = useUndoRedoDeleteHandlers({
    isEnabled,
    isApplyingRef: undoRedoState.isApplyingRef,
    getNodes,
    getEdges,
    removeNodeAndEdges,
    removeEdge,
    updateNodes,
    updateEdges,
    pushAction: undoRedoState.pushAction
  });

  // Property edit recording
  const recordPropertyEdit = useCallback(
    (action: {
      entityType: "node" | "link";
      entityId: string;
      before: Record<string, unknown>;
      after: Record<string, unknown>;
    }) => {
      if (!isEnabled || undoRedoState.isApplyingRef.current) return;

      undoRedoState.pushAction({
        type: "property-edit",
        entityType: action.entityType,
        entityId: action.entityId,
        before: action.before,
        after: action.after
      });

      log.info(`[UndoRedo] Recorded property edit for ${action.entityType} ${action.entityId}`);
    },
    [isEnabled, undoRedoState]
  );

  // Compose the undoRedo object
  const undoRedo = useMemo(
    () => ({
      canUndo: undoRedoState.canUndo,
      canRedo: undoRedoState.canRedo,
      undoCount: undoRedoState.undoCount,
      redoCount: undoRedoState.redoCount,
      undo: undoRedoState.undo,
      redo: undoRedoState.redo,
      pushAction: undoRedoState.pushAction,
      recordMove: undoRedoState.recordMove,
      clearHistory: undoRedoState.clearHistory
    }),
    [undoRedoState]
  );

  return useMemo(
    () => ({
      undoRedo,
      handleDeleteNodeWithUndo,
      handleDeleteLinkWithUndo,
      recordPropertyEdit
    }),
    [undoRedo, handleDeleteNodeWithUndo, handleDeleteLinkWithUndo, recordPropertyEdit]
  );
}

// Re-export types for convenience
export type { NodePositionEntry, GraphChange };
