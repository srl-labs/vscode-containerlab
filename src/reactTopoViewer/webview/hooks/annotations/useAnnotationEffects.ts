/**
 * Combined hook for annotation effects (background clear, group move)
 */
import type React from 'react';
import { useCallback, useEffect, useRef } from 'react';
import type { Core as CyCore, EventObject, NodeSingular } from 'cytoscape';

import { log } from '../../utils/logger';

import type { FreeTextAnnotation } from './freeText';

// ============================================================================
// Annotation Group Move (internal)
// ============================================================================

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
function useAnnotationGroupMove(options: UseAnnotationGroupMoveOptions): void {
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

// ============================================================================
// Annotation Background Clear (internal)
// ============================================================================

interface UseAnnotationBackgroundClearOptions {
  cy: CyCore | null;
  selectedAnnotationIds: Set<string>;
  onClearSelection: () => void;
}

/**
 * Internal hook that clears annotation selection when clicking on the canvas background
 */
function useAnnotationBackgroundClear(options: UseAnnotationBackgroundClearOptions): void {
  const { cy, selectedAnnotationIds, onClearSelection } = options;

  const handleBackgroundTap = useCallback((event: EventObject) => {
    // Only handle clicks directly on the cytoscape canvas (not on nodes/edges)
    if (event.target !== cy) return;

    // Only clear if there are selected annotations
    if (selectedAnnotationIds.size > 0) {
      log.info('[AnnotationBackgroundClear] Clearing annotation selection on background tap');
      onClearSelection();
    }
  }, [cy, selectedAnnotationIds, onClearSelection]);

  useEffect(() => {
    if (!cy) return;

    cy.on('tap', handleBackgroundTap);

    return () => {
      cy.off('tap', handleBackgroundTap);
    };
  }, [cy, handleBackgroundTap]);
}

interface AnnotationEffectsOptions {
  cy: CyCore | null;
  isLocked: boolean;
  // Free text annotations
  freeTextAnnotations: FreeTextAnnotation[];
  freeTextSelectedIds: Set<string>;
  onFreeTextPositionChange: (id: string, position: { x: number; y: number }) => void;
  onFreeTextClearSelection: () => void;
  // Free shape annotations
  freeShapeSelectedIds: Set<string>;
  onFreeShapeClearSelection: () => void;
  // Group annotations
  groupSelectedIds?: Set<string>;
  onGroupClearSelection?: () => void;
}

/**
 * Combines annotation effects to reduce complexity in App.tsx
 */
export function useAnnotationEffects({
  cy,
  isLocked,
  freeTextAnnotations,
  freeTextSelectedIds,
  onFreeTextPositionChange,
  onFreeTextClearSelection,
  freeShapeSelectedIds,
  onFreeShapeClearSelection,
  groupSelectedIds,
  onGroupClearSelection
}: AnnotationEffectsOptions): void {
  // Enable synchronized movement of annotations with nodes during drag
  useAnnotationGroupMove({
    cy,
    annotations: freeTextAnnotations,
    selectedAnnotationIds: freeTextSelectedIds,
    onPositionChange: onFreeTextPositionChange,
    isLocked
  });

  // Clear free text annotation selection when clicking on canvas background
  useAnnotationBackgroundClear({
    cy,
    selectedAnnotationIds: freeTextSelectedIds,
    onClearSelection: onFreeTextClearSelection
  });

  // Clear free shape selection when clicking on canvas background
  useAnnotationBackgroundClear({
    cy,
    selectedAnnotationIds: freeShapeSelectedIds,
    onClearSelection: onFreeShapeClearSelection
  });

  // Clear group selection when clicking on canvas background
  useAnnotationBackgroundClear({
    cy,
    selectedAnnotationIds: groupSelectedIds ?? new Set(),
    onClearSelection: onGroupClearSelection ?? (() => {})
  });
}
