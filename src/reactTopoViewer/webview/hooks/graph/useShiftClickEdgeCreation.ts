/**
 * useShiftClickEdgeCreation - Hook for starting edge creation via Shift+Click on node
 */
import { useEffect } from "react";
import type { Core, EventObject, NodeSingular } from "cytoscape";

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
 */
export function useShiftClickEdgeCreation(
  cy: Core | null,
  options: ShiftClickEdgeCreationOptions
): void {
  const { mode, isLocked, startEdgeCreation } = options;

  useEffect(() => {
    if (!cy) return;

    const handleTap = (evt: EventObject) => {
      const node = getModifierTapTarget<NodeSingular>(evt, cy, {
        mode,
        isLocked,
        modifier: "shift"
      });
      if (!node) return;

      log.info(`[ShiftClickEdgeCreation] Starting edge creation from node: ${node.id()}`);
      startEdgeCreation(node.id());
    };

    cy.on("tap", "node", handleTap);
    return () => {
      cy.off("tap", "node", handleTap);
    };
  }, [cy, mode, isLocked, startEdgeCreation]);
}
