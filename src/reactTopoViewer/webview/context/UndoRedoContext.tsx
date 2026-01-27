/**
 * UndoRedoContext - Snapshot-based undo/redo management
 *
 * Provides a single undo/redo system for the graph and annotations.
 *
 * IMPORTANT: This context uses React state directly (not refs) to ensure
 * we always have the correct state. When mutating (add/delete), callers
 * MUST pass explicitNodes/explicitEdges to commitChange to provide the
 * expected "after" state, since React state updates are async.
 */
import { useMemo, useRef, useCallback } from "react";
import type { Node } from "@xyflow/react";

import {
  useUndoRedo,
  type UseUndoRedoReturn,
  type UndoRedoSnapshot
} from "../hooks/state/useUndoRedo";
import { persistSnapshotChange } from "../hooks/state/snapshotPersistence";

import type { EdgeAnnotation } from "../../shared/types/topology";
import type { GraphActions, GraphState } from "./GraphContext";
import { useAppSelector } from "./AppContext";

/** Context value shape */
interface UndoRedoContextValue {
  /** Core undo/redo functionality */
  undoRedo: UseUndoRedoReturn;
}

export interface UndoRedoModelProps {
  enabled: boolean;
  graphState: GraphState;
  graphActions: GraphActions;
  edgeAnnotations: EdgeAnnotation[];
  setEdgeAnnotations: (annotations: EdgeAnnotation[]) => void;
}

export function useUndoRedoModel({
  enabled,
  graphState,
  graphActions,
  edgeAnnotations,
  setEdgeAnnotations
}: UndoRedoModelProps): UseUndoRedoReturn {
  const { nodes, edges } = graphState;
  const { setNodes, setEdges } = graphActions;

  // Use refs that are updated synchronously for persistence callbacks
  // These are needed because onPersistSnapshot is called after state updates
  // but we need access to the nodes for annotation persistence
  const nodesRef = useRef<Node[]>(nodes);
  nodesRef.current = nodes; // Update synchronously on each render

  // Stable callback for persistence that captures current nodes
  const handlePersistSnapshot = useCallback(
    (snapshot: UndoRedoSnapshot, direction: "undo" | "redo") => {
      persistSnapshotChange(snapshot, direction, { getNodes: () => nodesRef.current });
    },
    []
  );

  const undoRedo = useUndoRedo({
    enabled,
    // Pass state directly - callers must use explicitNodes/explicitEdges for mutations
    getNodes: () => nodes,
    getEdges: () => edges,
    setNodes,
    setEdges,
    getEdgeAnnotations: () => edgeAnnotations,
    setEdgeAnnotations,
    onPersistSnapshot: handlePersistSnapshot
  });

  return undoRedo;
}

/** Hook to access undo/redo context */
export function useUndoRedoContext(): UndoRedoContextValue {
  const undoRedo = useAppSelector((state) => state.undoRedo);
  return useMemo(() => ({ undoRedo }), [undoRedo]);
}

/** Hook to just get the undoRedo object (convenience) */
export function useUndoRedoActions(): UseUndoRedoReturn {
  return useUndoRedoContext().undoRedo;
}
