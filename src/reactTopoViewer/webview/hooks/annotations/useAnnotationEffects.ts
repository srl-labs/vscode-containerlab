/**
 * Combined hook for annotation effects (background clear, group move)
 */
import type React from "react";
import { useCallback, useEffect, useRef } from "react";

import { log } from "../../utils/logger";
import type { CyCompatCore, CyCompatElement } from "../useCytoCompatInstance";

import type { FreeTextAnnotation } from "./freeText";

// Event object type for compatibility layer events
interface CompatEventObject {
  target: CyCompatCore | CyCompatElement;
}

// Node singular type for compatibility layer
interface CompatNodeSingular extends CyCompatElement {
  position(): { x: number; y: number };
}

// ============================================================================
// Annotation Group Move (internal)
// ============================================================================

interface UseAnnotationGroupMoveOptions {
  cyCompat: CyCompatCore | null;
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
  return (event: CompatEventObject) => {
    if (isLocked) return;

    const node = event.target as CompatNodeSingular;
    const selectedAnnotations = getSelectedAnnotations();

    if (selectedAnnotations.length === 0) {
      refs.startPositions.current = [];
      refs.nodeStartPos.current = null;
      return;
    }

    const nodePos = node.position();
    refs.nodeStartPos.current = { x: nodePos.x, y: nodePos.y };
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
  return (event: CompatEventObject) => {
    if (isLocked) return;
    if (refs.startPositions.current.length === 0 || !refs.nodeStartPos.current) return;

    const node = event.target as CompatNodeSingular;
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
 * Note: Node drag events (grab/drag/dragfree) are not yet implemented
 * in the CyCompatCore interface. This hook registers handlers that will
 * work when ReactFlow drag event support is added.
 */
function useAnnotationGroupMove(options: UseAnnotationGroupMoveOptions): void {
  const { cyCompat, annotations, selectedAnnotationIds, onPositionChange, isLocked } = options;

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
    (event: CompatEventObject) => createGrabHandler(refs, getSelectedAnnotations, isLocked)(event),
    [isLocked, getSelectedAnnotations]
  );

  const handleDrag = useCallback(
    (event: CompatEventObject) => createDragHandler(refs, onPositionChange, isLocked)(event),
    [isLocked, onPositionChange]
  );

  const handleDragFree = useCallback(() => createDragFreeHandler(refs)(), []);

  useEffect(() => {
    if (!cyCompat) return;
    // Note: Node-specific events with selectors (e.g., 'grab', 'node') are
    // Cytoscape-specific. The compatibility layer event handlers are registered
    // but may not fire until ReactFlow drag support is added.
    cyCompat.on("grab", "node", handleGrab as unknown as () => void);
    cyCompat.on("drag", "node", handleDrag as unknown as () => void);
    cyCompat.on("dragfree", "node", handleDragFree);
    return () => {
      cyCompat.off("grab", "node", handleGrab as unknown as () => void);
      cyCompat.off("drag", "node", handleDrag as unknown as () => void);
      cyCompat.off("dragfree", "node", handleDragFree);
    };
  }, [cyCompat, handleGrab, handleDrag, handleDragFree]);
}

// ============================================================================
// Annotation Background Clear (internal)
// ============================================================================

interface UseAnnotationBackgroundClearOptions {
  cyCompat: CyCompatCore | null;
  selectedAnnotationIds: Set<string>;
  onClearSelection: () => void;
}

/**
 * Internal hook that clears annotation selection when clicking on the canvas background.
 * Note: The tap event is Cytoscape-specific. This hook registers handlers that will
 * work when ReactFlow tap/click support is added to the compatibility layer.
 */
function useAnnotationBackgroundClear(options: UseAnnotationBackgroundClearOptions): void {
  const { cyCompat, selectedAnnotationIds, onClearSelection } = options;

  const handleBackgroundTap = useCallback(
    (event: CompatEventObject) => {
      // Only handle clicks directly on the canvas (not on nodes/edges)
      if (event.target !== cyCompat) return;

      // Only clear if there are selected annotations
      if (selectedAnnotationIds.size > 0) {
        log.info("[AnnotationBackgroundClear] Clearing annotation selection on background tap");
        onClearSelection();
      }
    },
    [cyCompat, selectedAnnotationIds, onClearSelection]
  );

  useEffect(() => {
    if (!cyCompat) return;

    cyCompat.on("tap", handleBackgroundTap as unknown as () => void);

    return () => {
      cyCompat.off("tap", handleBackgroundTap as unknown as () => void);
    };
  }, [cyCompat, handleBackgroundTap]);
}

interface AnnotationEffectsOptions {
  cyCompat: CyCompatCore | null;
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
  cyCompat,
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
    cyCompat,
    annotations: freeTextAnnotations,
    selectedAnnotationIds: freeTextSelectedIds,
    onPositionChange: onFreeTextPositionChange,
    isLocked
  });

  // Clear free text annotation selection when clicking on canvas background
  useAnnotationBackgroundClear({
    cyCompat,
    selectedAnnotationIds: freeTextSelectedIds,
    onClearSelection: onFreeTextClearSelection
  });

  // Clear free shape selection when clicking on canvas background
  useAnnotationBackgroundClear({
    cyCompat,
    selectedAnnotationIds: freeShapeSelectedIds,
    onClearSelection: onFreeShapeClearSelection
  });

  // Clear group selection when clicking on canvas background
  useAnnotationBackgroundClear({
    cyCompat,
    selectedAnnotationIds: groupSelectedIds ?? new Set(),
    onClearSelection: onGroupClearSelection ?? (() => {})
  });
}
