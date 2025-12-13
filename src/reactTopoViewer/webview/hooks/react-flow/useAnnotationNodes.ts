/**
 * Hook to convert annotation state to React Flow nodes
 * Bridges the annotation hooks with the React Flow canvas
 */
import { useMemo, useCallback } from 'react';
import type { Node } from '@xyflow/react';
import type { FreeTextAnnotation, FreeShapeAnnotation } from '../../../shared/types/topology';
import type { FreeTextNodeData, FreeShapeNodeData } from '../../components/react-flow-canvas/types';

/**
 * Convert a FreeTextAnnotation to a React Flow Node
 */
function freeTextToNode(annotation: FreeTextAnnotation): Node<FreeTextNodeData> {
  return {
    id: annotation.id,
    type: 'free-text-node',
    position: annotation.position,
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
  const endX = annotation.endPosition?.x ?? (startX + DEFAULT_LINE_LENGTH);
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
  const isLine = annotation.shapeType === 'line';

  if (isLine) {
    const { nodePosition, width, height, relativeEndPosition } = computeLineBounds(annotation);

    // Compute line start relative to node position (top-left of bounding box)
    const lineStartInNode = {
      x: annotation.position.x - nodePosition.x,
      y: annotation.position.y - nodePosition.y
    };

    return {
      id: annotation.id,
      type: 'free-shape-node',
      position: nodePosition,
      width,
      height,
      draggable: true,
      selectable: true,
      data: {
        shapeType: 'line',
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
    type: 'free-shape-node',
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

interface UseAnnotationNodesOptions {
  freeTextAnnotations: FreeTextAnnotation[];
  freeShapeAnnotations: FreeShapeAnnotation[];
}

interface AnnotationAddModeState {
  isAddTextMode: boolean;
  isAddShapeMode: boolean;
  pendingShapeType?: 'rectangle' | 'circle' | 'line';
}

interface UseAnnotationNodesReturn {
  /** React Flow nodes for all annotations */
  annotationNodes: Node[];
  /** Check if a node ID is an annotation */
  isAnnotationNode: (nodeId: string) => boolean;
  /** Get annotation type for a node ID */
  getAnnotationType: (nodeId: string) => 'freeText' | 'freeShape' | null;
}

/**
 * Hook that converts annotations to React Flow nodes
 */
export function useAnnotationNodes(options: UseAnnotationNodesOptions): UseAnnotationNodesReturn {
  const { freeTextAnnotations, freeShapeAnnotations } = options;

  // Create a set of annotation IDs for quick lookup
  const annotationIds = useMemo(() => {
    const ids = new Map<string, 'freeText' | 'freeShape'>();
    for (const ann of freeTextAnnotations) {
      ids.set(ann.id, 'freeText');
    }
    for (const ann of freeShapeAnnotations) {
      ids.set(ann.id, 'freeShape');
    }
    return ids;
  }, [freeTextAnnotations, freeShapeAnnotations]);

  // Convert annotations to React Flow nodes
  const annotationNodes = useMemo(() => {
    const nodes: Node[] = [];

    // Add free text nodes
    for (const annotation of freeTextAnnotations) {
      nodes.push(freeTextToNode(annotation));
    }

    // Add free shape nodes
    for (const annotation of freeShapeAnnotations) {
      nodes.push(freeShapeToNode(annotation));
    }

    return nodes;
  }, [freeTextAnnotations, freeShapeAnnotations]);

  const isAnnotationNode = useCallback((nodeId: string) => {
    return annotationIds.has(nodeId);
  }, [annotationIds]);

  const getAnnotationType = useCallback((nodeId: string) => {
    return annotationIds.get(nodeId) ?? null;
  }, [annotationIds]);

  return {
    annotationNodes,
    isAnnotationNode,
    getAnnotationType
  };
}

export type { AnnotationAddModeState };
