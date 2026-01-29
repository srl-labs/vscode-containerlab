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
import { useCanvasStore } from "../stores/canvasStore";
import { applyGroupMembershipToNodes } from "../annotations/groupMembership";
import { annotationsToNodes } from "../annotations/annotationNodeConverters";
import { pruneEdgeAnnotations } from "../annotations/edgeAnnotations";
import { parseEndpointLabelOffset } from "../annotations/endpointLabelOffset";
import { applyForceLayout, hasPresetPositions } from "../components/canvas/layout";

import { setHostRevision } from "./topologyHostClient";

export interface ApplySnapshotOptions {
  /** If true, apply auto-layout when nodes have no preset positions */
  isInitialLoad?: boolean;
}

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

export function applySnapshotToStores(
  snapshot: TopologySnapshot,
  options: ApplySnapshotOptions = {}
): void {
  if (!snapshot) return;

  setHostRevision(snapshot.revision);

  const annotations = normalizeAnnotations(snapshot.annotations);
  const edges = (snapshot.edges ?? []) as TopoEdge[];
  const nodes = (snapshot.nodes ?? []) as TopoNode[];

  let mergedNodes = buildMergedNodes(
    nodes,
    annotations.nodeAnnotations,
    annotations.groupStyleAnnotations,
    annotations.freeTextAnnotations,
    annotations.freeShapeAnnotations
  );

  // On initial load, apply force layout if nodes don't have preset positions
  // This handles the case when annotation.json doesn't exist or nodes have no saved positions
  if (options.isInitialLoad && !hasPresetPositions(mergedNodes)) {
    mergedNodes = applyForceLayout(mergedNodes, edges as unknown as Edge[]);
  }

  const cleanedEdgeAnnotations = pruneEdgeAnnotations(annotations.edgeAnnotations, edges);

  const graphStore = useGraphStore.getState();
  graphStore.setGraph(mergedNodes, edges as unknown as Edge[]);

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

  if (options.isInitialLoad) {
    useCanvasStore.getState().requestFitView();
  }
}
