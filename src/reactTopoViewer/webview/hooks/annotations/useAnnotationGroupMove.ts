/**
 * Hook for moving selected annotations together with selected Cytoscape nodes
 * When dragging nodes, any selected annotations move by the same delta
 */
import React, { useEffect, useRef, useCallback } from 'react';
import type { Core as CyCore, EventObject, NodeSingular } from 'cytoscape';
import { FreeTextAnnotation } from '../../../shared/types/topology';
import { log } from '../../utils/logger';

interface UseAnnotationGroupMoveOptions {
  cy: CyCore | null;
  annotations: FreeTextAnnotation[];
  selectedAnnotationIds: Set<string>;
  /** Update annotation position (called during drag for visual feedback) */
  onPositionChange: (id: string, position: { x: number; y: number }) => void;
  /** Whether the view is locked */
  isLocked: boolean;
}

/** Starting position for an annotation before drag */
interface AnnotationStartPosition {
  id: string;
  x: number;
  y: number;
}

/** Refs used for tracking drag state */
interface DragTrackingRefs {
  startPositions: React.RefObject<AnnotationStartPosition[]>;
  nodeStartPos: React.RefObject<{ x: number; y: number } | null>;
}

/** Create grab handler that records starting positions */
function createGrabHandler(
  refs: DragTrackingRefs,
  getSelectedAnnotations: () => FreeTextAnnotation[],
  isLocked: boolean
) {
  return (event: EventObject) => {
    if (isLocked) return;

    const node = event.target as NodeSingular;
    const selectedAnnotations = getSelectedAnnotations();

    if (selectedAnnotations.length === 0) {
      refs.startPositions.current = [];
      refs.nodeStartPos.current = null;
      return;
    }

    const nodePos = node.position();
    refs.nodeStartPos.current = { x: nodePos.x, y: nodePos.y };
    refs.startPositions.current = selectedAnnotations.map(a => ({
      id: a.id,
      x: a.position.x,
      y: a.position.y
    }));

    log.info(`[AnnotationGroupMove] Drag started, tracking ${selectedAnnotations.length} annotations`);
  };
}

/** Create drag handler that moves annotations by delta */
function createDragHandler(
  refs: DragTrackingRefs,
  onPositionChange: (id: string, position: { x: number; y: number }) => void,
  isLocked: boolean
) {
  return (event: EventObject) => {
    if (isLocked) return;
    if (refs.startPositions.current.length === 0 || !refs.nodeStartPos.current) return;

    const node = event.target as NodeSingular;
    const currentNodePos = node.position();
    const deltaX = currentNodePos.x - refs.nodeStartPos.current.x;
    const deltaY = currentNodePos.y - refs.nodeStartPos.current.y;

    for (const startPos of refs.startPositions.current) {
      onPositionChange(startPos.id, { x: startPos.x + deltaX, y: startPos.y + deltaY });
    }
  };
}

/** Create dragfree handler that clears tracking */
function createDragFreeHandler(refs: DragTrackingRefs) {
  return () => {
    if (refs.startPositions.current.length > 0) {
      log.info(`[AnnotationGroupMove] Drag ended, moved ${refs.startPositions.current.length} annotations`);
    }
    refs.startPositions.current = [];
    refs.nodeStartPos.current = null;
  };
}

/**
 * Hook that synchronizes annotation movement with Cytoscape node dragging
 */
export function useAnnotationGroupMove(options: UseAnnotationGroupMoveOptions): void {
  const { cy, annotations, selectedAnnotationIds, onPositionChange, isLocked } = options;

  const startPositionsRef = useRef<AnnotationStartPosition[]>([]);
  const nodeStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const refs: DragTrackingRefs = { startPositions: startPositionsRef, nodeStartPos: nodeStartPosRef };

  const getSelectedAnnotations = useCallback(() => {
    return annotations.filter(a => selectedAnnotationIds.has(a.id));
  }, [annotations, selectedAnnotationIds]);

  const handleGrab = useCallback(
    (event: EventObject) => createGrabHandler(refs, getSelectedAnnotations, isLocked)(event),
    [isLocked, getSelectedAnnotations]
  );

  const handleDrag = useCallback(
    (event: EventObject) => createDragHandler(refs, onPositionChange, isLocked)(event),
    [isLocked, onPositionChange]
  );

  const handleDragFree = useCallback(() => createDragFreeHandler(refs)(), []);

  useEffect(() => {
    if (!cy) return;
    cy.on('grab', 'node', handleGrab);
    cy.on('drag', 'node', handleDrag);
    cy.on('dragfree', 'node', handleDragFree);
    return () => {
      cy.off('grab', 'node', handleGrab);
      cy.off('drag', 'node', handleDrag);
      cy.off('dragfree', 'node', handleDragFree);
    };
  }, [cy, handleGrab, handleDrag, handleDragFree]);
}
