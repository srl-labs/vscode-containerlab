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
import React, { createContext, useContext, useMemo, useRef, useCallback } from "react";
import type { Node } from "@xyflow/react";

import {
  useUndoRedo,
  type UseUndoRedoReturn,
  type UndoRedoSnapshot
} from "../hooks/state/useUndoRedo";
import { persistSnapshotChange } from "../hooks/state/snapshotPersistence";

import { useGraph } from "./GraphContext";
import { useTopoViewerActions, useTopoViewerState } from "./TopoViewerContext";

/** Context value shape */
interface UndoRedoContextValue {
  /** Core undo/redo functionality */
  undoRedo: UseUndoRedoReturn;
}

const UndoRedoContext = createContext<UndoRedoContextValue | null>(null);

/** Props for UndoRedoProvider */
interface UndoRedoProviderProps {
  enabled: boolean;
  children: React.ReactNode;
}

/** Provider component for undo/redo context */
export const UndoRedoProvider: React.FC<UndoRedoProviderProps> = ({ enabled, children }) => {
  const { nodes, edges, setNodes, setEdges } = useGraph();
  const { state } = useTopoViewerState();
  const { setEdgeAnnotations } = useTopoViewerActions();

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
    getEdgeAnnotations: () => state.edgeAnnotations,
    setEdgeAnnotations,
    onPersistSnapshot: handlePersistSnapshot
  });

  const value = useMemo<UndoRedoContextValue>(
    () => ({
      undoRedo
    }),
    [undoRedo]
  );

  return <UndoRedoContext.Provider value={value}>{children}</UndoRedoContext.Provider>;
};

/** Hook to access undo/redo context */
export function useUndoRedoContext(): UndoRedoContextValue {
  const context = useContext(UndoRedoContext);
  if (!context) {
    throw new Error("useUndoRedoContext must be used within an UndoRedoProvider");
  }
  return context;
}

/** Hook to just get the undoRedo object (convenience) */
export function useUndoRedoActions(): UseUndoRedoReturn {
  return useUndoRedoContext().undoRedo;
}
