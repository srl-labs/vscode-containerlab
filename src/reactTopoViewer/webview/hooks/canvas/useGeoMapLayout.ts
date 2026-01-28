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

interface GeoCoordinates {
  lat: number;
  lng: number;
}

interface GeoMapLayoutParams {
  isGeoLayout: boolean;
  geoMode: "pan" | "edit";
  nodes: Node[];
  setNodes: Dispatch<SetStateAction<Node[]>>;
  reactFlowInstanceRef: RefObject<ReactFlowInstance | null>;
  restoreOnExit: boolean;
}

export interface GeoMapLayoutApi {
  containerRef: RefObject<HTMLDivElement | null>;
  mapRef: RefObject<MapLibreMap | null>;
  isReady: boolean;
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
      attribution: "© OpenStreetMap contributors"
    }
  },
  layers: [
    {
      id: "osm",
      type: "raster",
      source: "osm"
    }
  ]
};
// Default center in Europe (Stuttgart, Germany area)
const DEFAULT_LAT = 48.684826888402256;
const DEFAULT_LNG = 9.007895390625677;
const DEFAULT_CENTER: [number, number] = [DEFAULT_LNG, DEFAULT_LAT];
const DEFAULT_ZOOM = 4;

const DEFAULT_NODE_SIZE = { width: 60, height: 60 };
const DEFAULT_GROUP_SIZE = { width: 200, height: 150 };
const DEFAULT_TEXT_SIZE = { width: 140, height: 40 };
const DEFAULT_SHAPE_SIZE = { width: 120, height: 120 };

const POSITION_EPSILON = 0.25;

const AUTO_GEO_TYPES = new Set(["topology-node", "cloud-node"]);

const LINE_PADDING = 20;

// Offset multiplier for distributing nodes without coordinates (smaller = tighter cluster)
const GEO_OFFSET_MULTIPLIER = 0.15;

function roundCoord(value: number): number {
  return Number(value.toFixed(6));
}

function roundGeo(coords: GeoCoordinates): GeoCoordinates {
  return { lat: roundCoord(coords.lat), lng: roundCoord(coords.lng) };
}

function getNodeSize(node: Node): { width: number; height: number } {
  const data = (node.data ?? {}) as Record<string, unknown>;
  const width = node.width ?? (typeof data.width === "number" ? data.width : undefined);
  const height = node.height ?? (typeof data.height === "number" ? data.height : undefined);

  if (width && height) {
    return { width, height };
  }

  switch (node.type) {
    case "group-node":
      return {
        width: width ?? DEFAULT_GROUP_SIZE.width,
        height: height ?? DEFAULT_GROUP_SIZE.height
      };
    case "free-text-node":
      return {
        width: width ?? DEFAULT_TEXT_SIZE.width,
        height: height ?? DEFAULT_TEXT_SIZE.height
      };
    case "free-shape-node":
      return {
        width: width ?? DEFAULT_SHAPE_SIZE.width,
        height: height ?? DEFAULT_SHAPE_SIZE.height
      };
    default:
      return {
        width: width ?? DEFAULT_NODE_SIZE.width,
        height: height ?? DEFAULT_NODE_SIZE.height
      };
  }
}

function extractGeoCoordinates(node: Node): GeoCoordinates | null {
  const data = (node.data ?? {}) as Record<string, unknown>;
  const geo = (data.geoCoordinates ??
    (data.extraData as Record<string, unknown> | undefined)?.geoCoordinates) as
    | GeoCoordinates
    | undefined;
  if (!geo) return null;
  if (!Number.isFinite(geo.lat) || !Number.isFinite(geo.lng)) return null;
  return geo;
}

function extractEndGeoCoordinates(node: Node): GeoCoordinates | null {
  const data = (node.data ?? {}) as Record<string, unknown>;
  const geo = data.endGeoCoordinates as GeoCoordinates | undefined;
  if (!geo) return null;
  if (!Number.isFinite(geo.lat) || !Number.isFinite(geo.lng)) return null;
  return geo;
}

function positionEquals(a: XYPosition, b: XYPosition): boolean {
  return Math.abs(a.x - b.x) <= POSITION_EPSILON && Math.abs(a.y - b.y) <= POSITION_EPSILON;
}

function projectGeoToPosition(map: MapLibreMap, node: Node, geo: GeoCoordinates): XYPosition {
  const { width, height } = getNodeSize(node);
  const point = map.project([geo.lng, geo.lat]);
  return {
    x: point.x - width / 2,
    y: point.y - height / 2
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
    lineStartInNode: { x: start.x - minX, y: start.y - minY }
  };
}

function buildGeoBounds(nodes: Node[]): LngLatBounds | null {
  let bounds: LngLatBounds | null = null;
  for (const node of nodes) {
    const start = extractGeoCoordinates(node);
    const end = extractEndGeoCoordinates(node);
    if (!start && !end) continue;
    const coords = [start, end].filter(Boolean) as GeoCoordinates[];
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

export function useGeoMapLayout({
  isGeoLayout,
  geoMode,
  nodes,
  setNodes,
  reactFlowInstanceRef,
  restoreOnExit
}: GeoMapLayoutParams): GeoMapLayoutApi {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [isReady, setIsReady] = useState(false);
  const nodesRef = useRef<Node[]>(nodes);
  const setNodesRef = useRef(setNodes);
  const geoModeRef = useRef<"pan" | "edit">(geoMode);
  const wasGeoRef = useRef(false);
  const originalPositionsRef = useRef<Map<string, XYPosition>>(new Map());
  const previousViewportRef = useRef<{ x: number; y: number; zoom: number } | null>(null);
  const rafRef = useRef<number | null>(null);
  const workerConfiguredRef = useRef(false);

  nodesRef.current = nodes;
  setNodesRef.current = setNodes;
  geoModeRef.current = geoMode;

  useEffect(() => {
    if (!isGeoLayout || mapRef.current || !containerRef.current) return;
    try {
      if (!workerConfiguredRef.current) {
        if (typeof window !== "undefined" && window.maplibreWorkerUrl) {
          maplibregl.setWorkerUrl(window.maplibreWorkerUrl);
        }
        workerConfiguredRef.current = true;
      }
      const map = new maplibregl.Map({
        container: containerRef.current,
        style: MAP_STYLE,
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        attributionControl: {}
      });

      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

      map.on("load", () => {
        setIsReady(true);
      });

      map.on("error", (event) => {
        const message = event?.error?.message ?? "Unknown map error";
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
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
      setIsReady(false);
    }
  }, [isGeoLayout]);

  useEffect(() => {
    return () => {
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
      if (geoMode === "pan") {
        map.dragPan.enable();
      } else {
        map.dragPan.disable();
      }
      map.scrollZoom.enable();
      map.doubleClickZoom.enable();
      map.keyboard.enable();
    } else {
      map.dragPan.disable();
      map.scrollZoom.disable();
      map.doubleClickZoom.disable();
      map.keyboard.disable();
    }
  }, [isGeoLayout, geoMode, isReady]);

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
      rf.setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 0 });
      // Re-set multiple times with delays to override any pending fitView operations
      const setGeoViewport = () => rf.setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 0 });
      requestAnimationFrame(setGeoViewport);
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
      reactFlowInstanceRef.current.setViewport(previousViewport, { duration: 0 });
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

    const applySync = () => {
      // Skip sync in edit mode - user may be actively positioning nodes
      if (geoModeRef.current === "edit") {
        return;
      }
      setNodesRef.current((current) => {
        let changed = false;
        const next = current.map((node) => {
          const data = (node.data ?? {}) as Record<string, unknown>;
          if (node.type === FREE_SHAPE_NODE_TYPE && data.shapeType === "line") {
            const startGeo = extractGeoCoordinates(node);
            const endGeo = extractEndGeoCoordinates(node);
            if (!startGeo || !endGeo) return node;
            const start = map.project([startGeo.lng, startGeo.lat]);
            const end = map.project([endGeo.lng, endGeo.lat]);
            const boundsInfo = computeLineBounds(
              { x: start.x, y: start.y },
              { x: end.x, y: end.y }
            );
            if (
              positionEquals(node.position, boundsInfo.nodePosition) &&
              node.width === boundsInfo.width &&
              node.height === boundsInfo.height
            ) {
              return node;
            }
            changed = true;
            return {
              ...node,
              position: boundsInfo.nodePosition,
              width: boundsInfo.width,
              height: boundsInfo.height,
              data: {
                ...data,
                startPosition: { x: start.x, y: start.y },
                endPosition: { x: end.x, y: end.y },
                relativeEndPosition: boundsInfo.relativeEndPosition,
                lineStartInNode: boundsInfo.lineStartInNode
              }
            };
          }

          const geo = extractGeoCoordinates(node);
          if (!geo) return node;
          const position = projectGeoToPosition(map, node, geo);
          if (positionEquals(node.position, position)) return node;
          changed = true;
          return { ...node, position };
        });
        return changed ? next : current;
      });
    };

    // First, check if any nodes already have geo coordinates
    const existingBounds = buildGeoBounds(nodesRef.current);

    if (existingBounds) {
      // Some nodes have geo coordinates - fit to those bounds, then ensure all have coords
      map.fitBounds(existingBounds, { padding: 120, duration: 0, maxZoom: 12 });
      // Assign geo coords to nodes that don't have them (using existing center)
      setNodesRef.current((current) => {
        const existingCoords: GeoCoordinates[] = [];
        for (const node of current) {
          if (!AUTO_GEO_TYPES.has(node.type ?? "")) continue;
          const data = (node.data ?? {}) as Record<string, unknown>;
          const geo = (data.geoCoordinates ??
            (data.extraData as Record<string, unknown> | undefined)?.geoCoordinates) as
            | GeoCoordinates
            | undefined;
          if (geo && Number.isFinite(geo.lat) && Number.isFinite(geo.lng)) {
            existingCoords.push(geo);
          }
        }
        const centerLat = existingCoords.reduce((sum, c) => sum + c.lat, 0) / existingCoords.length;
        const centerLng = existingCoords.reduce((sum, c) => sum + c.lng, 0) / existingCoords.length;

        let nodeIndex = 0;
        return current.map((node) => {
          if (!AUTO_GEO_TYPES.has(node.type ?? "")) return node;
          const data = (node.data ?? {}) as Record<string, unknown>;
          const existingGeo =
            data.geoCoordinates ??
            (data.extraData as Record<string, unknown> | undefined)?.geoCoordinates;
          if (existingGeo) return node;

          const idHash1 = node.id.length % 5;
          const idHash2 = (node.id.charCodeAt(0) || 0) % 7;
          const latOffset = (idHash1 - 2) * GEO_OFFSET_MULTIPLIER;
          const lngOffset = (idHash2 - 3) * GEO_OFFSET_MULTIPLIER;

          const geo = roundGeo({
            lat: centerLat + latOffset + nodeIndex * 0.03,
            lng: centerLng + lngOffset + nodeIndex * 0.035
          });
          nodeIndex++;
          return { ...node, data: { ...data, geoCoordinates: geo } };
        });
      });
      // Call applySync after a frame to ensure map state is settled
      requestAnimationFrame(() => {
        applySync();
      });
    } else {
      // No nodes have geo coordinates - assign them all in Europe, then fit
      // First compute the new nodes with geo coordinates
      const currentNodes = nodesRef.current;
      let nodeIndex = 0;
      const nodesWithGeo = currentNodes.map((node) => {
        if (!AUTO_GEO_TYPES.has(node.type ?? "")) return node;
        const data = (node.data ?? {}) as Record<string, unknown>;
        const existingGeo =
          data.geoCoordinates ??
          (data.extraData as Record<string, unknown> | undefined)?.geoCoordinates;
        if (existingGeo) return node;

        const idHash1 = node.id.length % 5;
        const idHash2 = (node.id.charCodeAt(0) || 0) % 7;
        const latOffset = (idHash1 - 2) * GEO_OFFSET_MULTIPLIER;
        const lngOffset = (idHash2 - 3) * GEO_OFFSET_MULTIPLIER;

        const geo = roundGeo({
          lat: DEFAULT_LAT + latOffset + nodeIndex * 0.03,
          lng: DEFAULT_LNG + lngOffset + nodeIndex * 0.035
        });
        nodeIndex++;
        return { ...node, data: { ...data, geoCoordinates: geo } };
      });

      // Compute bounds from the nodes we just created (before setNodes)
      const newBounds = buildGeoBounds(nodesWithGeo);

      // Update state with new nodes
      setNodesRef.current(nodesWithGeo);

      // Fit map to bounds and sync positions
      if (newBounds) {
        map.fitBounds(newBounds, { padding: 120, duration: 0, maxZoom: 12 });
      } else {
        // Fallback: center on Europe
        map.setCenter(DEFAULT_CENTER);
        map.setZoom(DEFAULT_ZOOM);
      }
      // Always call applySync after a frame to ensure map state is settled
      requestAnimationFrame(() => {
        applySync();
      });
    }
  }, [isGeoLayout, isReady]);

  useEffect(() => {
    if (!isGeoLayout) return;
    const map = mapRef.current;
    if (!map) return;

    const scheduleSync = () => {
      if (rafRef.current !== null) return;
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null;
        const currentMap = mapRef.current;
        // Skip sync in edit mode - user is actively positioning nodes
        if (!isGeoLayout || !currentMap || geoModeRef.current === "edit") return;
        setNodesRef.current((current) => {
          let changed = false;
          const next = current.map((node) => {
            const data = (node.data ?? {}) as Record<string, unknown>;
            if (node.type === FREE_SHAPE_NODE_TYPE && data.shapeType === "line") {
              const startGeo = extractGeoCoordinates(node);
              const endGeo = extractEndGeoCoordinates(node);
              if (!startGeo || !endGeo) return node;
              const start = currentMap.project([startGeo.lng, startGeo.lat]);
              const end = currentMap.project([endGeo.lng, endGeo.lat]);
              const boundsInfo = computeLineBounds(
                { x: start.x, y: start.y },
                { x: end.x, y: end.y }
              );
              if (
                positionEquals(node.position, boundsInfo.nodePosition) &&
                node.width === boundsInfo.width &&
                node.height === boundsInfo.height
              ) {
                return node;
              }
              changed = true;
              return {
                ...node,
                position: boundsInfo.nodePosition,
                width: boundsInfo.width,
                height: boundsInfo.height,
                data: {
                  ...data,
                  startPosition: { x: start.x, y: start.y },
                  endPosition: { x: end.x, y: end.y },
                  relativeEndPosition: boundsInfo.relativeEndPosition,
                  lineStartInNode: boundsInfo.lineStartInNode
                }
              };
            }

            const geo = extractGeoCoordinates(node);
            if (!geo) return node;
            const position = projectGeoToPosition(currentMap, node, geo);
            if (positionEquals(node.position, position)) return node;
            changed = true;
            return { ...node, position };
          });
          return changed ? next : current;
        });
      });
    };

    map.on("move", scheduleSync);
    map.on("zoom", scheduleSync);
    map.on("rotate", scheduleSync);

    return () => {
      map.off("move", scheduleSync);
      map.off("zoom", scheduleSync);
      map.off("rotate", scheduleSync);
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isGeoLayout]);

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
      const data = (node.data ?? {}) as Record<string, unknown>;
      if (node.type === FREE_SHAPE_NODE_TYPE && data.shapeType === "line") {
        const lineStart = (data.lineStartInNode as XYPosition | undefined) ?? {
          x: LINE_PADDING,
          y: LINE_PADDING
        };
        const relativeEnd = (data.relativeEndPosition as XYPosition | undefined) ?? { x: 0, y: 0 };
        const startX = node.position.x + lineStart.x;
        const startY = node.position.y + lineStart.y;
        const endX = startX + relativeEnd.x;
        const endY = startY + relativeEnd.y;
        const startGeo = map.unproject([startX, startY]);
        const endGeo = map.unproject([endX, endY]);
        return {
          geoCoordinates: roundGeo({ lat: startGeo.lat, lng: startGeo.lng }),
          endGeoCoordinates: roundGeo({ lat: endGeo.lat, lng: endGeo.lng })
        };
      }
      const geoCoordinates = unprojectPositionToGeo(map, node);
      return { geoCoordinates };
    },
    []
  );

  return useMemo(
    () => ({
      containerRef,
      mapRef,
      isReady,
      getGeoCoordinatesForNode,
      getGeoUpdateForNode
    }),
    [isReady, getGeoCoordinatesForNode, getGeoUpdateForNode]
  );
}
