/**
 * useStoreInitialization - Hook to initialize Zustand stores with initial data
 *
 * This hook should be called once at the app root to set up initial state
 * from the extension's initial data payload.
 */
import { useEffect, useRef } from "react";

import type { TopoNode, TopoEdge } from "../../shared/types/graph";
import { useGraphStore } from "../stores/graphStore";
import { useTopoViewerStore, parseInitialData } from "../stores/topoViewerStore";

export interface StoreInitializationData {
  initialNodes: TopoNode[];
  initialEdges: TopoEdge[];
  initialData?: unknown;
}

/**
 * Hook to initialize stores with initial data.
 * Should be called once at the app root.
 */
export function useStoreInitialization({
  initialNodes,
  initialEdges,
  initialData
}: StoreInitializationData): void {
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    // Initialize graph store with nodes/edges
    const graphStore = useGraphStore.getState();
    graphStore.setNodes(initialNodes);
    graphStore.setEdges(initialEdges);

    // Initialize topoViewer store with parsed initial data
    if (initialData) {
      const parsedData = parseInitialData(initialData);
      useTopoViewerStore.getState().setInitialData(parsedData);
    }
  }, [initialNodes, initialEdges, initialData]);
}
