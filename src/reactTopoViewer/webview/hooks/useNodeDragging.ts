/**
 * Node Dragging Hook
 * Manages node drag-and-drop functionality based on lock state
 */
import { useEffect, useCallback } from 'react';
import { Core, NodeSingular, EventObject } from 'cytoscape';
import { log } from '../utils/logger';

/**
 * VS Code API interface for posting messages
 */
declare const vscode: {
  postMessage: (msg: unknown) => void;
};

/**
 * Node position data for saving
 */
interface NodePositionData {
  id: string;
  position: { x: number; y: number };
}

/**
 * Options for the node dragging hook
 */
export interface NodeDraggingOptions {
  isLocked: boolean;
  mode: 'edit' | 'view';
  onPositionChange?: () => void;
}

/**
 * Send node positions to the extension for saving
 */
function sendPositionsToExtension(positions: NodePositionData[]): void {
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
function getNodePosition(node: NodeSingular): NodePositionData {
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

/**
 * Hook to manage node dragging based on lock state
 */
export function useNodeDragging(cy: Core | null, options: NodeDraggingOptions): void {
  const { isLocked, mode, onPositionChange } = options;

  // Handle drag completion - save positions
  const handleDragFree = useCallback((event: EventObject) => {
    const node = event.target as NodeSingular;

    // Only save for regular nodes
    if (!isDraggableNode(node)) return;

    // Get the dragged node's new position
    const position = getNodePosition(node);
    log.info(`[NodeDragging] Node ${position.id} dragged to (${position.position.x}, ${position.position.y})`);

    // In edit mode, send position to extension for saving
    if (mode === 'edit') {
      sendPositionsToExtension([position]);
    }

    // Notify parent of position change
    onPositionChange?.();
  }, [mode, onPositionChange]);

  // Apply lock state when it changes
  useEffect(() => {
    if (!cy) return;

    if (isLocked) {
      lockNodes(cy);
    } else {
      unlockNodes(cy);
    }
  }, [cy, isLocked]);

  // Set up drag event handlers
  useEffect(() => {
    if (!cy) return;

    // Register dragfree handler for position saving
    cy.on('dragfree', 'node', handleDragFree);

    log.info('[NodeDragging] Drag event handlers registered');

    return () => {
      cy.off('dragfree', 'node', handleDragFree);
      log.info('[NodeDragging] Drag event handlers removed');
    };
  }, [cy, handleDragFree]);
}
