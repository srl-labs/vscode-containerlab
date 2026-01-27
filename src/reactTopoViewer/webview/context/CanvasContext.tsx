/**
 * CanvasContext - Single provider for canvas-scoped state with selector hooks.
 *
 * Consolidates link creation, render config, edge info, and annotation handlers
 * to avoid deep provider nesting while preventing re-render cascades.
 */
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore
} from "react";
import type { Edge } from "@xyflow/react";

import type { AnnotationHandlers } from "../components/canvas/types";
import type { EdgeRenderConfig, NodeRenderConfig } from "./canvasTypes";

/**
 * Information about a parallel edge group
 */
export interface ParallelEdgeInfo {
  /** Index of this edge within its parallel group */
  index: number;
  /** Total number of edges in this parallel group */
  total: number;
  /** True if edge direction matches canonical direction (smaller nodeId → larger nodeId) */
  isCanonicalDirection: boolean;
}

/**
 * Information for loop edges (source === target)
 */
export interface LoopEdgeInfo {
  /** Index of this loop edge on the node */
  loopIndex: number;
}

interface EdgeInfo {
  getParallelInfo: (edgeId: string) => ParallelEdgeInfo | null;
  getLoopInfo: (edgeId: string) => LoopEdgeInfo | null;
}

interface CanvasState {
  linkSourceNode: string | null;
  edgeRenderConfig: EdgeRenderConfig;
  nodeRenderConfig: NodeRenderConfig;
  annotationHandlers: AnnotationHandlers | null;
  edgeInfo: EdgeInfo;
}

interface CanvasStore {
  getState: () => CanvasState;
  setState: (next: CanvasState) => void;
  subscribe: (listener: () => void) => () => void;
}

const CanvasStoreContext = createContext<CanvasStore | null>(null);

function createCanvasStore(initialState: CanvasState): CanvasStore {
  let state = initialState;
  const listeners = new Set<() => void>();

  return {
    getState: () => state,
    setState: (next: CanvasState) => {
      state = next;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}

/**
 * Group edges by loop/regular and categorize by node pair
 */
function groupEdges(edges: Edge[]) {
  const edgesByPair = new Map<string, { id: string; source: string; target: string }[]>();
  const loopEdgesByNode = new Map<string, string[]>();

  for (const edge of edges) {
    if (edge.source === edge.target) {
      const loops = loopEdgesByNode.get(edge.source) || [];
      loops.push(edge.id);
      loopEdgesByNode.set(edge.source, loops);
    } else {
      const [nodeA, nodeB] =
        edge.source.localeCompare(edge.target) <= 0
          ? [edge.source, edge.target]
          : [edge.target, edge.source];
      const pairKey = `${nodeA}|||${nodeB}`;

      const group = edgesByPair.get(pairKey) || [];
      group.push({ id: edge.id, source: edge.source, target: edge.target });
      edgesByPair.set(pairKey, group);
    }
  }

  return { edgesByPair, loopEdgesByNode };
}

/**
 * Process loop edges and populate the loop info map
 */
function processLoopEdges(
  loopEdgesByNode: Map<string, string[]>,
  loopInfoMap: Map<string, LoopEdgeInfo>
) {
  for (const [, loopEdges] of loopEdgesByNode) {
    loopEdges.sort((a, b) => a.localeCompare(b));
    for (let i = 0; i < loopEdges.length; i++) {
      loopInfoMap.set(loopEdges[i], { loopIndex: i });
    }
  }
}

/**
 * Process parallel edge groups and populate the parallel info map
 */
function processParallelEdges(
  edgesByPair: Map<string, { id: string; source: string; target: string }[]>,
  parallelInfoMap: Map<string, ParallelEdgeInfo>
) {
  for (const [, group] of edgesByPair) {
    group.sort((a, b) => a.id.localeCompare(b.id));

    for (let i = 0; i < group.length; i++) {
      const edge = group[i];
      const isCanonicalDirection = edge.source.localeCompare(edge.target) <= 0;
      parallelInfoMap.set(edge.id, {
        index: i,
        total: group.length,
        isCanonicalDirection
      });
    }
  }
}

function buildEdgeInfo(edges: Edge[]): EdgeInfo {
  const parallelInfoMap = new Map<string, ParallelEdgeInfo>();
  const loopInfoMap = new Map<string, LoopEdgeInfo>();

  const { edgesByPair, loopEdgesByNode } = groupEdges(edges);
  processLoopEdges(loopEdgesByNode, loopInfoMap);
  processParallelEdges(edgesByPair, parallelInfoMap);

  return {
    getParallelInfo: (edgeId: string) => parallelInfoMap.get(edgeId) ?? null,
    getLoopInfo: (edgeId: string) => loopInfoMap.get(edgeId) ?? null
  };
}

export function useCanvasSelector<T>(selector: (state: CanvasState) => T): T {
  const store = useContext(CanvasStoreContext);
  if (!store) {
    throw new Error("useCanvasSelector must be used within a CanvasProvider");
  }
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.getState()),
    () => selector(store.getState())
  );
}

export interface CanvasProviderProps {
  children: React.ReactNode;
  edges: Edge[];
  linkSourceNode: string | null;
  edgeRenderConfig: EdgeRenderConfig;
  nodeRenderConfig: NodeRenderConfig;
  annotationHandlers?: AnnotationHandlers;
}

export const CanvasProvider: React.FC<CanvasProviderProps> = ({
  children,
  edges,
  linkSourceNode,
  edgeRenderConfig,
  nodeRenderConfig,
  annotationHandlers
}) => {
  const stableEdgeRenderConfig = useMemo(
    () => ({
      labelMode: edgeRenderConfig.labelMode,
      suppressLabels: edgeRenderConfig.suppressLabels,
      suppressHitArea: edgeRenderConfig.suppressHitArea
    }),
    [edgeRenderConfig.labelMode, edgeRenderConfig.suppressLabels, edgeRenderConfig.suppressHitArea]
  );

  const stableNodeRenderConfig = useMemo(
    () => ({
      suppressLabels: nodeRenderConfig.suppressLabels
    }),
    [nodeRenderConfig.suppressLabels]
  );

  const edgeInfo = useMemo(() => buildEdgeInfo(edges), [edges]);
  const handlers = annotationHandlers ?? null;

  const state = useMemo<CanvasState>(
    () => ({
      linkSourceNode,
      edgeRenderConfig: stableEdgeRenderConfig,
      nodeRenderConfig: stableNodeRenderConfig,
      annotationHandlers: handlers,
      edgeInfo
    }),
    [linkSourceNode, stableEdgeRenderConfig, stableNodeRenderConfig, handlers, edgeInfo]
  );

  const storeRef = useRef<CanvasStore | null>(null);
  if (!storeRef.current) {
    storeRef.current = createCanvasStore(state);
  }

  useEffect(() => {
    storeRef.current?.setState(state);
  }, [state]);

  return (
    <CanvasStoreContext.Provider value={storeRef.current}>{children}</CanvasStoreContext.Provider>
  );
};

// Convenience hooks that preserve the legacy API shape.
export function useLinkCreationContext(): { linkSourceNode: string | null } {
  const linkSourceNode = useCanvasSelector((state) => state.linkSourceNode);
  return useMemo(() => ({ linkSourceNode }), [linkSourceNode]);
}

export function useEdgeRenderConfig(): EdgeRenderConfig {
  return useCanvasSelector((state) => state.edgeRenderConfig);
}

export function useNodeRenderConfig(): NodeRenderConfig {
  return useCanvasSelector((state) => state.nodeRenderConfig);
}

export function useAnnotationHandlers(): AnnotationHandlers | null {
  return useCanvasSelector((state) => state.annotationHandlers);
}

export function useEdgeInfo(): EdgeInfo {
  return useCanvasSelector((state) => state.edgeInfo);
}
