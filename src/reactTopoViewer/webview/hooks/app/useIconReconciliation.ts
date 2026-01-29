/**
 * Hook to track used custom icons and trigger reconciliation when usage changes.
 * This ensures custom icons used by nodes are copied to the workspace .clab-icons/ folder.
 */
import { useEffect, useRef } from "react";
import type { Node } from "@xyflow/react";

import { extractUsedCustomIcons } from "../../../shared/types/icons";
import { sendIconReconcile } from "../../messaging/extensionMessaging";

/**
 * Tracks custom icons used by nodes and triggers reconciliation when usage changes.
 * Reconciliation copies used icons from global (~/.clab/icons/) to workspace (.clab-icons/).
 *
 * @param nodes - Current graph nodes
 */
export function useIconReconciliation(nodes: Node[]): void {
  const prevUsedIconsRef = useRef<string[]>([]);

  useEffect(() => {
    // Extract custom icons currently used by nodes
    // The function expects objects with data.topoViewerRole, which matches our node structure
    // (TopologyNode stores role in data.role, but we need to check data.topoViewerRole in extraData)
    const nodeDataForExtraction = nodes.map((node) => {
      const data = node.data as Record<string, unknown>;
      const extraData = (data.extraData as Record<string, unknown>) || {};
      return {
        data: {
          // Check both role (canvas data) and topoViewerRole (extraData) for the icon name
          topoViewerRole: (data.role as string) || (extraData.topoViewerRole as string)
        }
      };
    });

    const usedIcons = extractUsedCustomIcons(nodeDataForExtraction);
    const prevUsedIcons = prevUsedIconsRef.current;

    // Check if the set of used icons has changed
    const usedSet = new Set(usedIcons);
    const prevSet = new Set(prevUsedIcons);
    const hasChanged =
      usedIcons.length !== prevUsedIcons.length ||
      usedIcons.some((icon) => !prevSet.has(icon)) ||
      prevUsedIcons.some((icon) => !usedSet.has(icon));

    if (hasChanged && nodes.length > 0) {
      prevUsedIconsRef.current = usedIcons;
      // Trigger icon reconciliation on extension side
      sendIconReconcile(usedIcons);
    }
  }, [nodes]);
}
