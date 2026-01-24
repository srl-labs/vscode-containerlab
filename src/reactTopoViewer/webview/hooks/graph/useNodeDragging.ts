/**
 * Node Dragging Hook
 * Manages node drag-and-drop functionality based on lock state
 *
 * NOTE: This hook is DISABLED during ReactFlow migration.
 * The event handling was Cytoscape-specific.
 * For ReactFlow integration, use onNodeDragStart/onNodeDragStop callbacks directly.
 */
import { useCallback } from "react";

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
 * Exported for use by ReactFlow event handlers
 */
export async function saveNodePositions(positions: NodePositionEntry[]): Promise<void> {
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
 * Check if a node role allows dragging
 * Exported for use by ReactFlow event handlers
 */
export function isNodeDraggable(role: string | undefined): boolean {
  return role !== "freeText" && role !== "freeShape";
}

/**
 * Hook to manage node dragging based on lock state
 *
 * NOTE: This hook is DISABLED during ReactFlow migration.
 * Event handling was Cytoscape-specific.
 * For ReactFlow integration, use onNodeDragStart/onNodeDragStop handlers directly.
 *
 * The following callbacks are available for use from ReactFlow handlers:
 * - saveNodePositions(positions) - Save positions to YAML
 * - isNodeDraggable(role) - Check if node can be dragged
 */
export function useNodeDragging(options: NodeDraggingOptions): void {
  const { onPositionChange, onLockedDrag, onMoveComplete, onPositionsCommitted } = options;

  // These callbacks can be used by ReactFlow event handlers
  const handlePositionChange = useCallback(() => {
    onPositionChange?.();
  }, [onPositionChange]);

  const handleLockedDrag = useCallback(() => {
    onLockedDrag?.();
  }, [onLockedDrag]);

  const handleMoveComplete = useCallback(
    (nodeIds: string[], beforePositions: NodePositionEntry[]) => {
      onMoveComplete?.(nodeIds, beforePositions);
    },
    [onMoveComplete]
  );

  const handlePositionsCommitted = useCallback(
    (positions: NodePositionEntry[]) => {
      onPositionsCommitted?.(positions);
    },
    [onPositionsCommitted]
  );

  // Suppress unused variable warnings - these are exposed for external use
  void handlePositionChange;
  void handleLockedDrag;
  void handleMoveComplete;
  void handlePositionsCommitted;

  // NOTE: All event handling is disabled during ReactFlow migration
  // ReactFlow handles drag events through its own onNodeDragStart/onNodeDragStop props
}
