/**
 * Initial graph data hook - consolidates initial data parsing for the App entry.
 */
import React from "react";

import type { TopoEdge, TopoNode } from "../../../shared/types/graph";
import type {
  FreeTextAnnotation,
  FreeShapeAnnotation,
  GroupStyleAnnotation,
  NodeAnnotation
} from "../../../shared/types/topology";
import { annotationsToNodes } from "../../utils/annotationNodeConverters";
import { applyGroupMembershipToNodes } from "../../utils/groupMembership";

interface InitialGraphData {
  nodes?: TopoNode[];
  edges?: TopoEdge[];
  freeTextAnnotations?: FreeTextAnnotation[];
  freeShapeAnnotations?: FreeShapeAnnotation[];
  groupStyleAnnotations?: GroupStyleAnnotation[];
  nodeAnnotations?: NodeAnnotation[];
}

function getInitialData(): InitialGraphData {
  return (window as { __INITIAL_DATA__?: InitialGraphData }).__INITIAL_DATA__ ?? {};
}

export function useInitialGraphData(): { initialNodes: TopoNode[]; initialEdges: TopoEdge[] } {
  return React.useMemo(() => {
    const initialData = getInitialData();
    const topoNodes = initialData.nodes ?? [];
    const topoWithMembership = applyGroupMembershipToNodes(
      topoNodes,
      initialData.nodeAnnotations,
      initialData.groupStyleAnnotations ?? []
    );
    const annotationNodes = annotationsToNodes(
      initialData.freeTextAnnotations ?? [],
      initialData.freeShapeAnnotations ?? [],
      initialData.groupStyleAnnotations ?? []
    ) as TopoNode[];

    return {
      initialNodes: [...topoWithMembership, ...annotationNodes],
      initialEdges: initialData.edges ?? []
    };
  }, []);
}
