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
const LEGACY_GROUP_PADDING = 40;
const LEGACY_NODE_WIDTH = 100;
const LEGACY_NODE_HEIGHT = 100;
const DEFAULT_GROUP_WIDTH = 300;
const DEFAULT_GROUP_HEIGHT = 200;
const LEGACY_DEFAULT_MEDIA_TEXT_WIDTH = 120;
const LEGACY_MEDIA_TEXT_HEIGHT_RATIO = 0.62;
const LEGACY_MIN_MEDIA_TEXT_HEIGHT = 48;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function toPosition(value: unknown): { x: number; y: number } | undefined {
  if (!value || typeof value !== "object") return undefined;
  const rec = value as Record<string, unknown>;
  const x = toFiniteNumber(rec.x);
  const y = toFiniteNumber(rec.y);
  if (x === undefined || y === undefined) return undefined;
  return { x, y };
}

function parseLegacyGroupIdentity(groupId: string): { name: string; level: string } {
  const idx = groupId.lastIndexOf(":");
  if (idx > 0 && idx < groupId.length - 1) {
    return { name: groupId.slice(0, idx), level: groupId.slice(idx + 1) };
  }
  return { name: groupId, level: "1" };
}

function isStandaloneMarkdownImage(value: unknown): boolean {
  if (!isNonEmptyString(value)) return false;
  return /^\s*!\[[^\]]*\]\([^)]+\)\s*$/u.test(value);
}

function inferLegacyMediaTextHeight(width: number): number {
  return Math.max(LEGACY_MIN_MEDIA_TEXT_HEIGHT, Math.round(width * LEGACY_MEDIA_TEXT_HEIGHT_RATIO));
}

function nodeBelongsToGroup(
  annotation: NodeAnnotation,
  groupId: string,
  groupName: string,
  groupLevel: string
): boolean {
  if (isNonEmptyString(annotation.groupId)) {
    return annotation.groupId === groupId;
  }
  if (!isNonEmptyString(annotation.group)) {
    return false;
  }
  if (annotation.group !== groupId && annotation.group !== groupName) {
    return false;
  }

  const nodeLevel = isNonEmptyString(annotation.level) ? annotation.level : "1";
  return nodeLevel === groupLevel;
}

function deriveLegacyGroupBounds(
  groupId: string,
  groupName: string,
  groupLevel: string,
  nodeAnnotations: NodeAnnotation[]
): { position: { x: number; y: number }; width: number; height: number } | undefined {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const annotation of nodeAnnotations) {
    if (!nodeBelongsToGroup(annotation, groupId, groupName, groupLevel)) continue;
    const position = toPosition(annotation.position);
    if (!position) continue;

    minX = Math.min(minX, position.x);
    minY = Math.min(minY, position.y);
    maxX = Math.max(maxX, position.x + LEGACY_NODE_WIDTH);
    maxY = Math.max(maxY, position.y + LEGACY_NODE_HEIGHT);
  }

  if (
    !Number.isFinite(minX) ||
    !Number.isFinite(minY) ||
    !Number.isFinite(maxX) ||
    !Number.isFinite(maxY)
  ) {
    return undefined;
  }

  return {
    position: { x: minX - LEGACY_GROUP_PADDING, y: minY - LEGACY_GROUP_PADDING },
    width: Math.max(DEFAULT_GROUP_WIDTH, maxX - minX + LEGACY_GROUP_PADDING * 2),
    height: Math.max(DEFAULT_GROUP_HEIGHT, maxY - minY + LEGACY_GROUP_PADDING * 2)
  };
}

function normalizeFreeTextAnnotations(annotations: FreeTextAnnotation[]): FreeTextAnnotation[] {
  return annotations.map((annotation) => {
    const position = toPosition(annotation.position) ?? { x: 0, y: 0 };
    const width = toFiniteNumber(annotation.width);
    const height = toFiniteNumber(annotation.height);
    const isMedia = isStandaloneMarkdownImage(annotation.text);
    const mediaWidth = width ?? LEGACY_DEFAULT_MEDIA_TEXT_WIDTH;

    const normalizedWidth = isMedia ? mediaWidth : width;
    const normalizedHeight = isMedia
      ? (height ?? inferLegacyMediaTextHeight(mediaWidth))
      : height;

    const normalizedAnnotation: FreeTextAnnotation = {
      ...annotation,
      position,
    };
    if (normalizedWidth !== undefined) {
      normalizedAnnotation.width = normalizedWidth;
    } else {
      delete normalizedAnnotation.width;
    }
    if (normalizedHeight !== undefined) {
      normalizedAnnotation.height = normalizedHeight;
    } else {
      delete normalizedAnnotation.height;
    }

    return normalizedAnnotation;
  });
}

function normalizeFreeShapeAnnotations(annotations: FreeShapeAnnotation[]): FreeShapeAnnotation[] {
  return annotations.map((annotation) => {
    const normalizedEnd = toPosition(annotation.endPosition);
    return {
      ...annotation,
      position: toPosition(annotation.position) ?? { x: 0, y: 0 },
      endPosition: normalizedEnd
    };
  });
}

function normalizeGroupStyleAnnotations(
  groups: GroupStyleAnnotation[],
  nodeAnnotations: NodeAnnotation[]
): GroupStyleAnnotation[] {
  return groups.map((group, index) => {
    const id = isNonEmptyString(group.id) ? group.id : `legacy-group-${index + 1}`;
    const identity = parseLegacyGroupIdentity(id);
    const name = isNonEmptyString(group.name) ? group.name : identity.name;
    const level = isNonEmptyString(group.level) ? group.level : identity.level;

    const normalizedPosition = toPosition(group.position);
    const normalizedWidth = toFiniteNumber(group.width);
    const normalizedHeight = toFiniteNumber(group.height);
    const derivedBounds =
      normalizedPosition && normalizedWidth !== undefined && normalizedHeight !== undefined
        ? undefined
        : deriveLegacyGroupBounds(id, name, level, nodeAnnotations);

    const legacyColor = (group as Record<string, unknown>).color;

    return {
      ...group,
      id,
      name,
      level,
      position: normalizedPosition ?? derivedBounds?.position ?? { x: 0, y: 0 },
      width: normalizedWidth ?? derivedBounds?.width ?? DEFAULT_GROUP_WIDTH,
      height: normalizedHeight ?? derivedBounds?.height ?? DEFAULT_GROUP_HEIGHT,
      labelColor:
        (isNonEmptyString(group.labelColor) ? group.labelColor : undefined) ??
        (isNonEmptyString(legacyColor) ? legacyColor : undefined)
    };
  });
}

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
    if (snappedPosition.x === node.position.x && snappedPosition.y === node.position.y) {
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

  const normalizedNodeAnnotations = nodeAnnotations;
  return {
    freeTextAnnotations: normalizeFreeTextAnnotations(freeTextAnnotations),
    freeShapeAnnotations: normalizeFreeShapeAnnotations(freeShapeAnnotations),
    groupStyleAnnotations: normalizeGroupStyleAnnotations(
      groupStyleAnnotations,
      normalizedNodeAnnotations
    ),
    nodeAnnotations: normalizedNodeAnnotations,
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
  if (
    (!nodeAnnotations || nodeAnnotations.length === 0) &&
    (!networkNodeAnnotations || networkNodeAnnotations.length === 0)
  ) {
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
  const { gridColor, gridBgColor } = annotations.viewerSettings;

  useTopoViewerStore.getState().setInitialData({
    labName: snapshot.labName,
    mode: snapshot.mode,
    deploymentState: snapshot.deploymentState,
    labSettings: snapshot.labSettings,
    yamlFileName: snapshot.yamlFileName,
    annotationsFileName: snapshot.annotationsFileName,
    yamlContent: snapshot.yamlContent,
    annotationsContent: snapshot.annotationsContent,
    edgeAnnotations: cleanedEdgeAnnotations,
    ...(offset !== null ? { endpointLabelOffset: offset } : {}),
    gridColor: gridColor ?? null,
    gridBgColor: gridBgColor ?? null,
    canUndo: snapshot.canUndo,
    canRedo: snapshot.canRedo
  });

  if (options.isInitialLoad) {
    useCanvasStore.getState().requestFitView();
  }
}
