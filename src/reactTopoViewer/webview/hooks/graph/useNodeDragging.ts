/**
 * Node Dragging Hook
 * Manages node drag-and-drop functionality based on lock state
 */
import { useEffect, useCallback, useRef } from "react";
import type { Core, NodeSingular, EventObject } from "cytoscape";

import { log } from "../../utils/logger";
import type { NodePositionEntry } from "../state/useUndoRedo";
import { getTopologyIO } from "../../services";

/**
 * Options for the node dragging hook
 */
export interface NodeDraggingOptions {
  isLocked: boolean;
  mode: "edit" | "view";
  onPositionChange?: () => void;
  onLockedDrag?: () => void;
  /** Callback to record move for undo/redo - receives node IDs and before positions */
  onMoveComplete?: (nodeIds: string[], beforePositions: NodePositionEntry[]) => void;
  /** Callback to sync committed positions into React state */
  onPositionsCommitted?: (positions: NodePositionEntry[]) => void;
}

/**
 * Save node positions via TopologyIO service
 */
async function savePositions(positions: NodePositionEntry[]): Promise<void> {
  const topologyIO = getTopologyIO();
  if (!topologyIO) {
    log.warn("[NodeDragging] TopologyIO not initialized");
    return;
  }

  try {
    await topologyIO.savePositions(positions);
    log.info(`[NodeDragging] Saved ${positions.length} node positions`);
  } catch (error) {
    log.error(`[NodeDragging] Failed to save positions: ${error}`);
  }
}

/**
 * Extract position data from a node, including geo coordinates if available
 */
function getNodePosition(node: NodeSingular): NodePositionEntry {
  const pos = node.position();
  const entry: NodePositionEntry = {
    id: node.id(),
    position: {
      x: Math.round(pos.x),
      y: Math.round(pos.y)
    }
  };

  // Include geo coordinates if the node has them (set by GeoMap mode)
  const lat = node.data("lat") as string | undefined;
  const lng = node.data("lng") as string | undefined;
  if (lat !== undefined && lng !== undefined) {
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    if (!Number.isNaN(latNum) && !Number.isNaN(lngNum)) {
      entry.geoCoordinates = { lat: latNum, lng: lngNum };
    }
  }

  return entry;
}

/**
 * Lock all nodes (disable dragging)
 */
function lockNodes(cy: Core): void {
  cy.nodes().lock();
  log.info("[NodeDragging] Nodes locked");
}

/**
 * Unlock all nodes (enable dragging)
 */
function unlockNodes(cy: Core): void {
  cy.nodes().unlock();
  log.info("[NodeDragging] Nodes unlocked");
}

/**
 * Check if a node is a regular draggable node (not an annotation)
 */
function isDraggableNode(node: NodeSingular): boolean {
  const role = node.data("topoViewerRole") as string | undefined;
  return role !== "freeText" && role !== "freeShape";
}

/** Hook to apply lock state to nodes */
function useLockState(cy: Core | null, isLocked: boolean): void {
  useEffect(() => {
    if (!cy) return;

    // Don't lock nodes until initial layout is done
    // Otherwise COSE layout can't move nodes
    const layoutDone = cy.scratch("initialLayoutDone") as boolean | undefined;
    if (!layoutDone) {
      // Wait for layout to complete before applying lock state
      const checkLayout = () => {
        const done = cy.scratch("initialLayoutDone") as boolean | undefined;
        if (done) {
          if (isLocked) {
            lockNodes(cy);
          } else {
            unlockNodes(cy);
          }
        } else {
          // Check again after a short delay
          setTimeout(checkLayout, 100);
        }
      };
      checkLayout();
      return;
    }

    if (isLocked) {
      lockNodes(cy);
    } else {
      unlockNodes(cy);
    }
  }, [cy, isLocked]);
}

/** Batching timeout for grouping multi-node drag completions */
const DRAG_BATCH_TIMEOUT_MS = 50;

/** Pending drag completion entry */
interface PendingDrag {
  nodeId: string;
  before: NodePositionEntry;
  after: NodePositionEntry;
}

/** Refs used for drag batching */
interface DragBatchRefs {
  dragStartPositions: { current: Map<string, NodePositionEntry> };
  pendingDrags: { current: PendingDrag[] };
  batchTimer: { current: ReturnType<typeof setTimeout> | null };
}

/**
 * Re-read geo coordinates from a Cytoscape node and build the position entry.
 * In GeoMap mode (geoMapActive=true), only returns geo coordinates - position is omitted
 * so that the preset position in annotations is not overwritten.
 */
function refreshGeoCoordinates(cy: Core | null, position: NodePositionEntry): NodePositionEntry {
  if (!cy) return position;
  const node = cy.getElementById(position.id);
  if (!node || node.empty() || !node.isNode()) return position;

  // Check if GeoMap is active
  const isGeoMapActive = cy.scratch("geoMapActive") === true;

  // Re-read lat/lng from node data (may have been updated by useGeoMap after drag)
  const lat = node.data("lat") as string | undefined;
  const lng = node.data("lng") as string | undefined;
  if (lat !== undefined && lng !== undefined) {
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    if (!Number.isNaN(latNum) && !Number.isNaN(lngNum)) {
      if (isGeoMapActive) {
        // In GeoMap mode, only update geo coordinates - don't touch position
        return { id: position.id, geoCoordinates: { lat: latNum, lng: lngNum } };
      }
      return { ...position, geoCoordinates: { lat: latNum, lng: lngNum } };
    }
  }
  return position;
}

/** Create flush handler for batched drags */
function createFlushHandler(
  refs: DragBatchRefs,
  _mode: "edit" | "view",
  onMoveComplete?: (nodeIds: string[], beforePositions: NodePositionEntry[]) => void,
  onPositionsCommitted?: (positions: NodePositionEntry[]) => void,
  cy?: Core | null
): () => void {
  return () => {
    const pending = refs.pendingDrags.current;
    if (pending.length === 0) return;

    const nodeIds = pending.map((p) => p.nodeId);
    const beforePositions = pending.map((p) => p.before);
    // Re-read geo coordinates at flush time to capture updates from useGeoMap
    const afterPositions = pending.map((p) => refreshGeoCoordinates(cy ?? null, p.after));

    log.info(`[NodeDragging] Flushing batch of ${pending.length} node drag(s)`);

    // Save positions - lock state already prevents dragging, so if we get here, save is allowed
    // This enables position saving in viewer mode when explicitly unlocked
    void savePositions(afterPositions);

    onPositionsCommitted?.(afterPositions);

    if (onMoveComplete) {
      onMoveComplete(nodeIds, beforePositions);
    }

    refs.pendingDrags.current = [];
    refs.batchTimer.current = null;
  };
}

/** Create drag start handler */
function createDragStartHandler(dragStartPositions: {
  current: Map<string, NodePositionEntry>;
}): (event: EventObject) => void {
  return (event: EventObject) => {
    const node = event.target as NodeSingular;

    if (!isDraggableNode(node)) return;

    const position = getNodePosition(node);
    dragStartPositions.current.set(node.id(), position);
    log.info(
      `[NodeDragging] Drag started for node ${node.id()} at (${position.position?.x ?? 0}, ${position.position?.y ?? 0})`
    );
  };
}

/** Create drag free handler */
function createDragFreeHandler(
  refs: DragBatchRefs,
  flushPendingDrags: () => void,
  onPositionChange?: () => void
): (event: EventObject) => void {
  return (event: EventObject) => {
    const node = event.target as NodeSingular;

    if (!isDraggableNode(node)) return;

    const nodeId = node.id();
    const beforePosition = refs.dragStartPositions.current.get(nodeId);
    const afterPosition = getNodePosition(node);

    log.info(
      `[NodeDragging] Node ${nodeId} dragged to (${afterPosition.position?.x ?? 0}, ${afterPosition.position?.y ?? 0})`
    );

    if (beforePosition && beforePosition.position && afterPosition.position) {
      const positionChanged =
        beforePosition.position.x !== afterPosition.position.x ||
        beforePosition.position.y !== afterPosition.position.y;

      if (positionChanged) {
        refs.pendingDrags.current.push({ nodeId, before: beforePosition, after: afterPosition });

        if (refs.batchTimer.current) {
          clearTimeout(refs.batchTimer.current);
        }
        refs.batchTimer.current = setTimeout(flushPendingDrags, DRAG_BATCH_TIMEOUT_MS);
      }
    }

    refs.dragStartPositions.current.delete(nodeId);
    onPositionChange?.();
  };
}

/** Hook for drag start/completion event handling with undo/redo support */
function useDragHandlers(
  cy: Core | null,
  mode: "edit" | "view",
  onPositionChange?: () => void,
  onMoveComplete?: (nodeIds: string[], beforePositions: NodePositionEntry[]) => void,
  onPositionsCommitted?: (positions: NodePositionEntry[]) => void
): void {
  const dragStartPositionsRef = useRef<Map<string, NodePositionEntry>>(new Map());
  const pendingDragCompletionsRef = useRef<PendingDrag[]>([]);
  const batchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refs: DragBatchRefs = {
    dragStartPositions: dragStartPositionsRef,
    pendingDrags: pendingDragCompletionsRef,
    batchTimer: batchTimerRef
  };

  const flushPendingDrags = useCallback(
    () => createFlushHandler(refs, mode, onMoveComplete, onPositionsCommitted, cy)(),
    [cy, mode, onMoveComplete, onPositionsCommitted]
  );

  const handleDragStart = useCallback(createDragStartHandler(dragStartPositionsRef), []);

  const handleDragFree = useCallback(
    (event: EventObject) => createDragFreeHandler(refs, flushPendingDrags, onPositionChange)(event),
    [flushPendingDrags, onPositionChange]
  );

  useEffect(() => {
    return () => {
      if (batchTimerRef.current) clearTimeout(batchTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!cy) return;
    cy.on("grab", "node", handleDragStart);
    cy.on("dragfree", "node", handleDragFree);
    return () => {
      cy.off("grab", "node", handleDragStart);
      cy.off("dragfree", "node", handleDragFree);
    };
  }, [cy, handleDragStart, handleDragFree]);
}

/** Hook for detecting locked node grab attempts */
function useLockedGrabHandler(cy: Core | null, isLocked: boolean, onLockedDrag?: () => void): void {
  const handleLockedGrab = useCallback(() => {
    onLockedDrag?.();
  }, [onLockedDrag]);

  useEffect(() => {
    if (!cy || !isLocked) return;
    cy.on("tapstart", "node", handleLockedGrab);
    return () => {
      cy.off("tapstart", "node", handleLockedGrab);
    };
  }, [cy, isLocked, handleLockedGrab]);
}

/**
 * Hook to manage node dragging based on lock state
 */
export function useNodeDragging(cy: Core | null, options: NodeDraggingOptions): void {
  const { isLocked, mode, onPositionChange, onLockedDrag, onMoveComplete, onPositionsCommitted } =
    options;

  useLockState(cy, isLocked);
  useDragHandlers(cy, mode, onPositionChange, onMoveComplete, onPositionsCommitted);
  useLockedGrabHandler(cy, isLocked, onLockedDrag);
}
