/**
 * Utility functions for topology parsing.
 * Pure functions - no VS Code dependencies.
 */

import type { ClabTopology, NodeAnnotation, TopologyAnnotations } from "../types/topology";

/**
 * Computes the full prefix for container names.
 *
 * @param parsed - The parsed topology
 * @param clabName - The lab name
 * @returns The full prefix (e.g., "clab-labname")
 */
export function computeFullPrefix(parsed: ClabTopology, clabName: string): string {
  if (parsed.prefix === undefined) {
    return `clab-${clabName}`;
  }
  if (parsed.prefix === "" || parsed.prefix.trim() === "") {
    return "";
  }
  return `${parsed.prefix.trim()}-${clabName}`;
}

/**
 * Checks if the topology has preset layout (all nodes have positions).
 *
 * @param parsed - The parsed topology
 * @param annotations - Optional annotations object
 * @returns True if all nodes have positions in annotations
 */
export function isPresetLayout(parsed: ClabTopology, annotations?: TopologyAnnotations): boolean {
  const topology = parsed.topology;
  if (!topology || !topology.nodes) return false;
  const annotationMap = createNodeAnnotationsMap(annotations);
  return Object.keys(topology.nodes).every((nodeName) => {
    const ann = annotationMap.get(nodeName);
    return ann?.position !== undefined;
  });
}

/**
 * Extracts icon visual properties from node annotation.
 *
 * @param nodeAnn - The node annotation
 * @returns Object with iconColor and/or iconCornerRadius if present
 */
export function extractIconVisuals(nodeAnn: NodeAnnotation | undefined): Record<string, unknown> {
  const visuals: Record<string, unknown> = {};
  if (typeof nodeAnn?.iconColor === "string") {
    visuals.iconColor = nodeAnn.iconColor;
  }
  if (typeof nodeAnn?.iconCornerRadius === "number") {
    visuals.iconCornerRadius = nodeAnn.iconCornerRadius;
  }
  return visuals;
}

/**
 * Sanitizes labels by removing graph-* properties.
 * These properties are migrated to annotations and should not be kept in labels.
 *
 * @param labels - The labels object
 * @returns A new labels object without graph-* properties
 */
export function sanitizeLabels(
  labels: Record<string, unknown> | undefined
): Record<string, unknown> {
  const cleaned = { ...(labels ?? {}) };
  delete cleaned["graph-posX"];
  delete cleaned["graph-posY"];
  delete cleaned["graph-icon"];
  delete cleaned["graph-geoCoordinateLat"];
  delete cleaned["graph-geoCoordinateLng"];
  delete cleaned["graph-groupLabelPos"];
  delete cleaned["graph-group"];
  delete cleaned["graph-level"];
  return cleaned;
}

/**
 * Gets lat/lng from node annotation.
 *
 * @param nodeAnn - The node annotation
 * @returns Object with lat and lng strings (empty if not present)
 */
export function getNodeLatLng(nodeAnn: NodeAnnotation | undefined): { lat: string; lng: string } {
  const geoCoords = nodeAnn?.geoCoordinates;
  const lat = geoCoords?.lat !== undefined ? String(geoCoords.lat) : "";
  const lng = geoCoords?.lng !== undefined ? String(geoCoords.lng) : "";
  return { lat, lng };
}

/**
 * Compute the long name for a node.
 *
 * @param containerName - Container name if available
 * @param fullPrefix - The full prefix
 * @param nodeName - The node name
 * @returns The long name
 */
export function computeLongname(
  containerName: string | undefined,
  fullPrefix: string,
  nodeName: string
): string {
  if (containerName) return containerName;
  return fullPrefix ? `${fullPrefix}-${nodeName}` : nodeName;
}

/**
 * Creates a map from node ID to NodeAnnotation for fast lookups.
 *
 * @param annotations - The topology annotations
 * @returns Map from node ID to annotation
 */
export function createNodeAnnotationsMap(
  annotations?: TopologyAnnotations
): Map<string, NodeAnnotation> {
  const map = new Map<string, NodeAnnotation>();
  if (!annotations?.nodeAnnotations) return map;
  for (const na of annotations.nodeAnnotations) {
    map.set(na.id, na);
  }
  return map;
}

/**
 * Gets the lab name from topology, with fallback.
 *
 * @param parsed - The parsed topology
 * @returns The lab name or 'topology' as fallback
 */
export function getLabName(parsed: ClabTopology): string {
  return parsed.name || "topology";
}

/**
 * Creates a set of node IDs from the topology.
 *
 * @param parsed - The parsed topology
 * @returns Set of node IDs
 */
export function getTopologyNodeIds(parsed: ClabTopology): Set<string> {
  return new Set(Object.keys(parsed.topology?.nodes || {}));
}
