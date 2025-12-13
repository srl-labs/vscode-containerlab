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

/**
 * Convert a FreeShapeAnnotation to a React Flow Node
 */
function freeShapeToNode(annotation: FreeShapeAnnotation): Node<FreeShapeNodeData> {
  return {
    id: annotation.id,
    type: 'free-shape-node',
    position: annotation.position,
    draggable: true,
    selectable: true,
    data: {
      shapeType: annotation.shapeType,
      width: annotation.width,
      height: annotation.height,
      endPosition: annotation.endPosition,
      fillColor: annotation.fillColor,
      fillOpacity: annotation.fillOpacity,
      borderColor: annotation.borderColor,
      borderWidth: annotation.borderWidth,
      borderStyle: annotation.borderStyle,
      rotation: annotation.rotation,
      lineStartArrow: annotation.lineStartArrow,
      lineEndArrow: annotation.lineEndArrow,
      lineArrowSize: annotation.lineArrowSize,
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
