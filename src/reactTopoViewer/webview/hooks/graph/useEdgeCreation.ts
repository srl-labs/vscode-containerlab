/**
 * useEdgeCreation - Hook for edge/link creation
 *
 * NOTE: This is a stub implementation for ReactFlow migration.
 * Edge creation is now handled by ReactFlow's connection handling
 * via onConnect callbacks in ReactFlowCanvas.
 *
 * The startEdgeCreation function is kept for API compatibility
 * but edge creation should be done through ReactFlow's UI.
 */
import { useCallback, useRef } from "react";

import type { CyCompatCore } from "../useCytoCompatInstance";
import { log } from "../../utils/logger";

/** Scratch key used to track edge creation state */
export const EDGE_CREATION_SCRATCH_KEY = "__topoviewer_edge_creation_source";

interface EdgeCreationOptions {
  mode: "edit" | "view";
  isLocked: boolean;
  onEdgeCreated?: (sourceId: string, targetId: string, edgeData: EdgeData) => void;
}

interface EdgeData {
  id: string;
  source: string;
  target: string;
  sourceEndpoint: string;
  targetEndpoint: string;
}

/**
 * Hook for managing edge creation
 *
 * NOTE: This is a stub for ReactFlow migration. Edge creation is now
 * handled by ReactFlow's connection UI (drag from handle to handle).
 */
export function useEdgeCreation(
  cyCompat: CyCompatCore | null,
  options: EdgeCreationOptions
): {
  startEdgeCreation: (nodeId: string) => void;
  isCreatingEdge: boolean;
} {
  const isCreatingEdgeRef = useRef(false);
  const sourceNodeRef = useRef<string | null>(null);

  const startEdgeCreation = useCallback(
    (nodeId: string) => {
      if (!cyCompat || options.mode !== "edit" || options.isLocked) {
        log.info("[EdgeCreation] Cannot start - mode/lock check failed");
        return;
      }

      // Store the source node for edge creation
      // In ReactFlow, this would trigger a connection mode
      sourceNodeRef.current = nodeId;
      isCreatingEdgeRef.current = true;
      cyCompat.scratch(EDGE_CREATION_SCRATCH_KEY, nodeId);

      log.info(`[EdgeCreation] Starting edge creation from node: ${nodeId}`);
      log.info("[EdgeCreation] Note: Use ReactFlow connection handles to complete edge");
    },
    [cyCompat, options.mode, options.isLocked]
  );

  return {
    startEdgeCreation,
    isCreatingEdge: isCreatingEdgeRef.current
  };
}
