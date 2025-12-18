/**
 * Annotations merger for applying annotations to Cytoscape elements.
 * Pure functions - no VS Code dependencies.
 */

import { CyElement, TopologyAnnotations, NodeAnnotation } from '../types/topology';

// ============================================================================
// Position Application
// ============================================================================

/**
 * Applies node positions from annotations to elements.
 */
export function applyNodePositions(
  elements: CyElement[],
  annotations?: TopologyAnnotations
): void {
  if (!annotations?.nodeAnnotations) return;

  const positionMap = new Map<string, { x: number; y: number }>();
  for (const ann of annotations.nodeAnnotations) {
    if (ann.position) {
      positionMap.set(ann.id, ann.position);
    }
  }

  for (const el of elements) {
    if (el.group !== 'nodes') continue;
    const nodeId = el.data.id as string;
    const position = positionMap.get(nodeId);
    if (position) {
      el.position = { x: position.x, y: position.y };
    }
  }
}

/**
 * Applies network node positions from annotations.
 */
export function applyNetworkNodePositions(
  elements: CyElement[],
  annotations?: TopologyAnnotations
): void {
  if (!annotations?.networkNodeAnnotations) return;

  const positionMap = new Map<string, { x: number; y: number }>();
  for (const ann of annotations.networkNodeAnnotations) {
    if (ann.position) {
      positionMap.set(ann.id, ann.position);
    }
  }

  for (const el of elements) {
    if (el.group !== 'nodes') continue;
    const nodeId = el.data.id as string;
    const position = positionMap.get(nodeId);
    if (position) {
      el.position = { x: position.x, y: position.y };
    }
  }
}

// ============================================================================
// Group Membership
// ============================================================================

/** Applies group membership to a single element. */
function applyMembershipToElement(
  el: CyElement,
  membership: { group?: string; level?: string }
): void {
  const extraData = el.data.extraData as Record<string, unknown> | undefined;
  if (!extraData) return;
  if (membership.group) extraData.group = membership.group;
  if (membership.level) extraData.level = membership.level;
}

/**
 * Applies group memberships from annotations to elements.
 */
export function applyGroupMemberships(
  elements: CyElement[],
  annotations?: TopologyAnnotations
): void {
  if (!annotations?.nodeAnnotations) return;

  const groupMap = new Map<string, { group?: string; level?: string }>();
  for (const ann of annotations.nodeAnnotations) {
    if (ann.group || ann.level) {
      groupMap.set(ann.id, { group: ann.group, level: ann.level });
    }
  }

  for (const el of elements) {
    if (el.group !== 'nodes') continue;
    const membership = groupMap.get(el.data.id as string);
    if (membership) applyMembershipToElement(el, membership);
  }
}

// ============================================================================
// Icon Application
// ============================================================================

/** Icon data from annotation. */
interface IconData { icon?: string; iconColor?: string; iconCornerRadius?: number }

/** Applies icon data to a single element. */
function applyIconToElement(el: CyElement, iconData: IconData): void {
  if (iconData.icon) el.data.topoViewerRole = iconData.icon;
  if (iconData.iconColor) el.data.iconColor = iconData.iconColor;
  if (iconData.iconCornerRadius !== undefined) el.data.iconCornerRadius = iconData.iconCornerRadius;
}

/**
 * Applies icon overrides from annotations to elements.
 */
export function applyIconOverrides(
  elements: CyElement[],
  annotations?: TopologyAnnotations
): void {
  if (!annotations?.nodeAnnotations) return;

  const iconMap = new Map<string, IconData>();
  for (const ann of annotations.nodeAnnotations) {
    if (ann.icon || ann.iconColor || ann.iconCornerRadius !== undefined) {
      iconMap.set(ann.id, { icon: ann.icon, iconColor: ann.iconColor, iconCornerRadius: ann.iconCornerRadius });
    }
  }

  for (const el of elements) {
    if (el.group !== 'nodes') continue;
    const iconData = iconMap.get(el.data.id as string);
    if (iconData) applyIconToElement(el, iconData);
  }
}

// ============================================================================
// Geo Coordinates
// ============================================================================

/**
 * Applies geo coordinates from annotations to elements.
 */
export function applyGeoCoordinates(
  elements: CyElement[],
  annotations?: TopologyAnnotations
): void {
  if (!annotations?.nodeAnnotations) return;

  const geoMap = new Map<string, { lat: number; lng: number }>();
  for (const ann of annotations.nodeAnnotations) {
    if (ann.geoCoordinates) {
      geoMap.set(ann.id, ann.geoCoordinates);
    }
  }

  for (const el of elements) {
    if (el.group !== 'nodes') continue;
    const nodeId = el.data.id as string;
    const coords = geoMap.get(nodeId);
    if (coords) {
      el.data.lat = String(coords.lat);
      el.data.lng = String(coords.lng);
    }
  }
}

// ============================================================================
// Extraction Helpers
// ============================================================================

/** Extracts position from element. */
function extractPosition(el: CyElement): { x: number; y: number } | undefined {
  if (el.position && (el.position.x !== 0 || el.position.y !== 0)) {
    return { x: el.position.x, y: el.position.y };
  }
  return undefined;
}

/** Extracts icon properties from element. */
function extractIconProps(el: CyElement): Partial<NodeAnnotation> {
  const result: Partial<NodeAnnotation> = {};
  const topoViewerRole = el.data.topoViewerRole as string;
  if (topoViewerRole && topoViewerRole !== 'router' && topoViewerRole !== 'cloud') {
    result.icon = topoViewerRole;
  }
  if (el.data.iconColor) result.iconColor = el.data.iconColor as string;
  if (el.data.iconCornerRadius !== undefined) result.iconCornerRadius = el.data.iconCornerRadius as number;
  return result;
}

/** Extracts geo coordinates from element. */
function extractGeoCoords(el: CyElement): { lat: number; lng: number } | undefined {
  const lat = parseFloat(el.data.lat as string);
  const lng = parseFloat(el.data.lng as string);
  if (!isNaN(lat) && !isNaN(lng) && (lat !== 0 || lng !== 0)) {
    return { lat, lng };
  }
  return undefined;
}

// ============================================================================
// Extraction
// ============================================================================

/**
 * Extracts node annotations from elements.
 * Used for saving element state back to annotations.
 */
export function extractNodeAnnotations(elements: CyElement[]): NodeAnnotation[] {
  const annotations: NodeAnnotation[] = [];

  for (const el of elements) {
    if (el.group !== 'nodes') continue;
    const nodeId = el.data.id as string;
    if (!nodeId) continue;

    const annotation: NodeAnnotation = { id: nodeId };
    const extraData = el.data.extraData as Record<string, unknown> | undefined;

    // Extract properties using helpers
    const position = extractPosition(el);
    if (position) annotation.position = position;

    Object.assign(annotation, extractIconProps(el));

    if (extraData?.group) annotation.group = extraData.group as string;
    if (extraData?.level) annotation.level = extraData.level as string;

    const geoCoords = extractGeoCoords(el);
    if (geoCoords) annotation.geoCoordinates = geoCoords;

    if (extraData?.interfacePattern) annotation.interfacePattern = extraData.interfacePattern as string;

    annotations.push(annotation);
  }

  return annotations;
}

// ============================================================================
// Full Merge
// ============================================================================

/**
 * Merges annotations with elements.
 * Applies all annotation data to the corresponding elements.
 */
export function mergeAnnotationsWithElements(
  elements: CyElement[],
  annotations?: TopologyAnnotations
): void {
  if (!annotations) return;

  applyNodePositions(elements, annotations);
  applyNetworkNodePositions(elements, annotations);
  applyGroupMemberships(elements, annotations);
  applyIconOverrides(elements, annotations);
  applyGeoCoordinates(elements, annotations);
}
