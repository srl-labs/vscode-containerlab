/**
 * canvasStore - Zustand store for canvas-scoped state
 *
 * Manages link creation, render config, and annotation handlers.
 * Edge info (parallel/loop) is computed separately as derived data.
 */
import { create } from "zustand";
import type { Edge } from "@xyflow/react";

import type { AnnotationHandlers, EdgeLabelMode } from "../components/canvas/types";

// Re-export types from canvas/types for convenience
export type { EdgeLabelMode } from "../components/canvas/types";

export interface EdgeRenderConfig {
  labelMode: EdgeLabelMode;
  suppressLabels: boolean;
  suppressHitArea: boolean;
}

export interface NodeRenderConfig {
  suppressLabels: boolean;
}

export interface ParallelEdgeInfo {
  /** Index of this edge within its parallel group */
  index: number;
  /** Total number of edges in this parallel group */
  total: number;
  /** True if edge direction matches canonical direction (smaller nodeId → larger nodeId) */
  isCanonicalDirection: boolean;
}

export interface LoopEdgeInfo {
  /** Index of this loop edge on the node */
  loopIndex: number;
}

export interface EdgeInfo {
  getParallelInfo: (edgeId: string) => ParallelEdgeInfo | null;
  getLoopInfo: (edgeId: string) => LoopEdgeInfo | null;
}

export interface CanvasState {
  linkSourceNode: string | null;
  edgeRenderConfig: EdgeRenderConfig;
  nodeRenderConfig: NodeRenderConfig;
  annotationHandlers: AnnotationHandlers | null;
  // Internal cache for edge info computation
  _edgeInfoCache: {
    edgesRef: Edge[] | null;
    info: EdgeInfo | null;
  };
}

export interface CanvasActions {
  setLinkSourceNode: (nodeId: string | null) => void;
  setEdgeRenderConfig: (config: EdgeRenderConfig) => void;
  setNodeRenderConfig: (config: NodeRenderConfig) => void;
  setAnnotationHandlers: (handlers: AnnotationHandlers | null) => void;
  getEdgeInfo: (edges: Edge[]) => EdgeInfo;
}

export type CanvasStore = CanvasState & CanvasActions;

// ============================================================================
// Edge Info Computation (extracted for reuse)
// ============================================================================

/** Group edges by loop/regular and categorize by node pair */
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

/** Process loop edges and populate the loop info map */
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

/** Process parallel edge groups and populate the parallel info map */
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

/** Build edge info from edges array */
export function buildEdgeInfo(edges: Edge[]): EdgeInfo {
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

// ============================================================================
// Initial State
// ============================================================================

const defaultEdgeRenderConfig: EdgeRenderConfig = {
  labelMode: "show-all",
  suppressLabels: false,
  suppressHitArea: false
};

const defaultNodeRenderConfig: NodeRenderConfig = {
  suppressLabels: false
};

const initialState: CanvasState = {
  linkSourceNode: null,
  edgeRenderConfig: defaultEdgeRenderConfig,
  nodeRenderConfig: defaultNodeRenderConfig,
  annotationHandlers: null,
  _edgeInfoCache: {
    edgesRef: null,
    info: null
  }
};

// ============================================================================
// Store Creation
// ============================================================================

export const useCanvasStore = create<CanvasStore>((set, get) => ({
  ...initialState,

  setLinkSourceNode: (linkSourceNode) => {
    set({ linkSourceNode });
  },

  setEdgeRenderConfig: (edgeRenderConfig) => {
    set({ edgeRenderConfig });
  },

  setNodeRenderConfig: (nodeRenderConfig) => {
    set({ nodeRenderConfig });
  },

  setAnnotationHandlers: (annotationHandlers) => {
    set({ annotationHandlers });
  },

  // Compute edge info with caching (only recompute if edges array changed)
  getEdgeInfo: (edges) => {
    const state = get();

    // If same reference, return cached
    if (state._edgeInfoCache.edgesRef === edges && state._edgeInfoCache.info) {
      return state._edgeInfoCache.info;
    }

    // Compute new edge info
    const info = buildEdgeInfo(edges);

    // Update cache (without triggering re-render for consumers not using _edgeInfoCache)
    set({
      _edgeInfoCache: {
        edgesRef: edges,
        info
      }
    });

    return info;
  }
}));

// ============================================================================
// Selector Hooks (for convenience)
// ============================================================================

/** Get link source node */
export const useLinkSourceNode = () => useCanvasStore((state) => state.linkSourceNode);

/** Get edge render config */
export const useEdgeRenderConfig = () => useCanvasStore((state) => state.edgeRenderConfig);

/** Get node render config */
export const useNodeRenderConfig = () => useCanvasStore((state) => state.nodeRenderConfig);

/** Get annotation handlers */
export const useAnnotationHandlers = () => useCanvasStore((state) => state.annotationHandlers);

/** Get link creation context (legacy API shape) */
export const useLinkCreationContext = () => {
  const linkSourceNode = useCanvasStore((state) => state.linkSourceNode);
  return { linkSourceNode };
};

/**
 * Hook to get edge info computed from edges array.
 * Uses the store's cached computation.
 */
export function useEdgeInfo(edges: Edge[]): EdgeInfo {
  const getEdgeInfo = useCanvasStore((state) => state.getEdgeInfo);
  return getEdgeInfo(edges);
}
