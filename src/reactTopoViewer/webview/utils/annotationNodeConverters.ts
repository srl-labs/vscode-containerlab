/**
 * Bidirectional conversion utilities for annotation data and React Flow nodes.
 *
 * This module provides functions to convert between:
 * - FreeTextAnnotation <-> Node<FreeTextNodeData>
 * - FreeShapeAnnotation <-> Node<FreeShapeNodeData>
 * - GroupStyleAnnotation <-> Node<GroupNodeData>
 *
 * Used for:
 * - Loading annotations from JSON into GraphContext (annotation → node)
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
} from "../components/react-flow-canvas/types";

// ============================================================================
// Constants
// ============================================================================

/** Set of annotation node types for quick lookup */
export const ANNOTATION_NODE_TYPES = new Set(["free-text-node", "free-shape-node", "group-node"]);

/** Default line length when endPosition is missing */
const DEFAULT_LINE_LENGTH = 150;

/** Padding for line bounding box to accommodate arrows and stroke */
const LINE_PADDING = 20;

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
 * Get annotation type from node type
 */
export function getAnnotationTypeFromNodeType(
  nodeType: string | undefined
): "freeText" | "freeShape" | "group" | null {
  switch (nodeType) {
    case "free-text-node":
      return "freeText";
    case "free-shape-node":
      return "freeShape";
    case "group-node":
      return "group";
    default:
      return null;
  }
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
function computeLineBounds(annotation: FreeShapeAnnotation): LineBounds {
  const startX = annotation.position.x;
  const startY = annotation.position.y;
  const endX = annotation.endPosition?.x ?? startX + DEFAULT_LINE_LENGTH;
  const endY = annotation.endPosition?.y ?? startY;

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
  return {
    id: annotation.id,
    type: "free-text-node",
    position: annotation.position,
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

  if (isLine) {
    const { nodePosition, width, height, relativeEndPosition, lineStartInNode } =
      computeLineBounds(annotation);

    return {
      id: annotation.id,
      type: "free-shape-node",
      position: nodePosition,
      width,
      height,
      draggable: true,
      selectable: true,
      data: {
        shapeType: "line",
        width,
        height,
        endPosition: annotation.endPosition,
        relativeEndPosition,
        startPosition: annotation.position,
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
        zIndex: annotation.zIndex
      }
    };
  }

  // Non-line shapes (rectangle, circle)
  return {
    id: annotation.id,
    type: "free-shape-node",
    position: annotation.position,
    width: annotation.width ?? 100,
    height: annotation.height ?? 100,
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
      zIndex: annotation.zIndex
    }
  };
}

/**
 * Convert a GroupStyleAnnotation to a React Flow Node
 * Groups are rendered with zIndex: -1 so they appear behind topology nodes
 */
export function groupToNode(group: GroupStyleAnnotation): Node<GroupNodeData> {
  return {
    id: group.id,
    type: "group-node",
    position: group.position,
    // Width/height at top level for React Flow's NodeResizer compatibility
    width: group.width ?? 200,
    height: group.height ?? 150,
    // Groups render behind topology nodes
    zIndex: group.zIndex ?? -1,
    draggable: true,
    selectable: true,
    data: {
      name: group.name,
      label: group.name,
      level: group.level,
      width: group.width,
      height: group.height,
      backgroundColor: group.backgroundColor,
      backgroundOpacity: group.backgroundOpacity,
      borderColor: group.borderColor,
      borderWidth: group.borderWidth,
      borderStyle: group.borderStyle,
      borderRadius: group.borderRadius,
      labelColor: group.labelColor,
      labelPosition: group.labelPosition,
      parentId: group.parentId,
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
      zIndex: data.zIndex as number | undefined
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
    zIndex: data.zIndex as number | undefined
  };
}

/**
 * Convert a React Flow Node back to GroupStyleAnnotation
 */
export function nodeToGroup(node: Node<GroupNodeData>): GroupStyleAnnotation {
  const data = node.data;
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
    parentId: data.parentId,
    zIndex: data.zIndex ?? node.zIndex,
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
      case "free-text-node":
        freeTextAnnotations.push(nodeToFreeText(node as Node<FreeTextNodeData>));
        break;
      case "free-shape-node":
        freeShapeAnnotations.push(nodeToFreeShape(node as Node<FreeShapeNodeData>));
        break;
      case "group-node":
        groups.push(nodeToGroup(node as Node<GroupNodeData>));
        break;
    }
  }

  return { freeTextAnnotations, freeShapeAnnotations, groups };
}

/**
 * Filter nodes to get only annotation nodes
 */
export function filterAnnotationNodes(nodes: Node[]): Node[] {
  return nodes.filter((n) => isAnnotationNodeType(n.type));
}

/**
 * Filter nodes to get only topology nodes (non-annotation)
 */
export function filterTopologyNodes(nodes: Node[]): Node[] {
  return nodes.filter((n) => !isAnnotationNodeType(n.type));
}
