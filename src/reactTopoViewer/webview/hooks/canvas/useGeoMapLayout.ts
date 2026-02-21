/**
 * useGeoMapLayout - MapLibre integration for GeoMap layout
 */
import type { Dispatch, RefObject, SetStateAction } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapLibreMap, LngLatBounds, StyleSpecification } from "maplibre-gl";
import maplibregl from "maplibre-gl";
import type { Node, ReactFlowInstance, XYPosition } from "@xyflow/react";

import { log } from "../../utils/logger";
import { FREE_SHAPE_NODE_TYPE } from "../../annotations/annotationNodeConverters";
import { saveNodePositions } from "../../services";

interface GeoCoordinates {
  lat: number;
  lng: number;
}

interface GeoMapLayoutParams {
  isGeoLayout: boolean;
  isEditable: boolean;
  nodes: Node[];
  setNodes: Dispatch<SetStateAction<Node[]>>;
  reactFlowInstanceRef: RefObject<ReactFlowInstance | null>;
  canvasContainerRef: RefObject<HTMLDivElement | null>;
  restoreOnExit: boolean;
}

export interface GeoMapLayoutApi {
  containerRef: RefObject<HTMLDivElement | null>;
  mapRef: RefObject<MapLibreMap | null>;
  isReady: boolean;
  isInteracting: boolean;
  fitToViewport: (options?: { duration?: number }) => void;
  getGeoCoordinatesForNode: (node: Node) => GeoCoordinates | null;
  getGeoUpdateForNode: (
    node: Node
  ) => { geoCoordinates?: GeoCoordinates; endGeoCoordinates?: GeoCoordinates } | null;
}

const MAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [
    {
      id: "osm",
      type: "raster",
      source: "osm",
    },
  ],
};
const INITIAL_GEO_SEQUENCE: GeoCoordinates[] = [
  // Stuttgart
  { lat: 48.775846, lng: 9.182932 },
  // Frankfurt
  { lat: 50.110924, lng: 8.682127 },
  // Paris
  { lat: 48.856613, lng: 2.352222 },
  // London
  { lat: 51.507351, lng: -0.127758 },
];
// Default center in Europe (Stuttgart).
const DEFAULT_LAT = INITIAL_GEO_SEQUENCE[0].lat;
const DEFAULT_LNG = INITIAL_GEO_SEQUENCE[0].lng;
const DEFAULT_CENTER: [number, number] = [DEFAULT_LNG, DEFAULT_LAT];
const DEFAULT_ZOOM = 4;

const DEFAULT_NODE_SIZE = { width: 60, height: 60 };
const DEFAULT_GROUP_SIZE = { width: 200, height: 150 };
const DEFAULT_TEXT_SIZE = { width: 140, height: 40 };
const DEFAULT_SHAPE_SIZE = { width: 120, height: 120 };

const POSITION_EPSILON = 0.05;

const AUTO_GEO_TYPES = new Set(["topology-node", "network-node"]);

const LINE_PADDING = 20;
const GEO_TRANSFORM_ANCHOR: [number, number] = [0, 0];
const GEO_VIEWPORT_RESET = { x: 0, y: 0, zoom: 1 };
const INTERACTION_END_DEBOUNCE_MS = 20;
const ZOOM_END_DEBOUNCE_MS = 20;

// Keep wrapped city assignments visually separate when sequence repeats.
const GEO_REPEAT_RING_POINTS = 8;
const GEO_REPEAT_RADIUS_STEP = 2.8;
const MAX_GEO_SLOT_SCAN = 4096;

let maplibreWorkerBlobUrl: string | null = null;
let maplibreWorkerBlobSourceKey: string | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toGeoCoordinates(value: unknown): GeoCoordinates | null {
  if (!isRecord(value)) return null;
  const lat = value.lat;
  const lng = value.lng;
  if (typeof lat !== "number" || !Number.isFinite(lat)) return null;
  if (typeof lng !== "number" || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function toXYPosition(value: unknown): XYPosition | null {
  if (!isRecord(value)) return null;
  const x = value.x;
  const y = value.y;
  if (typeof x !== "number" || !Number.isFinite(x)) return null;
  if (typeof y !== "number" || !Number.isFinite(y)) return null;
  return { x, y };
}

function decodeBase64ToString(base64: string): string {
  if (typeof window === "undefined" || typeof window.atob !== "function") {
    throw new Error("Base64 decoding is unavailable in this environment");
  }
  const binary = window.atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function getOrCreateWorkerBlobUrl(sourceKey: string, workerSource: string): string | null {
  if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
    return null;
  }

  if (
    maplibreWorkerBlobUrl != null &&
    maplibreWorkerBlobUrl.length > 0 &&
    maplibreWorkerBlobSourceKey === sourceKey
  ) {
    return maplibreWorkerBlobUrl;
  }

  if (maplibreWorkerBlobUrl != null && maplibreWorkerBlobUrl.length > 0) {
    URL.revokeObjectURL(maplibreWorkerBlobUrl);
    maplibreWorkerBlobUrl = null;
    maplibreWorkerBlobSourceKey = null;
  }

  maplibreWorkerBlobUrl = URL.createObjectURL(
    new Blob([workerSource], { type: "text/javascript" })
  );
  maplibreWorkerBlobSourceKey = sourceKey;
  return maplibreWorkerBlobUrl;
}

function resolveMapLibreWorkerUrl(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const workerSourceBase64 = window.maplibreWorkerSourceBase64;
  if (workerSourceBase64 != null && workerSourceBase64.length > 0) {
    try {
      const sourceKey = `inline:${workerSourceBase64.length}:${workerSourceBase64.slice(0, 32)}`;
      const workerSource = decodeBase64ToString(workerSourceBase64);
      return getOrCreateWorkerBlobUrl(sourceKey, workerSource);
    } catch (error) {
      log.warn(
        `[GeoMap] Failed to decode embedded worker source, falling back to worker URL: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  const configuredWorkerUrl = window.maplibreWorkerUrl;
  if (configuredWorkerUrl == null || configuredWorkerUrl.length === 0) {
    return null;
  }

  if (configuredWorkerUrl.startsWith("blob:") || configuredWorkerUrl.startsWith("data:")) {
    return configuredWorkerUrl;
  }

  const sourceKey = `bootstrap:${configuredWorkerUrl}`;
  const bootstrapSource = `importScripts(${JSON.stringify(configuredWorkerUrl)});`;
  return getOrCreateWorkerBlobUrl(sourceKey, bootstrapSource) ?? configuredWorkerUrl;
}

function roundCoord(value: number): number {
  return Number(value.toFixed(6));
}

function roundGeo(coords: GeoCoordinates): GeoCoordinates {
  return { lat: roundCoord(coords.lat), lng: roundCoord(coords.lng) };
}

const DEFAULT_SIZE_BY_TYPE: Record<string, { width: number; height: number }> = {
  "group-node": DEFAULT_GROUP_SIZE,
  "free-text-node": DEFAULT_TEXT_SIZE,
  "free-shape-node": DEFAULT_SHAPE_SIZE,
};

function getNodeSize(node: Node): { width: number; height: number } {
  const data = node.data;
  const width = node.width ?? (typeof data.width === "number" ? data.width : undefined);
  const height = node.height ?? (typeof data.height === "number" ? data.height : undefined);

  if (width != null && width > 0 && height != null && height > 0) {
    return { width, height };
  }

  const fallback = DEFAULT_SIZE_BY_TYPE[node.type ?? ""] ?? DEFAULT_NODE_SIZE;
  return {
    width: width ?? fallback.width,
    height: height ?? fallback.height,
  };
}

function extractGeoCoordinates(node: Node): GeoCoordinates | null {
  const data = node.data;
  const topLevelGeo = toGeoCoordinates(data.geoCoordinates);
  if (topLevelGeo) return topLevelGeo;
  const extraData = isRecord(data.extraData) ? data.extraData : null;
  return toGeoCoordinates(extraData?.geoCoordinates);
}

function extractEndGeoCoordinates(node: Node): GeoCoordinates | null {
  const data = node.data;
  return toGeoCoordinates(data.endGeoCoordinates);
}

function positionEquals(a: XYPosition, b: XYPosition): boolean {
  return Math.abs(a.x - b.x) <= POSITION_EPSILON && Math.abs(a.y - b.y) <= POSITION_EPSILON;
}

function projectGeoToPosition(map: MapLibreMap, node: Node, geo: GeoCoordinates): XYPosition {
  const { width, height } = getNodeSize(node);
  const point = map.project([geo.lng, geo.lat]);
  return {
    x: point.x - width / 2,
    y: point.y - height / 2,
  };
}

function unprojectPositionToGeo(map: MapLibreMap, node: Node): GeoCoordinates {
  const { width, height } = getNodeSize(node);
  const centerX = node.position.x + width / 2;
  const centerY = node.position.y + height / 2;
  const lngLat = map.unproject([centerX, centerY]);
  return roundGeo({ lat: lngLat.lat, lng: lngLat.lng });
}

function computeLineBounds(
  start: XYPosition,
  end: XYPosition
): {
  nodePosition: XYPosition;
  width: number;
  height: number;
  relativeEndPosition: XYPosition;
  lineStartInNode: XYPosition;
} {
  const minX = Math.min(start.x, end.x) - LINE_PADDING;
  const minY = Math.min(start.y, end.y) - LINE_PADDING;
  const maxX = Math.max(start.x, end.x) + LINE_PADDING;
  const maxY = Math.max(start.y, end.y) + LINE_PADDING;

  const nodePosition = { x: minX, y: minY };
  return {
    nodePosition,
    width: maxX - minX,
    height: Math.max(maxY - minY, LINE_PADDING * 2),
    relativeEndPosition: { x: end.x - start.x, y: end.y - start.y },
    lineStartInNode: { x: start.x - minX, y: start.y - minY },
  };
}

function buildGeoBounds(nodes: Node[]): LngLatBounds | null {
  let bounds: LngLatBounds | null = null;
  for (const node of nodes) {
    const start = extractGeoCoordinates(node);
    const end = extractEndGeoCoordinates(node);
    if (!start && !end) continue;
    const coords: GeoCoordinates[] = [];
    if (start) coords.push(start);
    if (end) coords.push(end);
    for (const geo of coords) {
      if (!bounds) {
        bounds = new maplibregl.LngLatBounds([geo.lng, geo.lat], [geo.lng, geo.lat]);
      } else {
        bounds.extend([geo.lng, geo.lat]);
      }
    }
  }
  return bounds;
}

function geoKey(coords: GeoCoordinates): string {
  const rounded = roundGeo(coords);
  return `${rounded.lat},${rounded.lng}`;
}

function geoCoordinatesForSlot(slot: number): GeoCoordinates {
  const sequenceLength = INITIAL_GEO_SEQUENCE.length;
  const base = INITIAL_GEO_SEQUENCE[slot % sequenceLength];
  const repeatIndex = Math.floor(slot / sequenceLength);
  if (repeatIndex === 0) {
    return roundGeo(base);
  }

  const ringIndex = repeatIndex - 1;
  const ring = Math.floor(ringIndex / GEO_REPEAT_RING_POINTS) + 1;
  const ringPointIndex = ringIndex % GEO_REPEAT_RING_POINTS;
  const angle = (2 * Math.PI * ringPointIndex) / GEO_REPEAT_RING_POINTS;
  const radius = ring * GEO_REPEAT_RADIUS_STEP;

  return roundGeo({
    lat: base.lat + Math.sin(angle) * radius,
    lng: base.lng + Math.cos(angle) * radius,
  });
}

function assignAutoGeoCoordinates(nodes: Node[]): {
  nodes: Node[];
  assignments: Array<{ id: string; geoCoordinates: GeoCoordinates }>;
} {
  const occupied = new Set<string>();
  for (const node of nodes) {
    const geo = extractGeoCoordinates(node);
    if (geo) {
      occupied.add(geoKey(geo));
    }
  }

  let slot = 0;
  const assignments: Array<{ id: string; geoCoordinates: GeoCoordinates }> = [];

  const nextNodes = nodes.map((node) => {
    if (!AUTO_GEO_TYPES.has(node.type ?? "")) return node;
    if (extractGeoCoordinates(node)) return node;

    let geo: GeoCoordinates | null = null;
    for (let attempts = 0; attempts < MAX_GEO_SLOT_SCAN; attempts += 1) {
      const candidate = geoCoordinatesForSlot(slot);
      slot += 1;
      const key = geoKey(candidate);
      if (occupied.has(key)) continue;
      occupied.add(key);
      geo = candidate;
      break;
    }
    if (!geo) {
      geo = roundGeo({ lat: DEFAULT_LAT, lng: DEFAULT_LNG });
      occupied.add(geoKey(geo));
      log.warn("[GeoMap] Failed to find non-overlapping initial geo slot; using default center");
    }

    assignments.push({ id: node.id, geoCoordinates: geo });
    const data = node.data;
    return { ...node, data: { ...data, geoCoordinates: geo } };
  });

  return { nodes: nextNodes, assignments };
}

function syncNodesToMap(map: MapLibreMap, nodes: Node[]): { nodes: Node[]; changed: boolean } {
  let changed = false;
  const nextNodes: Node[] = [];
  for (const node of nodes) {
    const data = node.data;
    if (node.type === FREE_SHAPE_NODE_TYPE && data.shapeType === "line") {
      const startGeo = extractGeoCoordinates(node);
      const endGeo = extractEndGeoCoordinates(node);
      if (!startGeo || !endGeo) {
        nextNodes.push(node);
        continue;
      }
      const start = map.project([startGeo.lng, startGeo.lat]);
      const end = map.project([endGeo.lng, endGeo.lat]);
      const boundsInfo = computeLineBounds({ x: start.x, y: start.y }, { x: end.x, y: end.y });
      if (
        positionEquals(node.position, boundsInfo.nodePosition) &&
        node.width === boundsInfo.width &&
        node.height === boundsInfo.height
      ) {
        nextNodes.push(node);
        continue;
      }
      changed = true;
      nextNodes.push({
        ...node,
        position: boundsInfo.nodePosition,
        width: boundsInfo.width,
        height: boundsInfo.height,
        data: {
          ...data,
          startPosition: { x: start.x, y: start.y },
          endPosition: { x: end.x, y: end.y },
          relativeEndPosition: boundsInfo.relativeEndPosition,
          lineStartInNode: boundsInfo.lineStartInNode,
        },
      });
      continue;
    }

    const geo = extractGeoCoordinates(node);
    if (!geo) {
      nextNodes.push(node);
      continue;
    }
    const position = projectGeoToPosition(map, node, geo);
    if (positionEquals(node.position, position)) {
      nextNodes.push(node);
      continue;
    }
    changed = true;
    nextNodes.push({ ...node, position });
  }

  return { nodes: changed ? nextNodes : nodes, changed };
}

function buildGeoSyncSignature(nodes: Node[]): string {
  return nodes
    .map((node) => {
      const geo = extractGeoCoordinates(node);
      const endGeo = extractEndGeoCoordinates(node);
      const geoPart = geo ? `${roundCoord(geo.lat)},${roundCoord(geo.lng)}` : "-";
      const endPart = endGeo ? `${roundCoord(endGeo.lat)},${roundCoord(endGeo.lng)}` : "-";
      return `${node.id}:${node.type ?? ""}:${geoPart}:${endPart}`;
    })
    .join("|");
}

interface GeoInteractionBase {
  zoom: number;
  anchorPoint: { x: number; y: number };
}

interface GeoViewportTransform {
  x: number;
  y: number;
  zoom: number;
}

function computeGeoViewportTransform(
  map: MapLibreMap,
  base: GeoInteractionBase
): GeoViewportTransform {
  const currentAnchorPoint = map.project(GEO_TRANSFORM_ANCHOR);
  const scale = Math.pow(2, map.getZoom() - base.zoom);
  return {
    x: currentAnchorPoint.x - scale * base.anchorPoint.x,
    y: currentAnchorPoint.y - scale * base.anchorPoint.y,
    zoom: scale,
  };
}

function applyViewportTransformToElement(
  viewportElement: HTMLElement,
  transform: GeoViewportTransform
): void {
  viewportElement.style.transformOrigin = "0 0";
  viewportElement.style.transform = `translate(${transform.x}px, ${transform.y}px) scale(${transform.zoom})`;
}

function clearViewportTransformOverride(viewportElement: HTMLElement): void {
  viewportElement.style.transform = "";
  viewportElement.style.transformOrigin = "";
}

function resolveViewportElement(container: HTMLDivElement | null): HTMLElement | null {
  if (!container) return null;
  const renderer = container.querySelector(".react-flow__renderer");
  if (renderer instanceof HTMLElement) return renderer;
  const viewport = container.querySelector(".react-flow__viewport");
  return viewport instanceof HTMLElement ? viewport : null;
}

function clearViewportOverrideOnNextFrame(
  viewportElementRef: { current: HTMLElement | null },
  viewportTransformOverrideActiveRef: { current: boolean }
): void {
  if (!viewportElementRef.current || !viewportTransformOverrideActiveRef.current) return;
  window.requestAnimationFrame(() => {
    if (viewportElementRef.current) {
      clearViewportTransformOverride(viewportElementRef.current);
    }
    viewportTransformOverrideActiveRef.current = false;
  });
}

function applyGeoViewportTransform(
  map: MapLibreMap,
  rf: ReactFlowInstance | null,
  base: GeoInteractionBase,
  viewportElement: HTMLElement | null
): void {
  const transform = computeGeoViewportTransform(map, base);
  if (viewportElement) {
    applyViewportTransformToElement(viewportElement, transform);
    return;
  }
  if (rf) {
    void rf.setViewport(transform, { duration: 0 });
  }
}

function resetGeoViewport(rf: ReactFlowInstance | null): void {
  if (!rf) return;
  void rf.setViewport(GEO_VIEWPORT_RESET, { duration: 0 });
}

function syncNodesAndResetViewport(
  map: MapLibreMap,
  rf: ReactFlowInstance | null,
  nodesRef: { current: Node[] },
  setNodesRef: { current: Dispatch<SetStateAction<Node[]>> }
): void {
  resetGeoViewport(rf);
  const { nodes: syncedNodes, changed } = syncNodesToMap(map, nodesRef.current);
  if (changed) {
    setNodesRef.current(syncedNodes);
  }
}

function clearPendingInteractionTimeout(interactionEndTimeoutRef: {
  current: number | null;
}): void {
  if (interactionEndTimeoutRef.current === null) return;
  window.clearTimeout(interactionEndTimeoutRef.current);
  interactionEndTimeoutRef.current = null;
}

interface ResetGeoInteractionParams {
  interactionEndTimeoutRef: { current: number | null };
  isInteractingRef: { current: boolean };
  interactionBaseRef: { current: GeoInteractionBase | null };
  viewportElementRef: { current: HTMLElement | null };
  viewportTransformOverrideActiveRef: { current: boolean };
  setIsInteracting: (isInteracting: boolean) => void;
  reactFlowInstance: ReactFlowInstance | null;
  resetViewport?: boolean;
}

function resetGeoInteractionState({
  interactionEndTimeoutRef,
  isInteractingRef,
  interactionBaseRef,
  viewportElementRef,
  viewportTransformOverrideActiveRef,
  setIsInteracting,
  reactFlowInstance,
  resetViewport = false,
}: ResetGeoInteractionParams): void {
  clearPendingInteractionTimeout(interactionEndTimeoutRef);
  isInteractingRef.current = false;
  interactionBaseRef.current = null;
  if (viewportElementRef.current) {
    clearViewportTransformOverride(viewportElementRef.current);
  }
  viewportTransformOverrideActiveRef.current = false;
  if (resetViewport) {
    resetGeoViewport(reactFlowInstance);
  }
  setIsInteracting(false);
}

export function useGeoMapLayout({
  isGeoLayout,
  nodes,
  setNodes,
  reactFlowInstanceRef,
  canvasContainerRef,
  restoreOnExit,
}: GeoMapLayoutParams): GeoMapLayoutApi {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isInteracting, setIsInteracting] = useState(false);
  const nodesRef = useRef<Node[]>(nodes);
  const setNodesRef = useRef(setNodes);
  const wasGeoRef = useRef(false);
  const initialAssignmentRef = useRef(false);
  const originalPositionsRef = useRef<Map<string, XYPosition>>(new Map());
  const previousViewportRef = useRef<{ x: number; y: number; zoom: number } | null>(null);
  const interactionEndTimeoutRef = useRef<number | null>(null);
  const isInteractingRef = useRef(false);
  const interactionBaseRef = useRef<GeoInteractionBase | null>(null);
  const viewportElementRef = useRef<HTMLElement | null>(null);
  const viewportTransformOverrideActiveRef = useRef(false);
  const geoSyncSignatureRef = useRef<string>("");
  const workerConfiguredRef = useRef(false);

  nodesRef.current = nodes;
  setNodesRef.current = setNodes;

  useEffect(() => {
    if (!isGeoLayout || mapRef.current || !containerRef.current) return;
    try {
      if (!workerConfiguredRef.current) {
        const workerUrl = resolveMapLibreWorkerUrl();
        if (workerUrl != null && workerUrl.length > 0) {
          maplibregl.setWorkerUrl(workerUrl);
        }
        workerConfiguredRef.current = true;
      }
      const map = new maplibregl.Map({
        container: containerRef.current,
        style: MAP_STYLE,
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        attributionControl: {},
      });

      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

      map.on("load", () => {
        setIsReady(true);
      });

      map.on("error", (event: { error?: Error }) => {
        const message = event.error?.message ?? "Unknown map error";
        log.error(`[GeoMap] MapLibre error: ${message}`);
      });

      mapRef.current = map;
    } catch (err) {
      log.error(
        `[GeoMap] Failed to initialize map: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }, [isGeoLayout]);

  useEffect(() => {
    if (isGeoLayout) return;
    resetGeoInteractionState({
      interactionEndTimeoutRef,
      isInteractingRef,
      interactionBaseRef,
      viewportElementRef,
      viewportTransformOverrideActiveRef,
      setIsInteracting,
      reactFlowInstance: reactFlowInstanceRef.current,
    });
    viewportElementRef.current = null;
    geoSyncSignatureRef.current = "";
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
      setIsReady(false);
    }
  }, [isGeoLayout]);

  useEffect(() => {
    return () => {
      resetGeoInteractionState({
        interactionEndTimeoutRef,
        isInteractingRef,
        interactionBaseRef,
        viewportElementRef,
        viewportTransformOverrideActiveRef,
        setIsInteracting,
        reactFlowInstance: reactFlowInstanceRef.current,
      });
      viewportElementRef.current = null;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (isGeoLayout) {
      map.dragPan.enable({
        linearity: 0.2,
        maxSpeed: 2200,
        deceleration: 3200,
      });
      map.dragRotate.disable();
      map.touchZoomRotate.disableRotation();
      map.scrollZoom.enable();
      map.scrollZoom.setWheelZoomRate(1 / 700);
      map.scrollZoom.setZoomRate(1 / 120);
      map.doubleClickZoom.enable();
      map.keyboard.enable();
    } else {
      map.dragPan.disable();
      map.scrollZoom.disable();
      map.doubleClickZoom.disable();
      map.keyboard.disable();
    }
  }, [isGeoLayout, isReady]);

  useEffect(() => {
    if (!isGeoLayout || wasGeoRef.current) return;
    wasGeoRef.current = true;
    originalPositionsRef.current = new Map(
      nodesRef.current.map((node) => [node.id, { ...node.position }])
    );
    const rf = reactFlowInstanceRef.current;
    if (rf) {
      previousViewportRef.current = rf.getViewport();
      log.info("[GeoMap] Setting viewport to {x:0, y:0, zoom:1}");
      resetGeoViewport(rf);
      // Re-set multiple times with delays to override any pending fitView operations
      const setGeoViewport = () => {
        resetGeoViewport(rf);
      };
      window.requestAnimationFrame(setGeoViewport);
      setTimeout(setGeoViewport, 50);
      setTimeout(setGeoViewport, 150);
      setTimeout(setGeoViewport, 300);
    } else {
      log.warn("[GeoMap] React Flow instance not available for viewport reset");
    }
  }, [isGeoLayout, reactFlowInstanceRef]);

  useEffect(() => {
    if (isGeoLayout || !wasGeoRef.current) return;
    wasGeoRef.current = false;
    const previousViewport = previousViewportRef.current;
    if (previousViewport && reactFlowInstanceRef.current) {
      void reactFlowInstanceRef.current.setViewport(previousViewport, { duration: 0 });
      previousViewportRef.current = null;
    }

    const originalPositions = originalPositionsRef.current;
    if (restoreOnExit && originalPositions.size > 0) {
      setNodesRef.current((current) =>
        current.map((node) => {
          const original = originalPositions.get(node.id);
          return original ? { ...node, position: { ...original } } : node;
        })
      );
    }

    originalPositionsRef.current = new Map();
  }, [isGeoLayout, reactFlowInstanceRef, restoreOnExit]);

  useEffect(() => {
    if (!isGeoLayout) return;
    const map = mapRef.current;
    if (!map || !isReady) return;
    initialAssignmentRef.current = true;

    const currentNodes = nodesRef.current;
    const assigned = assignAutoGeoCoordinates(currentNodes);
    const nodesWithGeo = assigned.nodes;
    const assignments = assigned.assignments;
    const boundsToFit = buildGeoBounds(nodesWithGeo);

    if (boundsToFit) {
      map.fitBounds(boundsToFit, { padding: 120, duration: 0, maxZoom: 12 });
    } else {
      map.setCenter(DEFAULT_CENTER);
      map.setZoom(DEFAULT_ZOOM);
    }

    if (assignments.length > 0) {
      void saveNodePositions(assignments);
    }

    window.requestAnimationFrame(() => {
      const { nodes: syncedNodes, changed } = syncNodesToMap(map, nodesWithGeo);
      if (changed || assignments.length > 0) {
        setNodesRef.current(syncedNodes);
      }
      initialAssignmentRef.current = false;
    });

    if (assignments.length === 0) {
      setTimeout(() => {
        initialAssignmentRef.current = false;
      }, 0);
    }
  }, [isGeoLayout, isReady]);

  useEffect(() => {
    if (!isGeoLayout || !isReady) return;
    const map = mapRef.current;
    if (!map) return;
    if (initialAssignmentRef.current) return;
    if (nodes.some((node) => node.dragging === true)) return;

    const geoSyncSignature = buildGeoSyncSignature(nodes);
    if (geoSyncSignature === geoSyncSignatureRef.current) return;
    geoSyncSignatureRef.current = geoSyncSignature;

    const assigned = assignAutoGeoCoordinates(nodes);
    const { nodes: syncedNodes, changed } = syncNodesToMap(map, assigned.nodes);

    if (changed || assigned.assignments.length > 0) {
      setNodesRef.current(syncedNodes);
    }

    if (assigned.assignments.length > 0) {
      void saveNodePositions(assigned.assignments);
    }
  }, [isGeoLayout, isReady, nodes]);

  useEffect(() => {
    if (!isGeoLayout) return;
    const map = mapRef.current;
    if (!map) return;

    const syncDuringRender = () => {
      const currentMap = mapRef.current;
      if (!currentMap || !isInteractingRef.current) return;
      const base = interactionBaseRef.current;
      if (!base) return;
      const rf = reactFlowInstanceRef.current;
      if (!rf) return;
      viewportElementRef.current ??= resolveViewportElement(canvasContainerRef.current);
      applyGeoViewportTransform(currentMap, rf, base, viewportElementRef.current);
      viewportTransformOverrideActiveRef.current = Boolean(viewportElementRef.current);
    };

    const handleInteractionStart = () => {
      clearPendingInteractionTimeout(interactionEndTimeoutRef);
      if (!isInteractingRef.current) {
        const currentMap = mapRef.current;
        if (currentMap) {
          interactionBaseRef.current = {
            zoom: currentMap.getZoom(),
            anchorPoint: currentMap.project(GEO_TRANSFORM_ANCHOR),
          };
        } else {
          interactionBaseRef.current = null;
        }
      }
      viewportElementRef.current ??= resolveViewportElement(canvasContainerRef.current);
      isInteractingRef.current = true;
      setIsInteracting(true);
    };

    const scheduleInteractionEnd = (delayMs: number) => {
      clearPendingInteractionTimeout(interactionEndTimeoutRef);
      interactionEndTimeoutRef.current = window.setTimeout(() => {
        interactionEndTimeoutRef.current = null;
        isInteractingRef.current = false;
        const currentMap = mapRef.current;
        if (currentMap) {
          syncNodesAndResetViewport(
            currentMap,
            reactFlowInstanceRef.current,
            nodesRef,
            setNodesRef
          );
        } else {
          resetGeoViewport(reactFlowInstanceRef.current);
        }
        clearViewportOverrideOnNextFrame(viewportElementRef, viewportTransformOverrideActiveRef);
        interactionBaseRef.current = null;
        setIsInteracting(false);
      }, delayMs);
    };
    const handleInteractionEnd = () => scheduleInteractionEnd(INTERACTION_END_DEBOUNCE_MS);
    const handleZoomEnd = () => scheduleInteractionEnd(ZOOM_END_DEBOUNCE_MS);

    map.on("render", syncDuringRender);
    map.on("movestart", handleInteractionStart);
    map.on("zoomstart", handleInteractionStart);
    map.on("rotatestart", handleInteractionStart);
    map.on("moveend", handleInteractionEnd);
    map.on("zoomend", handleZoomEnd);
    map.on("rotateend", handleInteractionEnd);

    return () => {
      map.off("render", syncDuringRender);
      map.off("movestart", handleInteractionStart);
      map.off("zoomstart", handleInteractionStart);
      map.off("rotatestart", handleInteractionStart);
      map.off("moveend", handleInteractionEnd);
      map.off("zoomend", handleZoomEnd);
      map.off("rotateend", handleInteractionEnd);
      resetGeoInteractionState({
        interactionEndTimeoutRef,
        isInteractingRef,
        interactionBaseRef,
        viewportElementRef,
        viewportTransformOverrideActiveRef,
        setIsInteracting,
        reactFlowInstance: reactFlowInstanceRef.current,
        resetViewport: true,
      });
    };
  }, [isGeoLayout, reactFlowInstanceRef, canvasContainerRef]);

  useEffect(() => {
    if (!isGeoLayout) return;
    const container = containerRef.current;
    const map = mapRef.current;
    if (!container || !map || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      map.resize();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [isGeoLayout]);

  const getGeoCoordinatesForNode = useCallback((node: Node): GeoCoordinates | null => {
    const map = mapRef.current;
    if (!map) return null;
    return unprojectPositionToGeo(map, node);
  }, []);

  const getGeoUpdateForNode = useCallback(
    (
      node: Node
    ): { geoCoordinates?: GeoCoordinates; endGeoCoordinates?: GeoCoordinates } | null => {
      const map = mapRef.current;
      if (!map) return null;
      const data = node.data;
      if (node.type === FREE_SHAPE_NODE_TYPE && data.shapeType === "line") {
        const lineStart = toXYPosition(data.lineStartInNode) ?? {
          x: LINE_PADDING,
          y: LINE_PADDING,
        };
        const relativeEnd = toXYPosition(data.relativeEndPosition) ?? { x: 0, y: 0 };
        const startX = node.position.x + lineStart.x;
        const startY = node.position.y + lineStart.y;
        const endX = startX + relativeEnd.x;
        const endY = startY + relativeEnd.y;
        const startGeo = map.unproject([startX, startY]);
        const endGeo = map.unproject([endX, endY]);
        return {
          geoCoordinates: roundGeo({ lat: startGeo.lat, lng: startGeo.lng }),
          endGeoCoordinates: roundGeo({ lat: endGeo.lat, lng: endGeo.lng }),
        };
      }
      const geoCoordinates = unprojectPositionToGeo(map, node);
      return { geoCoordinates };
    },
    []
  );

  const fitToViewport = useCallback(
    (options?: { duration?: number }) => {
      if (!isGeoLayout) return;
      const map = mapRef.current;
      if (!map) return;
      const duration = typeof options?.duration === "number" ? options.duration : 200;

      resetGeoInteractionState({
        interactionEndTimeoutRef,
        isInteractingRef,
        interactionBaseRef,
        viewportElementRef,
        viewportTransformOverrideActiveRef,
        setIsInteracting,
        reactFlowInstance: reactFlowInstanceRef.current,
        resetViewport: true,
      });

      const bounds = buildGeoBounds(nodesRef.current);
      if (bounds) {
        map.fitBounds(bounds, { padding: 120, duration, maxZoom: 12 });
        return;
      }
      map.easeTo({ center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM, duration });
    },
    [isGeoLayout, reactFlowInstanceRef]
  );

  return useMemo(
    () => ({
      containerRef,
      mapRef,
      isReady,
      isInteracting,
      fitToViewport,
      getGeoCoordinatesForNode,
      getGeoUpdateForNode,
    }),
    [isReady, isInteracting, fitToViewport, getGeoCoordinatesForNode, getGeoUpdateForNode]
  );
}
