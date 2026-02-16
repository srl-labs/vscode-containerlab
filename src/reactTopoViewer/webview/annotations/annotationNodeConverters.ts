/**
 * Bidirectional conversion utilities for annotation data and React Flow nodes.
 *
 * This module provides functions to convert between:
 * - FreeTextAnnotation <-> Node<FreeTextNodeData>
 * - FreeShapeAnnotation <-> Node<FreeShapeNodeData>
 * - GroupStyleAnnotation <-> Node<GroupNodeData>
 *
 * Used for:
 * - Loading annotations from JSON into graph store (annotation → node)
 * - Persisting annotation nodes to JSON (node → annotation)
 */
import type { Node } from "@xyflow/react";

import type {
  FreeTextAnnotation,
  FreeShapeAnnotation,
  GroupStyleAnnotation
} from "../../shared/types/topology";
import type {
  FreeTextNodeData,
  FreeShapeNodeData,
  GroupNodeData
} from "../components/canvas/types";

import { DEFAULT_LINE_LENGTH } from "./constants";

// ============================================================================
// Constants
// ============================================================================

/** Node type constants */
export const FREE_TEXT_NODE_TYPE = "free-text-node" as const;
export const FREE_SHAPE_NODE_TYPE = "free-shape-node" as const;
export const GROUP_NODE_TYPE = "group-node" as const;

/** Set of annotation node types for quick lookup */
const ANNOTATION_NODE_TYPES: Set<string> = new Set([
  FREE_TEXT_NODE_TYPE,
  FREE_SHAPE_NODE_TYPE,
  GROUP_NODE_TYPE
]);

/** Padding for line bounding box to accommodate arrows and stroke */
const LINE_PADDING = 20;
/** Default zIndex for shapes so they render behind topology nodes */
const DEFAULT_SHAPE_Z_INDEX = -1;
const DEFAULT_GROUP_WIDTH = 200;
const DEFAULT_GROUP_HEIGHT = 150;

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

function normalizePosition(
  value: unknown,
  fallback: { x: number; y: number } = { x: 0, y: 0 }
): { x: number; y: number } {
  if (!value || typeof value !== "object") return { ...fallback };
  const rec = value as Record<string, unknown>;
  const x = toFiniteNumber(rec.x);
  const y = toFiniteNumber(rec.y);
  if (x === undefined || y === undefined) return { ...fallback };
  return { x, y };
}

function parseLegacyGroupIdentity(groupId: string): { name: string; level: string } {
  const idx = groupId.lastIndexOf(":");
  if (idx > 0 && idx < groupId.length - 1) {
    return { name: groupId.slice(0, idx), level: groupId.slice(idx + 1) };
  }
  return { name: groupId, level: "1" };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a node type is an annotation type
 */
export function isAnnotationNodeType(type: string | undefined): boolean {
  return type !== undefined && ANNOTATION_NODE_TYPES.has(type);
}

/**
 * Resolve the parent ID from a group annotation.
 * Handles legacy field naming where both parentId and groupId may be used.
 */
export function resolveGroupParentId(
  parentId: string | undefined,
  groupId: string | undefined
): string | undefined {
  if (typeof parentId === "string") return parentId;
  if (typeof groupId === "string") return groupId;
  return undefined;
}

// ============================================================================
// Line Bounding Box Computation
// ============================================================================

interface LineBounds {
  nodePosition: { x: number; y: number };
  width: number;
  height: number;
  relativeEndPosition: { x: number; y: number };
  lineStartInNode: { x: number; y: number };
}

/**
 * Compute line bounding box and positioning info for line shapes
 */
function computeLineBounds(
  annotation: FreeShapeAnnotation,
  startPosition: { x: number; y: number }
): LineBounds {
  const startX = startPosition.x;
  const startY = startPosition.y;
  const endPosition = normalizePosition(annotation.endPosition, {
    x: startX + DEFAULT_LINE_LENGTH,
    y: startY
  });
  const endX = endPosition.x;
  const endY = endPosition.y;

  // Compute bounding box with padding
  const minX = Math.min(startX, endX) - LINE_PADDING;
  const minY = Math.min(startY, endY) - LINE_PADDING;
  const maxX = Math.max(startX, endX) + LINE_PADDING;
  const maxY = Math.max(startY, endY) + LINE_PADDING;

  const nodePosition = { x: minX, y: minY };

  return {
    nodePosition,
    width: maxX - minX,
    height: Math.max(maxY - minY, LINE_PADDING * 2),
    relativeEndPosition: { x: endX - startX, y: endY - startY },
    lineStartInNode: { x: startX - minX, y: startY - minY }
  };
}

// ============================================================================
// Annotation → Node Conversion
// ============================================================================

/**
 * Convert a FreeTextAnnotation to a React Flow Node
 */
export function freeTextToNode(annotation: FreeTextAnnotation): Node<FreeTextNodeData> {
  const position = normalizePosition(annotation.position);
  return {
    id: annotation.id,
    type: FREE_TEXT_NODE_TYPE,
    position,
    // Width/height at top level for React Flow's NodeResizer compatibility
    width: annotation.width,
    height: annotation.height,
    draggable: true,
    selectable: true,
    data: {
      text: annotation.text,
      fontSize: annotation.fontSize,
      fontColor: annotation.fontColor,
      backgroundColor: annotation.backgroundColor,
      fontWeight: annotation.fontWeight,
      fontStyle: annotation.fontStyle,
      textDecoration: annotation.textDecoration,
      textAlign: annotation.textAlign,
      fontFamily: annotation.fontFamily,
      rotation: annotation.rotation,
      width: annotation.width,
      height: annotation.height,
      roundedBackground: annotation.roundedBackground,
      // Store groupId for membership tracking
      groupId: annotation.groupId,
      geoCoordinates: annotation.geoCoordinates,
      zIndex: annotation.zIndex
    }
  };
}

/**
 * Convert a FreeShapeAnnotation to a React Flow Node
 * For lines, the node is positioned at the bounding box top-left
 */
export function freeShapeToNode(annotation: FreeShapeAnnotation): Node<FreeShapeNodeData> {
  const isLine = annotation.shapeType === "line";
  const startPosition = normalizePosition(annotation.position);
  const resolvedZIndex =
    typeof annotation.zIndex === "number" ? annotation.zIndex : DEFAULT_SHAPE_Z_INDEX;

  if (isLine) {
    const { nodePosition, width, height, relativeEndPosition, lineStartInNode } =
      computeLineBounds(annotation, startPosition);

    return {
      id: annotation.id,
      type: FREE_SHAPE_NODE_TYPE,
      position: nodePosition,
      width,
      height,
      zIndex: resolvedZIndex,
      draggable: true,
      selectable: true,
      data: {
        shapeType: "line",
        width,
        height,
        endPosition: normalizePosition(annotation.endPosition, {
          x: startPosition.x + DEFAULT_LINE_LENGTH,
          y: startPosition.y
        }),
        relativeEndPosition,
        startPosition,
        // Line start position within the node's bounding box
        lineStartInNode,
        fillColor: annotation.fillColor,
        fillOpacity: annotation.fillOpacity,
        borderColor: annotation.borderColor,
        borderWidth: annotation.borderWidth,
        borderStyle: annotation.borderStyle,
        rotation: annotation.rotation,
        lineStartArrow: annotation.lineStartArrow,
        lineEndArrow: annotation.lineEndArrow,
        lineArrowSize: annotation.lineArrowSize,
        // Store groupId for membership tracking
        groupId: annotation.groupId,
        geoCoordinates: annotation.geoCoordinates,
        endGeoCoordinates: annotation.endGeoCoordinates,
        zIndex: resolvedZIndex
      }
    };
  }

  // Non-line shapes (rectangle, circle)
  return {
    id: annotation.id,
    type: FREE_SHAPE_NODE_TYPE,
    position: startPosition,
    width: annotation.width ?? 100,
    height: annotation.height ?? 100,
    zIndex: resolvedZIndex,
    draggable: true,
    selectable: true,
    data: {
      shapeType: annotation.shapeType,
      width: annotation.width,
      height: annotation.height,
      fillColor: annotation.fillColor,
      fillOpacity: annotation.fillOpacity,
      borderColor: annotation.borderColor,
      borderWidth: annotation.borderWidth,
      borderStyle: annotation.borderStyle,
      rotation: annotation.rotation,
      cornerRadius: annotation.cornerRadius,
      // Store groupId for membership tracking
      groupId: annotation.groupId,
      geoCoordinates: annotation.geoCoordinates,
      zIndex: resolvedZIndex
    }
  };
}

/**
 * Convert a GroupStyleAnnotation to a React Flow Node
 * Groups are rendered with zIndex: -1 so they appear behind topology nodes
 */
export function groupToNode(group: GroupStyleAnnotation): Node<GroupNodeData> {
  const resolvedId = isNonEmptyString(group.id) ? group.id : "legacy-group";
  const identity = parseLegacyGroupIdentity(resolvedId);
  const resolvedName = isNonEmptyString(group.name) ? group.name : identity.name;
  const resolvedLevel = isNonEmptyString(group.level) ? group.level : identity.level;
  const resolvedPosition = normalizePosition(group.position);
  const resolvedWidth = toFiniteNumber(group.width) ?? DEFAULT_GROUP_WIDTH;
  const resolvedHeight = toFiniteNumber(group.height) ?? DEFAULT_GROUP_HEIGHT;
  const legacyColor = (group as Record<string, unknown>).color;
  const resolvedLabelColor =
    (isNonEmptyString(group.labelColor) ? group.labelColor : undefined) ??
    (isNonEmptyString(legacyColor) ? legacyColor : undefined);
  const resolvedParentId = resolveGroupParentId(group.parentId, group.groupId);
  const resolvedGroupId = resolveGroupParentId(group.groupId, group.parentId);
  return {
    id: resolvedId,
    type: GROUP_NODE_TYPE,
    position: resolvedPosition,
    // Width/height at top level for React Flow's NodeResizer compatibility
    width: resolvedWidth,
    height: resolvedHeight,
    // Groups render behind topology nodes
    zIndex: group.zIndex ?? -1,
    draggable: true,
    selectable: true,
    data: {
      name: resolvedName,
      label: resolvedName,
      level: resolvedLevel,
      width: resolvedWidth,
      height: resolvedHeight,
      backgroundColor: group.backgroundColor,
      backgroundOpacity: group.backgroundOpacity,
      borderColor: group.borderColor,
      borderWidth: group.borderWidth,
      borderStyle: group.borderStyle,
      borderRadius: group.borderRadius,
      labelColor: resolvedLabelColor,
      labelPosition: group.labelPosition,
      parentId: resolvedParentId,
      groupId: resolvedGroupId,
      zIndex: group.zIndex,
      geoCoordinates: group.geoCoordinates
    }
  };
}

// ============================================================================
// Node → Annotation Conversion
// ============================================================================

/**
 * Convert a React Flow Node back to FreeTextAnnotation
 */
export function nodeToFreeText(node: Node<FreeTextNodeData>): FreeTextAnnotation {
  const data = node.data;
  return {
    id: node.id,
    text: data.text,
    position: node.position,
    fontSize: data.fontSize,
    fontColor: data.fontColor,
    backgroundColor: data.backgroundColor,
    fontWeight: data.fontWeight,
    fontStyle: data.fontStyle,
    textDecoration: data.textDecoration,
    textAlign: data.textAlign,
    fontFamily: data.fontFamily,
    rotation: data.rotation,
    width: node.width ?? data.width,
    height: node.height ?? data.height,
    roundedBackground: data.roundedBackground,
    groupId: data.groupId as string | undefined,
    geoCoordinates: data.geoCoordinates as { lat: number; lng: number } | undefined,
    zIndex: data.zIndex as number | undefined
  };
}

/**
 * Convert a React Flow Node back to FreeShapeAnnotation
 */
export function nodeToFreeShape(node: Node<FreeShapeNodeData>): FreeShapeAnnotation {
  const data = node.data;
  const zIndex = typeof data.zIndex === "number" ? data.zIndex : node.zIndex;
  const isLine = data.shapeType === "line";

  if (isLine) {
    // For lines, startPosition in data is the actual annotation position
    return {
      id: node.id,
      shapeType: "line",
      position: data.startPosition ?? node.position,
      endPosition: data.endPosition,
      fillColor: data.fillColor,
      fillOpacity: data.fillOpacity,
      borderColor: data.borderColor,
      borderWidth: data.borderWidth,
      borderStyle: data.borderStyle,
      rotation: data.rotation,
      lineStartArrow: data.lineStartArrow,
      lineEndArrow: data.lineEndArrow,
      lineArrowSize: data.lineArrowSize,
      groupId: data.groupId as string | undefined,
      geoCoordinates: data.geoCoordinates as { lat: number; lng: number } | undefined,
      endGeoCoordinates: data.endGeoCoordinates as { lat: number; lng: number } | undefined,
      zIndex
    };
  }

  // Non-line shapes
  return {
    id: node.id,
    shapeType: data.shapeType,
    position: node.position,
    width: node.width ?? data.width,
    height: node.height ?? data.height,
    fillColor: data.fillColor,
    fillOpacity: data.fillOpacity,
    borderColor: data.borderColor,
    borderWidth: data.borderWidth,
    borderStyle: data.borderStyle,
    rotation: data.rotation,
    cornerRadius: data.cornerRadius,
    groupId: data.groupId as string | undefined,
    geoCoordinates: data.geoCoordinates as { lat: number; lng: number } | undefined,
    zIndex
  };
}

/**
 * Convert a React Flow Node back to GroupStyleAnnotation
 */
export function nodeToGroup(node: Node<GroupNodeData>): GroupStyleAnnotation {
  const data = node.data;
  const rawParentId = typeof data.parentId === "string" ? data.parentId : undefined;
  const rawGroupId = typeof data.groupId === "string" ? data.groupId : undefined;
  const parentId = rawParentId ?? rawGroupId;
  const groupId = rawGroupId ?? rawParentId;
  const zIndex = typeof data.zIndex === "number" ? data.zIndex : node.zIndex;
  return {
    id: node.id,
    name: data.name,
    level: data.level ?? "",
    position: node.position,
    width: node.width ?? data.width ?? 200,
    height: node.height ?? data.height ?? 150,
    backgroundColor: data.backgroundColor,
    backgroundOpacity: data.backgroundOpacity,
    borderColor: data.borderColor,
    borderWidth: data.borderWidth,
    borderStyle: data.borderStyle,
    borderRadius: data.borderRadius,
    labelColor: data.labelColor,
    labelPosition: data.labelPosition,
    parentId,
    groupId,
    zIndex,
    geoCoordinates: data.geoCoordinates as { lat: number; lng: number } | undefined
  };
}

// ============================================================================
// Batch Conversion Utilities
// ============================================================================

/**
 * Convert all annotations to React Flow nodes
 */
export function annotationsToNodes(
  freeTextAnnotations: FreeTextAnnotation[],
  freeShapeAnnotations: FreeShapeAnnotation[],
  groups: GroupStyleAnnotation[]
): Node[] {
  const nodes: Node[] = [];

  // Add group nodes first (they render behind due to zIndex: -1)
  for (const group of groups) {
    nodes.push(groupToNode(group));
  }

  // Add free text nodes
  for (const annotation of freeTextAnnotations) {
    nodes.push(freeTextToNode(annotation));
  }

  // Add free shape nodes
  for (const annotation of freeShapeAnnotations) {
    nodes.push(freeShapeToNode(annotation));
  }

  return nodes;
}

/**
 * Extract annotation data from a mixed array of nodes
 */
export function nodesToAnnotations(nodes: Node[]): {
  freeTextAnnotations: FreeTextAnnotation[];
  freeShapeAnnotations: FreeShapeAnnotation[];
  groups: GroupStyleAnnotation[];
} {
  const freeTextAnnotations: FreeTextAnnotation[] = [];
  const freeShapeAnnotations: FreeShapeAnnotation[] = [];
  const groups: GroupStyleAnnotation[] = [];

  for (const node of nodes) {
    switch (node.type) {
      case FREE_TEXT_NODE_TYPE:
        freeTextAnnotations.push(nodeToFreeText(node as Node<FreeTextNodeData>));
        break;
      case FREE_SHAPE_NODE_TYPE:
        freeShapeAnnotations.push(nodeToFreeShape(node as Node<FreeShapeNodeData>));
        break;
      case GROUP_NODE_TYPE:
        groups.push(nodeToGroup(node as Node<GroupNodeData>));
        break;
    }
  }

  return { freeTextAnnotations, freeShapeAnnotations, groups };
}
