/**
 * Hook to convert annotation state to React Flow nodes
 * Bridges the annotation hooks with the React Flow canvas
 */
import { useMemo, useCallback, useRef } from "react";
import type { Node } from "@xyflow/react";

import type {
  FreeTextAnnotation,
  FreeShapeAnnotation,
  GroupStyleAnnotation
} from "../../../shared/types/topology";
import type {
  FreeTextNodeData,
  FreeShapeNodeData,
  GroupNodeData
} from "../../components/react-flow-canvas/types";

/**
 * Convert a FreeTextAnnotation to a React Flow Node
 */
function freeTextToNode(annotation: FreeTextAnnotation): Node<FreeTextNodeData> {
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
      roundedBackground: annotation.roundedBackground
    }
  };
}

/** Default line length when endPosition is missing */
const DEFAULT_LINE_LENGTH = 150;

/** Padding for line bounding box to accommodate arrows and stroke */
const LINE_PADDING = 20;

/**
 * Compute line bounding box and positioning info
 */
function computeLineBounds(annotation: FreeShapeAnnotation): {
  nodePosition: { x: number; y: number };
  width: number;
  height: number;
  relativeEndPosition: { x: number; y: number };
} {
  const startX = annotation.position.x;
  const startY = annotation.position.y;
  const endX = annotation.endPosition?.x ?? startX + DEFAULT_LINE_LENGTH;
  const endY = annotation.endPosition?.y ?? startY;

  // Compute bounding box with padding
  const minX = Math.min(startX, endX) - LINE_PADDING;
  const minY = Math.min(startY, endY) - LINE_PADDING;
  const maxX = Math.max(startX, endX) + LINE_PADDING;
  const maxY = Math.max(startY, endY) + LINE_PADDING;

  return {
    nodePosition: { x: minX, y: minY },
    width: maxX - minX,
    height: Math.max(maxY - minY, LINE_PADDING * 2),
    relativeEndPosition: { x: endX - startX, y: endY - startY }
  };
}

/**
 * Convert a FreeShapeAnnotation to a React Flow Node
 * For lines, the node is positioned at the bounding box top-left
 */
function freeShapeToNode(annotation: FreeShapeAnnotation): Node<FreeShapeNodeData> {
  const isLine = annotation.shapeType === "line";

  if (isLine) {
    const { nodePosition, width, height, relativeEndPosition } = computeLineBounds(annotation);

    // Compute line start relative to node position (top-left of bounding box)
    const lineStartInNode = {
      x: annotation.position.x - nodePosition.x,
      y: annotation.position.y - nodePosition.y
    };

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
        lineArrowSize: annotation.lineArrowSize
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
      cornerRadius: annotation.cornerRadius
    }
  };
}

/**
 * Convert a GroupStyleAnnotation to a React Flow Node
 * Groups are rendered with zIndex: -1 so they appear behind topology nodes
 */
function groupToNode(group: GroupStyleAnnotation): Node<GroupNodeData> {
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
      zIndex: group.zIndex
    }
  };
}

interface UseAnnotationNodesOptions {
  freeTextAnnotations: FreeTextAnnotation[];
  freeShapeAnnotations: FreeShapeAnnotation[];
  groups?: GroupStyleAnnotation[];
}

interface AnnotationAddModeState {
  isAddTextMode: boolean;
  isAddShapeMode: boolean;
  pendingShapeType?: "rectangle" | "circle" | "line";
}

interface UseAnnotationNodesReturn {
  /** React Flow nodes for all annotations */
  annotationNodes: Node[];
  /** Check if a node ID is an annotation */
  isAnnotationNode: (nodeId: string) => boolean;
  /** Get annotation type for a node ID */
  getAnnotationType: (nodeId: string) => "freeText" | "freeShape" | "group" | null;
}

/**
 * Hook that converts annotations to React Flow nodes
 * Uses stable object references to prevent unnecessary re-renders
 */
export function useAnnotationNodes(options: UseAnnotationNodesOptions): UseAnnotationNodesReturn {
  const { freeTextAnnotations, freeShapeAnnotations, groups = [] } = options;

  // Create a set of annotation IDs for quick lookup
  const annotationIds = useMemo(() => {
    const ids = new Map<string, "freeText" | "freeShape" | "group">();
    for (const ann of freeTextAnnotations) {
      ids.set(ann.id, "freeText");
    }
    for (const ann of freeShapeAnnotations) {
      ids.set(ann.id, "freeShape");
    }
    for (const grp of groups) {
      ids.set(grp.id, "group");
    }
    return ids;
  }, [freeTextAnnotations, freeShapeAnnotations, groups]);

  // Cache previous nodes to maintain stable references
  const prevNodesRef = useRef<Map<string, Node>>(new Map());

  // Convert annotations to React Flow nodes with stable references
  const annotationNodes = useMemo(() => {
    const nodes: Node[] = [];
    const prevNodes = prevNodesRef.current;
    const newNodesMap = new Map<string, Node>();

    // Helper to get or create a stable node reference
    const getStableNode = (id: string, createNode: () => Node): Node => {
      const newNode = createNode();
      const prevNode = prevNodes.get(id);

      // If previous node exists and has same position/data, reuse it
      if (
        prevNode &&
        prevNode.position.x === newNode.position.x &&
        prevNode.position.y === newNode.position.y &&
        prevNode.width === newNode.width &&
        prevNode.height === newNode.height
      ) {
        // Check if data has changed (shallow compare)
        const prevData = prevNode.data as Record<string, unknown>;
        const newData = newNode.data as Record<string, unknown>;
        let dataChanged = false;
        for (const key of Object.keys(newData)) {
          if (prevData[key] !== newData[key]) {
            dataChanged = true;
            break;
          }
        }
        if (!dataChanged) {
          newNodesMap.set(id, prevNode);
          return prevNode;
        }
      }

      newNodesMap.set(id, newNode);
      return newNode;
    };

    // Add group nodes first (they render behind due to zIndex: -1)
    for (const group of groups) {
      nodes.push(getStableNode(group.id, () => groupToNode(group)));
    }

    // Add free text nodes
    for (const annotation of freeTextAnnotations) {
      nodes.push(getStableNode(annotation.id, () => freeTextToNode(annotation)));
    }

    // Add free shape nodes
    for (const annotation of freeShapeAnnotations) {
      nodes.push(getStableNode(annotation.id, () => freeShapeToNode(annotation)));
    }

    // Update cache
    prevNodesRef.current = newNodesMap;

    return nodes;
  }, [freeTextAnnotations, freeShapeAnnotations, groups]);

  const isAnnotationNode = useCallback(
    (nodeId: string) => {
      return annotationIds.has(nodeId);
    },
    [annotationIds]
  );

  const getAnnotationType = useCallback(
    (nodeId: string) => {
      return annotationIds.get(nodeId) ?? null;
    },
    [annotationIds]
  );

  return {
    annotationNodes,
    isAnnotationNode,
    getAnnotationType
  };
}

export type { AnnotationAddModeState };
