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

export interface InitialGraphData {
  nodes?: TopoNode[];
  edges?: TopoEdge[];
  freeTextAnnotations?: FreeTextAnnotation[];
  freeShapeAnnotations?: FreeShapeAnnotation[];
  groupStyleAnnotations?: GroupStyleAnnotation[];
  nodeAnnotations?: NodeAnnotation[];
}

function getInitialData(initialData?: InitialGraphData): InitialGraphData {
  return initialData ?? (window as { __INITIAL_DATA__?: InitialGraphData }).__INITIAL_DATA__ ?? {};
}

export function useInitialGraphData(initialData?: InitialGraphData): {
  initialNodes: TopoNode[];
  initialEdges: TopoEdge[];
} {
  return React.useMemo(() => {
    const data = getInitialData(initialData);
    const topoNodes = data.nodes ?? [];
    const topoWithMembership = applyGroupMembershipToNodes(
      topoNodes,
      data.nodeAnnotations,
      data.groupStyleAnnotations ?? []
    );
    const annotationNodes = annotationsToNodes(
      data.freeTextAnnotations ?? [],
      data.freeShapeAnnotations ?? [],
      data.groupStyleAnnotations ?? []
    ) as TopoNode[];

    return {
      initialNodes: [...topoWithMembership, ...annotationNodes],
      initialEdges: data.edges ?? []
    };
  }, [initialData]);
}
