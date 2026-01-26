/**
 * UndoRedoContext - Snapshot-based undo/redo management
 *
 * Provides a single undo/redo system for the graph and annotations.
 */
import React, { createContext, useContext, useMemo, useRef, useEffect } from "react";

import { useUndoRedo, type UseUndoRedoReturn } from "../hooks/state/useUndoRedo";
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

  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const edgeAnnotationsRef = useRef(state.edgeAnnotations);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  useEffect(() => {
    edgeAnnotationsRef.current = state.edgeAnnotations;
  }, [state.edgeAnnotations]);

  const undoRedo = useUndoRedo({
    enabled,
    getNodes: () => nodesRef.current,
    getEdges: () => edgesRef.current,
    setNodes,
    setEdges,
    getEdgeAnnotations: () => edgeAnnotationsRef.current,
    setEdgeAnnotations,
    onPersistSnapshot: (snapshot, direction) => {
      persistSnapshotChange(snapshot, direction, { getNodes: () => nodesRef.current });
    }
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
