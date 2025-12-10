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
 * Check if a node is a regular draggable node (not a group or annotation)
 */
function isDraggableNode(node: NodeSingular): boolean {
  const role = node.data('topoViewerRole');
  return role !== 'group' && role !== 'freeText' && role !== 'freeShape';
}

/** Hook to apply lock state to nodes */
function useLockState(cy: Core | null, isLocked: boolean): void {
  useEffect(() => {
    if (!cy) return;
    if (isLocked) { lockNodes(cy); } else { unlockNodes(cy); }
  }, [cy, isLocked]);
}

/** Hook for drag start/completion event handling with undo/redo support */
function useDragHandlers(
  cy: Core | null,
  mode: 'edit' | 'view',
  onPositionChange?: () => void,
  onMoveComplete?: (nodeIds: string[], beforePositions: NodePositionEntry[]) => void
): void {
  // Store positions at drag start for undo/redo
  const dragStartPositionsRef = useRef<Map<string, NodePositionEntry>>(new Map());

  const handleDragStart = useCallback((event: EventObject) => {
    const node = event.target as NodeSingular;
    if (!isDraggableNode(node)) return;

    // Capture position at drag start
    const position = getNodePosition(node);
    dragStartPositionsRef.current.set(node.id(), position);
    log.info(`[NodeDragging] Drag started for node ${node.id()} at (${position.position.x}, ${position.position.y})`);
  }, []);

  const handleDragFree = useCallback((event: EventObject) => {
    const node = event.target as NodeSingular;
    if (!isDraggableNode(node)) return;

    const nodeId = node.id();
    const beforePosition = dragStartPositionsRef.current.get(nodeId);
    const afterPosition = getNodePosition(node);

    log.info(`[NodeDragging] Node ${nodeId} dragged to (${afterPosition.position.x}, ${afterPosition.position.y})`);

    // Send position to extension for persistence
    if (mode === 'edit') {
      sendPositionsToExtension([afterPosition]);
    }

    // Notify undo/redo system if position actually changed
    if (beforePosition && onMoveComplete) {
      const positionChanged =
        beforePosition.position.x !== afterPosition.position.x ||
        beforePosition.position.y !== afterPosition.position.y;

      if (positionChanged) {
        onMoveComplete([nodeId], [beforePosition]);
      }
    }

    // Clear the stored position
    dragStartPositionsRef.current.delete(nodeId);

    onPositionChange?.();
  }, [mode, onPositionChange, onMoveComplete]);

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
