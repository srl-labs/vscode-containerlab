/**
 * useShiftClickEdgeCreation - Hook for starting edge creation via Shift+Click on node
 *
 * NOTE: This hook uses the CyCompatCore compatibility layer.
 * The event handling is a stub - actual events should be handled via ReactFlow's
 * onNodeClick callback. This hook provides the edge creation trigger logic
 * that can be called from that handler.
 */
import { useEffect } from "react";

import type {
  CyCompatCore,
  CyCompatEventObject,
  CyCompatNodeElement
} from "../useCytoCompatInstance";
import { log } from "../../utils/logger";

import { getModifierTapTarget } from "./graphClickHelpers";

interface ShiftClickEdgeCreationOptions {
  mode: "edit" | "view";
  isLocked: boolean;
  startEdgeCreation: (nodeId: string) => void;
}

/**
 * Hook that enables Shift+Click on a node to start edge/link creation
 * Only active in edit mode when not locked
 *
 * NOTE: Event handling is stubbed in the compatibility layer.
 * For ReactFlow integration, use onNodeClick handler directly.
 */
export function useShiftClickEdgeCreation(
  cyCompat: CyCompatCore | null,
  options: ShiftClickEdgeCreationOptions
): void {
  const { mode, isLocked, startEdgeCreation } = options;

  useEffect(() => {
    if (!cyCompat) return;

    const handleTap = (evt: CyCompatEventObject) => {
      const node = getModifierTapTarget<CyCompatNodeElement>(evt, cyCompat, {
        mode,
        isLocked,
        modifier: "shift"
      });
      if (!node) return;

      log.info(`[ShiftClickEdgeCreation] Starting edge creation from node: ${node.id()}`);
      startEdgeCreation(node.id());
    };

    cyCompat.on("tap", "node", handleTap as unknown as () => void);
    return () => {
      cyCompat.off("tap", "node", handleTap as unknown as () => void);
    };
  }, [cyCompat, mode, isLocked, startEdgeCreation]);
}
