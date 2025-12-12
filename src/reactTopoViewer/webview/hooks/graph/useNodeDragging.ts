/**
 * Node Dragging Hook
 * Manages node drag-and-drop functionality based on lock state
 */
import { useEffect, useCallback, useRef } from 'react';
import { Core, NodeSingular, EventObject } from 'cytoscape';
import { log } from '../../utils/logger';
import type { NodePositionEntry } from '../state/useUndoRedo';

/**
 * VS Code API interface for posting messages
 */
declare const vscode: {
  postMessage: (msg: unknown) => void;
};


/**
 * Options for the node dragging hook
 */
export interface NodeDraggingOptions {
  isLocked: boolean;
  mode: 'edit' | 'view';
  onPositionChange?: () => void;
  onLockedDrag?: () => void;
  /** Callback to record move for undo/redo - receives node IDs and before positions */
  onMoveComplete?: (nodeIds: string[], beforePositions: NodePositionEntry[]) => void;
}

/**
 * Send node positions to the extension for saving
 */
function sendPositionsToExtension(positions: NodePositionEntry[]): void {
  if (typeof vscode === 'undefined') {
    log.warn('[NodeDragging] VS Code API not available');
    return;
  }

  vscode.postMessage({
    command: 'save-node-positions',
    positions: positions
  });

  log.info(`[NodeDragging] Sent ${positions.length} node positions to extension`);
}

/**
 * Extract position data from a node
 */
function getNodePosition(node: NodeSingular): NodePositionEntry {
  const pos = node.position();
  return {
    id: node.id(),
    position: {
      x: Math.round(pos.x),
      y: Math.round(pos.y)
    }
  };
}

/**
 * Lock all nodes (disable dragging)
 */
function lockNodes(cy: Core): void {
  cy.nodes().lock();
  log.info('[NodeDragging] Nodes locked');
}

/**
 * Unlock all nodes (enable dragging)
 */
function unlockNodes(cy: Core): void {
  cy.nodes().unlock();
  log.info('[NodeDragging] Nodes unlocked');
}

/**
 * Check if a node is a regular draggable node (not an annotation)
 */
function isDraggableNode(node: NodeSingular): boolean {
  const role = node.data('topoViewerRole');
  return role !== 'freeText' && role !== 'freeShape';
}

/** Hook to apply lock state to nodes */
function useLockState(cy: Core | null, isLocked: boolean): void {
  useEffect(() => {
    if (!cy) return;
    if (isLocked) { lockNodes(cy); } else { unlockNodes(cy); }
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

/** Create flush handler for batched drags */
function createFlushHandler(
  refs: DragBatchRefs,
  mode: 'edit' | 'view',
  onMoveComplete?: (nodeIds: string[], beforePositions: NodePositionEntry[]) => void
): () => void {
  return () => {
    const pending = refs.pendingDrags.current;
    if (pending.length === 0) return;

    const nodeIds = pending.map(p => p.nodeId);
    const beforePositions = pending.map(p => p.before);
    const afterPositions = pending.map(p => p.after);

    log.info(`[NodeDragging] Flushing batch of ${pending.length} node drag(s)`);

    if (mode === 'edit') {
      sendPositionsToExtension(afterPositions);
    }

    if (onMoveComplete) {
      onMoveComplete(nodeIds, beforePositions);
    }

    refs.pendingDrags.current = [];
    refs.batchTimer.current = null;
  };
}

/** Create drag start handler */
function createDragStartHandler(
  dragStartPositions: { current: Map<string, NodePositionEntry> }
): (event: EventObject) => void {
  return (event: EventObject) => {
    const node = event.target as NodeSingular;

    if (!isDraggableNode(node)) return;

    const position = getNodePosition(node);
    dragStartPositions.current.set(node.id(), position);
    log.info(`[NodeDragging] Drag started for node ${node.id()} at (${position.position.x}, ${position.position.y})`);
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

    log.info(`[NodeDragging] Node ${nodeId} dragged to (${afterPosition.position.x}, ${afterPosition.position.y})`);

    if (beforePosition) {
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
  mode: 'edit' | 'view',
  onPositionChange?: () => void,
  onMoveComplete?: (nodeIds: string[], beforePositions: NodePositionEntry[]) => void
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
    () => createFlushHandler(refs, mode, onMoveComplete)(),
    [mode, onMoveComplete]
  );

  const handleDragStart = useCallback(
    createDragStartHandler(dragStartPositionsRef),
    []
  );

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
    cy.on('grab', 'node', handleDragStart);
    cy.on('dragfree', 'node', handleDragFree);
    log.info('[NodeDragging] Drag event handlers registered');
    return () => {
      cy.off('grab', 'node', handleDragStart);
      cy.off('dragfree', 'node', handleDragFree);
    };
  }, [cy, handleDragStart, handleDragFree]);
}

/** Hook for detecting locked node grab attempts */
function useLockedGrabHandler(cy: Core | null, isLocked: boolean, onLockedDrag?: () => void): void {
  const handleLockedGrab = useCallback(() => { onLockedDrag?.(); }, [onLockedDrag]);

  useEffect(() => {
    if (!cy || !isLocked) return;
    cy.on('tapstart', 'node', handleLockedGrab);
    return () => { cy.off('tapstart', 'node', handleLockedGrab); };
  }, [cy, isLocked, handleLockedGrab]);
}

/**
 * Hook to manage node dragging based on lock state
 */
export function useNodeDragging(cy: Core | null, options: NodeDraggingOptions): void {
  const { isLocked, mode, onPositionChange, onLockedDrag, onMoveComplete } = options;

  useLockState(cy, isLocked);
  useDragHandlers(cy, mode, onPositionChange, onMoveComplete);
  useLockedGrabHandler(cy, isLocked, onLockedDrag);
}
