/**
 * TopologyHost snapshot application helpers.
 */

import type { Node, Edge } from "@xyflow/react";

import type { TopologySnapshot } from "../../shared/types/messages";
import type {
  FreeTextAnnotation,
  FreeShapeAnnotation,
  TrafficRateAnnotation,
  GroupStyleAnnotation,
  NodeAnnotation,
  NetworkNodeAnnotation,
  TopologyAnnotations
} from "../../shared/types/topology";
import type { TopoNode, TopoEdge } from "../../shared/types/graph";
import {
  annotationsToNodes,
  applyGroupMembershipToNodes,
  isNonEmptyString,
  parseEndpointLabelOffset,
  parseLegacyGroupIdentity,
  pruneEdgeAnnotations,
  toFiniteNumber,
  toPosition
} from "../annotations";
import { useGraphStore } from "../stores/graphStore";
import { useTopoViewerStore } from "../stores/topoViewerStore";
import { useCanvasStore } from "../stores/canvasStore";
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

function normalizeTrafficRateModeValue(
  value: unknown
): TrafficRateAnnotation["mode"] | undefined {
  if (value === "text") return "text";
  if (value === "chart" || value === "current") return "chart";
  return undefined;
}

function normalizeTrafficRateTextMetricValue(
  value: unknown
): TrafficRateAnnotation["textMetric"] | undefined {
  if (value === "combined" || value === "rx" || value === "tx") return value;
  return undefined;
}

function normalizeTrafficRateAnnotations(
  annotations: TrafficRateAnnotation[]
): TrafficRateAnnotation[] {
  return annotations.map((annotation) => {
    const width = toFiniteNumber(annotation.width);
    const height = toFiniteNumber(annotation.height);
    const showLegendDisabled = annotation.showLegend === false;
    const mode = normalizeTrafficRateModeValue(annotation.mode);
    const textMetric = normalizeTrafficRateTextMetricValue(annotation.textMetric);
    const backgroundOpacity = toFiniteNumber(annotation.backgroundOpacity);
    const borderWidth = toFiniteNumber(annotation.borderWidth);
    const borderRadius = toFiniteNumber(annotation.borderRadius);
    const zIndex = toFiniteNumber(annotation.zIndex);
    const normalized: TrafficRateAnnotation = {
      ...annotation,
      position: toPosition(annotation.position) ?? { x: 0, y: 0 }
    };
    if (mode !== undefined) {
      normalized.mode = mode;
    } else {
      delete normalized.mode;
    }
    if (textMetric !== undefined) {
      normalized.textMetric = textMetric;
    } else {
      delete normalized.textMetric;
    }
    if (width !== undefined) {
      normalized.width = width;
    } else {
      delete normalized.width;
    }
    if (height !== undefined) {
      normalized.height = height;
    } else {
      delete normalized.height;
    }
    if (showLegendDisabled) {
      normalized.showLegend = false;
    } else {
      delete normalized.showLegend;
    }
    if (backgroundOpacity !== undefined) {
      normalized.backgroundOpacity = backgroundOpacity;
    } else {
      delete normalized.backgroundOpacity;
    }
    if (borderWidth !== undefined) {
      normalized.borderWidth = borderWidth;
    } else {
      delete normalized.borderWidth;
    }
    if (borderRadius !== undefined) {
      normalized.borderRadius = borderRadius;
    } else {
      delete normalized.borderRadius;
    }
    if (zIndex !== undefined) {
      normalized.zIndex = zIndex;
    } else {
      delete normalized.zIndex;
    }
    return normalized;
  });
}

function resolveGroupIdentity(
  group: GroupStyleAnnotation,
  index: number
): { id: string; name: string; level: string } {
  const id = isNonEmptyString(group.id) ? group.id : `legacy-group-${index + 1}`;
  const identity = parseLegacyGroupIdentity(id);
  const name = isNonEmptyString(group.name) ? group.name : identity.name;
  const level = isNonEmptyString(group.level) ? group.level : identity.level;
  return { id, name, level };
}

function resolveGroupBounds(
  group: GroupStyleAnnotation,
  identity: { id: string; name: string; level: string },
  nodeAnnotations: NodeAnnotation[]
): { position: { x: number; y: number }; width: number; height: number } {
  const normalizedPosition = toPosition(group.position);
  const normalizedWidth = toFiniteNumber(group.width);
  const normalizedHeight = toFiniteNumber(group.height);

  if (
    normalizedPosition !== undefined &&
    normalizedWidth !== undefined &&
    normalizedHeight !== undefined
  ) {
    return {
      position: normalizedPosition,
      width: normalizedWidth,
      height: normalizedHeight
    };
  }

  const derivedBounds = deriveLegacyGroupBounds(
    identity.id,
    identity.name,
    identity.level,
    nodeAnnotations
  );

  return {
    position: normalizedPosition ?? derivedBounds?.position ?? { x: 0, y: 0 },
    width: normalizedWidth ?? derivedBounds?.width ?? DEFAULT_GROUP_WIDTH,
    height: normalizedHeight ?? derivedBounds?.height ?? DEFAULT_GROUP_HEIGHT
  };
}

function resolveGroupLabelColor(group: GroupStyleAnnotation): string | undefined {
  if (isNonEmptyString(group.labelColor)) {
    return group.labelColor;
  }
  const legacyColor = (group as Record<string, unknown>).color;
  return isNonEmptyString(legacyColor) ? legacyColor : undefined;
}

function normalizeGroupStyleAnnotation(
  group: GroupStyleAnnotation,
  index: number,
  nodeAnnotations: NodeAnnotation[]
): GroupStyleAnnotation {
  const identity = resolveGroupIdentity(group, index);
  const bounds = resolveGroupBounds(group, identity, nodeAnnotations);

  return {
    ...group,
    id: identity.id,
    name: identity.name,
    level: identity.level,
    position: bounds.position,
    width: bounds.width,
    height: bounds.height,
    labelColor: resolveGroupLabelColor(group)
  };
}

function normalizeGroupStyleAnnotations(
  groups: GroupStyleAnnotation[],
  nodeAnnotations: NodeAnnotation[]
): GroupStyleAnnotation[] {
  return groups.map((group, index) => normalizeGroupStyleAnnotation(group, index, nodeAnnotations));
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
  freeShapeAnnotations: FreeShapeAnnotation[],
  trafficRateAnnotations: TrafficRateAnnotation[]
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
    groupStyleAnnotations,
    trafficRateAnnotations
  );
  const mergedNodes = [...(topoWithMembership as Node[]), ...(annotationNodes as Node[])];
  return Array.from(new Map(mergedNodes.map((n) => [n.id, n])).values());
}

function normalizeAnnotations(annotations?: TopologyAnnotations): Required<TopologyAnnotations> {
  const {
    freeTextAnnotations = [],
    freeShapeAnnotations = [],
    trafficRateAnnotations = [],
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
    trafficRateAnnotations: normalizeTrafficRateAnnotations(trafficRateAnnotations),
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
    annotations.freeShapeAnnotations,
    annotations.trafficRateAnnotations
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
