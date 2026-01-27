/**
 * TopologyHost snapshot application helpers.
 */

import type { Node, Edge } from "@xyflow/react";

import type { TopologySnapshot } from "../../shared/types/messages";
import type {
  FreeTextAnnotation,
  FreeShapeAnnotation,
  GroupStyleAnnotation,
  NodeAnnotation,
  TopologyAnnotations
} from "../../shared/types/topology";
import type { TopoNode, TopoEdge } from "../../shared/types/graph";
import { useGraphStore } from "../stores/graphStore";
import { useTopoViewerStore } from "../stores/topoViewerStore";
import { applyGroupMembershipToNodes } from "../annotations/groupMembership";
import { annotationsToNodes } from "../annotations/annotationNodeConverters";
import { pruneEdgeAnnotations } from "../annotations/edgeAnnotations";
import { parseEndpointLabelOffset } from "../annotations/endpointLabelOffset";

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
  const {
    freeTextAnnotations = [],
    freeShapeAnnotations = [],
    groupStyleAnnotations = [],
    nodeAnnotations = [],
    networkNodeAnnotations = [],
    edgeAnnotations = [],
    aliasEndpointAnnotations = [],
    viewerSettings = {}
  } = annotations ?? {};
  return {
    freeTextAnnotations,
    freeShapeAnnotations,
    groupStyleAnnotations,
    nodeAnnotations,
    networkNodeAnnotations,
    edgeAnnotations,
    aliasEndpointAnnotations,
    viewerSettings
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

  const cleanedEdgeAnnotations = pruneEdgeAnnotations(annotations.edgeAnnotations, edges);

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
