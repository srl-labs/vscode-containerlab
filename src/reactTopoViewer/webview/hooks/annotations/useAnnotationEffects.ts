/**
 * Combined hook for annotation effects (background clear, group move)
 */
import type React from "react";
import { useCallback, useEffect, useRef } from "react";

import { log } from "../../utils/logger";

import type { FreeTextAnnotation } from "./freeText";

/** Node drag event data passed from ReactFlow */
interface NodeDragEvent {
  position: { x: number; y: number };
}

// ============================================================================
// Annotation Group Move (internal)
// ============================================================================

interface UseAnnotationGroupMoveOptions {
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
  return (event: NodeDragEvent) => {
    if (isLocked) return;

    const selectedAnnotations = getSelectedAnnotations();

    if (selectedAnnotations.length === 0) {
      refs.startPositions.current = [];
      refs.nodeStartPos.current = null;
      return;
    }

    refs.nodeStartPos.current = { x: event.position.x, y: event.position.y };
    refs.startPositions.current = selectedAnnotations.map((a) => ({
      id: a.id,
      x: a.position.x,
      y: a.position.y
    }));

    log.info(
      `[AnnotationGroupMove] Drag started, tracking ${selectedAnnotations.length} annotations`
    );
  };
}

/** Create drag handler that moves annotations by delta */
function createDragHandler(
  refs: DragTrackingRefs,
  onPositionChange: (id: string, position: { x: number; y: number }) => void,
  isLocked: boolean
) {
  return (event: NodeDragEvent) => {
    if (isLocked) return;
    if (refs.startPositions.current.length === 0 || !refs.nodeStartPos.current) return;

    const deltaX = event.position.x - refs.nodeStartPos.current.x;
    const deltaY = event.position.y - refs.nodeStartPos.current.y;

    for (const startPos of refs.startPositions.current) {
      onPositionChange(startPos.id, { x: startPos.x + deltaX, y: startPos.y + deltaY });
    }
  };
}

/** Create dragfree handler that clears tracking */
function createDragFreeHandler(refs: DragTrackingRefs) {
  return () => {
    if (refs.startPositions.current.length > 0) {
      log.info(
        `[AnnotationGroupMove] Drag ended, moved ${refs.startPositions.current.length} annotations`
      );
    }
    refs.startPositions.current = [];
    refs.nodeStartPos.current = null;
  };
}

/**
 * Hook that synchronizes annotation movement with node dragging.
 * Note: In ReactFlow, this is handled via onNodeDrag callbacks.
 * This hook sets up the infrastructure for future integration.
 */
function useAnnotationGroupMove(options: UseAnnotationGroupMoveOptions): void {
  const { annotations, selectedAnnotationIds, onPositionChange, isLocked } = options;

  const startPositionsRef = useRef<AnnotationStartPosition[]>([]);
  const nodeStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const refs: DragTrackingRefs = {
    startPositions: startPositionsRef,
    nodeStartPos: nodeStartPosRef
  };

  const getSelectedAnnotations = useCallback(() => {
    return annotations.filter((a) => selectedAnnotationIds.has(a.id));
  }, [annotations, selectedAnnotationIds]);

  const handleGrab = useCallback(
    (event: NodeDragEvent) => createGrabHandler(refs, getSelectedAnnotations, isLocked)(event),
    [isLocked, getSelectedAnnotations]
  );

  const handleDrag = useCallback(
    (event: NodeDragEvent) => createDragHandler(refs, onPositionChange, isLocked)(event),
    [isLocked, onPositionChange]
  );

  const handleDragFree = useCallback(() => createDragFreeHandler(refs)(), []);

  useEffect(() => {
    // Node drag events are handled via ReactFlow's onNodeDrag callbacks
    // These handlers can be integrated when needed
    void handleGrab;
    void handleDrag;
    void handleDragFree;
  }, [handleGrab, handleDrag, handleDragFree]);
}

// ============================================================================
// Annotation Background Clear (internal)
// ============================================================================

interface UseAnnotationBackgroundClearOptions {
  selectedAnnotationIds: Set<string>;
  onClearSelection: () => void;
}

/**
 * Internal hook that clears annotation selection when clicking on the canvas background.
 * In ReactFlow, this is handled via onPaneClick callback.
 */
function useAnnotationBackgroundClear(options: UseAnnotationBackgroundClearOptions): void {
  const { selectedAnnotationIds, onClearSelection } = options;

  const handleBackgroundTap = useCallback(() => {
    // Only clear if there are selected annotations
    if (selectedAnnotationIds.size > 0) {
      log.info("[AnnotationBackgroundClear] Clearing annotation selection on background tap");
      onClearSelection();
    }
  }, [selectedAnnotationIds, onClearSelection]);

  useEffect(() => {
    // Background tap is handled via ReactFlow's onPaneClick callback
    void handleBackgroundTap;
  }, [handleBackgroundTap]);
}

interface AnnotationEffectsOptions {
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
    annotations: freeTextAnnotations,
    selectedAnnotationIds: freeTextSelectedIds,
    onPositionChange: onFreeTextPositionChange,
    isLocked
  });

  // Clear free text annotation selection when clicking on canvas background
  useAnnotationBackgroundClear({
    selectedAnnotationIds: freeTextSelectedIds,
    onClearSelection: onFreeTextClearSelection
  });

  // Clear free shape selection when clicking on canvas background
  useAnnotationBackgroundClear({
    selectedAnnotationIds: freeShapeSelectedIds,
    onClearSelection: onFreeShapeClearSelection
  });

  // Clear group selection when clicking on canvas background
  useAnnotationBackgroundClear({
    selectedAnnotationIds: groupSelectedIds ?? new Set(),
    onClearSelection: onGroupClearSelection ?? (() => {})
  });
}
