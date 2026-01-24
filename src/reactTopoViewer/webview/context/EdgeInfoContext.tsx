/**
 * EdgeInfoContext - Pre-computed parallel edge information for O(1) lookups
 *
 * This context pre-computes which edges are parallel (between the same node pair)
 * and their ordering, so individual edge components don't need to filter through
 * all edges (avoiding O(n²) complexity).
 */
import type { ReactNode } from "react";
import React, { createContext, useContext, useMemo } from "react";
import { useEdges, type Edge } from "@xyflow/react";

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

interface EdgeInfoContextValue {
  /** Get parallel edge info for an edge. Returns null if edge not found. */
  getParallelInfo: (edgeId: string) => ParallelEdgeInfo | null;
  /** Get loop edge info for a loop edge. Returns null if not a loop edge. */
  getLoopInfo: (edgeId: string) => LoopEdgeInfo | null;
}

const EdgeInfoContext = createContext<EdgeInfoContextValue>({
  getParallelInfo: () => null,
  getLoopInfo: () => null
});

interface EdgeInfoProviderProps {
  children: ReactNode;
}

/** Group edges by loop/regular and categorize by node pair */
function groupEdges(edges: Edge[]) {
  const edgesByPair = new Map<string, { id: string; source: string; target: string }[]>();
  const loopEdgesByNode = new Map<string, string[]>();

  for (const edge of edges) {
    if (edge.source === edge.target) {
      // Loop edge
      const loops = loopEdgesByNode.get(edge.source) || [];
      loops.push(edge.id);
      loopEdgesByNode.set(edge.source, loops);
    } else {
      // Regular edge - use canonical key (sorted node IDs)
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

/**
 * Provider that pre-computes edge parallel/loop info for all edges.
 * Place this inside ReactFlowProvider but wrapping the ReactFlow component.
 */
export const EdgeInfoProvider: React.FC<EdgeInfoProviderProps> = ({ children }) => {
  const edges = useEdges();

  const value = useMemo(() => {
    const parallelInfoMap = new Map<string, ParallelEdgeInfo>();
    const loopInfoMap = new Map<string, LoopEdgeInfo>();

    const { edgesByPair, loopEdgesByNode } = groupEdges(edges);
    processLoopEdges(loopEdgesByNode, loopInfoMap);
    processParallelEdges(edgesByPair, parallelInfoMap);

    return {
      getParallelInfo: (edgeId: string) => parallelInfoMap.get(edgeId) ?? null,
      getLoopInfo: (edgeId: string) => loopInfoMap.get(edgeId) ?? null
    };
  }, [edges]);

  return <EdgeInfoContext.Provider value={value}>{children}</EdgeInfoContext.Provider>;
};

/**
 * Hook to access pre-computed edge info
 */
export const useEdgeInfo = (): EdgeInfoContextValue => {
  return useContext(EdgeInfoContext);
};
