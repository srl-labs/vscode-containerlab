/**
 * useAltClickDelete - Hook for deleting nodes/edges via Alt+Click
 *
 * NOTE: This hook uses the CyCompatCore compatibility layer.
 * The event handling is a stub - actual events should be handled via ReactFlow's
 * onNodeClick/onEdgeClick callbacks. This hook provides the deletion logic
 * that can be called from those handlers.
 */
import { useEffect } from "react";

import type {
  CyCompatCore,
  CyCompatEventObject,
  CyCompatNodeElement,
  CyCompatEdgeElement
} from "../useCytoCompatInstance";
import { log } from "../../utils/logger";

import { getModifierTapTarget } from "./graphClickHelpers";

interface AltClickDeleteOptions {
  mode: "edit" | "view";
  isLocked: boolean;
  onDeleteNode: (nodeId: string) => void;
  onDeleteEdge: (edgeId: string) => void;
}

/**
 * Hook that enables Alt+Click to delete nodes and edges
 * Only active in edit mode when not locked
 *
 * NOTE: Event handling is stubbed in the compatibility layer.
 * For ReactFlow integration, use onNodeClick/onEdgeClick handlers directly.
 */
export function useAltClickDelete(
  cyCompat: CyCompatCore | null,
  options: AltClickDeleteOptions
): void {
  const { mode, isLocked, onDeleteNode, onDeleteEdge } = options;

  useEffect(() => {
    if (!cyCompat) return;

    const handleTap = (evt: CyCompatEventObject) => {
      const element = getModifierTapTarget<CyCompatNodeElement | CyCompatEdgeElement>(
        evt,
        cyCompat,
        {
          mode,
          isLocked,
          modifier: "alt"
        }
      );
      if (!element) return;

      if (element.isNode()) {
        log.info(`[AltClickDelete] Deleting node: ${element.id()}`);
        onDeleteNode(element.id());
      } else if (element.isEdge()) {
        log.info(`[AltClickDelete] Deleting edge: ${element.id()}`);
        onDeleteEdge(element.id());
      }
    };

    cyCompat.on("tap", "node, edge", handleTap as unknown as () => void);
    return () => {
      cyCompat.off("tap", "node, edge", handleTap as unknown as () => void);
    };
  }, [cyCompat, mode, isLocked, onDeleteNode, onDeleteEdge]);
}
