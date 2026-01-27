/**
 * TopologyHost snapshot application helpers.
 */

import type { Node, Edge } from "@xyflow/react";

import type { TopologySnapshot } from "../../shared/types/messages";
import type {
  EdgeAnnotation,
  FreeTextAnnotation,
  FreeShapeAnnotation,
  GroupStyleAnnotation,
  NodeAnnotation,
  TopologyAnnotations
} from "../../shared/types/topology";
import type { TopoNode, TopoEdge } from "../../shared/types/graph";
import { useGraphStore } from "../stores/graphStore";
import { useTopoViewerStore } from "../stores/topoViewerStore";
import { applyGroupMembershipToNodes } from "../utils/groupMembership";
import { annotationsToNodes } from "../utils/annotationNodeConverters";
import { pruneEdgeAnnotations } from "../utils/edgeAnnotations";
import { parseEndpointLabelOffset } from "../utils/endpointLabelOffset";
import { setHostRevision } from "./topologyHostClient";

function buildMergedNodes(
  newNodes: TopoNode[],
  nodeAnnotations: NodeAnnotation[] | undefined,
  groupStyleAnnotations: GroupStyleAnnotation[],
  freeTextAnnotations: FreeTextAnnotation[],
  freeShapeAnnotations: FreeShapeAnnotation[]
): Node[] {
  const topoWithMembership = applyGroupMembershipToNodes(
    newNodes,
    nodeAnnotations,
    groupStyleAnnotations
  );
  const annotationNodes = annotationsToNodes(
    freeTextAnnotations,
    freeShapeAnnotations,
    groupStyleAnnotations
  );
  const mergedNodes = [...(topoWithMembership as Node[]), ...(annotationNodes as Node[])];
  return Array.from(new Map(mergedNodes.map((n) => [n.id, n])).values());
}

function normalizeAnnotations(annotations?: TopologyAnnotations): Required<TopologyAnnotations> {
  return {
    freeTextAnnotations: annotations?.freeTextAnnotations ?? [],
    freeShapeAnnotations: annotations?.freeShapeAnnotations ?? [],
    groupStyleAnnotations: annotations?.groupStyleAnnotations ?? [],
    nodeAnnotations: annotations?.nodeAnnotations ?? [],
    networkNodeAnnotations: annotations?.networkNodeAnnotations ?? [],
    edgeAnnotations: annotations?.edgeAnnotations ?? [],
    aliasEndpointAnnotations: annotations?.aliasEndpointAnnotations ?? [],
    viewerSettings: annotations?.viewerSettings ?? {}
  };
}

export function applySnapshotToStores(snapshot: TopologySnapshot): void {
  if (!snapshot) return;

  setHostRevision(snapshot.revision);

  const annotations = normalizeAnnotations(snapshot.annotations);
  const edges = (snapshot.edges ?? []) as TopoEdge[];
  const nodes = (snapshot.nodes ?? []) as TopoNode[];

  const mergedNodes = buildMergedNodes(
    nodes,
    annotations.nodeAnnotations,
    annotations.groupStyleAnnotations,
    annotations.freeTextAnnotations,
    annotations.freeShapeAnnotations
  );

  const cleanedEdgeAnnotations = pruneEdgeAnnotations(
    annotations.edgeAnnotations,
    edges as unknown as Edge[]
  );

  const graphStore = useGraphStore.getState();
  graphStore.setNodes(mergedNodes);
  graphStore.setEdges(edges as unknown as Edge[]);

  const offset = parseEndpointLabelOffset(annotations.viewerSettings.endpointLabelOffset);

  useTopoViewerStore.getState().setInitialData({
    labName: snapshot.labName,
    mode: snapshot.mode,
    deploymentState: snapshot.deploymentState,
    labSettings: snapshot.labSettings,
    edgeAnnotations: cleanedEdgeAnnotations,
    ...(offset !== null ? { endpointLabelOffset: offset } : {}),
    canUndo: snapshot.canUndo,
    canRedo: snapshot.canRedo
  });
}
