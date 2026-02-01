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
  NetworkNodeAnnotation,
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
import { snapToGrid } from "../utils/grid";

import { dispatchTopologyCommand, setHostRevision } from "./topologyHostClient";
import { enqueueHostCommand } from "./topologyHostQueue";

export interface ApplySnapshotOptions {
  /** If true, apply auto-layout when nodes have no preset positions */
  isInitialLoad?: boolean;
}

const LAYOUTABLE_NODE_TYPES = new Set(["topology-node", "network-node"]);

function syncUndoRedo(snapshot: TopologySnapshot): void {
  useTopoViewerStore.getState().setInitialData({
    canUndo: snapshot.canUndo,
    canRedo: snapshot.canRedo
  });
}

function isLayoutableNode(node: Node): boolean {
  return LAYOUTABLE_NODE_TYPES.has(node.type ?? "");
}

function snapLayoutPositions(nodes: Node[]): {
  nodes: Node[];
  positions: Array<{ id: string; position: { x: number; y: number } }>;
} {
  const positions: Array<{ id: string; position: { x: number; y: number } }> = [];
  const snappedNodes = nodes.map((node) => {
    if (!isLayoutableNode(node)) {
      return node;
    }
    const snappedPosition = snapToGrid(node.position);
    positions.push({ id: node.id, position: snappedPosition });
    if (
      snappedPosition.x === node.position.x &&
      snappedPosition.y === node.position.y
    ) {
      return node;
    }
    return {
      ...node,
      position: snappedPosition
    };
  });

  return { nodes: snappedNodes, positions };
}

async function persistLayoutPositions(
  positions: Array<{ id: string; position: { x: number; y: number } }>
): Promise<void> {
  if (positions.length === 0) return;
  try {
    const response = await enqueueHostCommand(() =>
      dispatchTopologyCommand({
        command: "savePositions",
        payload: positions,
        skipHistory: true
      })
    );
    if (response.type === "topology-host:ack") {
      if (response.snapshot) {
        setHostRevision(response.snapshot.revision);
        syncUndoRedo(response.snapshot);
      } else if (typeof response.revision === "number") {
        setHostRevision(response.revision);
      }
      return;
    }
    if (response.type === "topology-host:reject") {
      setHostRevision(response.snapshot.revision);
      syncUndoRedo(response.snapshot);
      return;
    }
    if (response.type === "topology-host:error") {
      throw new Error(response.error);
    }
  } catch (err) {
    console.error("[TopologyHost] Failed to persist layout positions", err);
  }
}

function buildMergedNodes(
  newNodes: TopoNode[],
  nodeAnnotations: NodeAnnotation[] | undefined,
  networkNodeAnnotations: NetworkNodeAnnotation[] | undefined,
  groupStyleAnnotations: GroupStyleAnnotation[],
  freeTextAnnotations: FreeTextAnnotation[],
  freeShapeAnnotations: FreeShapeAnnotation[]
): Node[] {
  let topoWithMembership = applyGroupMembershipToNodes(
    newNodes,
    nodeAnnotations,
    groupStyleAnnotations
  );
  topoWithMembership = applyGeoCoordinatesToNodes(
    topoWithMembership,
    nodeAnnotations,
    networkNodeAnnotations
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

function applyGeoCoordinatesToNodes(
  nodes: TopoNode[],
  nodeAnnotations: NodeAnnotation[] | undefined,
  networkNodeAnnotations: NetworkNodeAnnotation[] | undefined
): TopoNode[] {
  if ((!nodeAnnotations || nodeAnnotations.length === 0) && (!networkNodeAnnotations || networkNodeAnnotations.length === 0)) {
    return nodes;
  }

  const geoMap = new Map<string, { lat: number; lng: number }>();
  for (const annotation of nodeAnnotations ?? []) {
    if (annotation.geoCoordinates) {
      geoMap.set(annotation.id, annotation.geoCoordinates);
    }
  }
  for (const annotation of networkNodeAnnotations ?? []) {
    if (annotation.geoCoordinates) {
      geoMap.set(annotation.id, annotation.geoCoordinates);
    }
  }

  if (geoMap.size === 0) return nodes;

  return nodes.map((node) => {
    const geo = geoMap.get(node.id);
    if (!geo) return node;
    const data = (node.data ?? {}) as Record<string, unknown>;
    return {
      ...node,
      data: { ...data, geoCoordinates: geo }
    } as TopoNode;
  });
}

function hasGeoCoordinates(annotations: Required<TopologyAnnotations>): boolean {
  return (
    annotations.nodeAnnotations.some((ann) => Boolean(ann.geoCoordinates)) ||
    annotations.networkNodeAnnotations.some((ann) => Boolean(ann.geoCoordinates))
  );
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
    annotations.networkNodeAnnotations,
    annotations.groupStyleAnnotations,
    annotations.freeTextAnnotations,
    annotations.freeShapeAnnotations
  );

  // Apply force layout when no preset positions exist and geo coordinates are not driving layout.
  // This handles the case when annotation.json doesn't exist or positions were cleared (e.g. undo).
  if (!hasPresetPositions(mergedNodes) && !hasGeoCoordinates(annotations)) {
    const layoutNodes = applyForceLayout(mergedNodes, edges as unknown as Edge[]);
    const { nodes: snappedNodes, positions } = snapLayoutPositions(layoutNodes);
    mergedNodes = snappedNodes;
    void persistLayoutPositions(positions);
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
