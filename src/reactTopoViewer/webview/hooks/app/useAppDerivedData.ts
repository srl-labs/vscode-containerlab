/**
 * useAppDerivedData - derived graph and selection data for AppContent.
 */
import React from "react";

import type { TopoEdge, TopoNode } from "../../../shared/types/graph";
import type { TopoViewerState } from "../../stores/topoViewerStore";
import { buildEdgeAnnotationLookup } from "../../annotations/edgeAnnotations";

import { useFilteredGraphElements, useSelectionData } from "./useAppContentHelpers";

interface AppDerivedDataParams {
  state: TopoViewerState;
  nodes: TopoNode[];
  edges: TopoEdge[];
}

export function useAppDerivedData({ state, nodes, edges }: AppDerivedDataParams) {
  const edgeAnnotationLookup = React.useMemo(
    () => buildEdgeAnnotationLookup(state.edgeAnnotations),
    [state.edgeAnnotations]
  );

  const { filteredNodes, filteredEdges } = useFilteredGraphElements(
    nodes,
    edges,
    state.showDummyLinks
  );

  const selectionData = useSelectionData(state, nodes, edges, edgeAnnotationLookup);

  return { filteredNodes, filteredEdges, selectionData, edgeAnnotationLookup };
}
