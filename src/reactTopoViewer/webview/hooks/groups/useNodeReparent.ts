/**
 * Hook for handling node reparenting when dragged between groups
 */
import { useEffect, useRef } from "react";

import type { GroupStyleAnnotation } from "../../../shared/types/topology";
import type { TopoNode } from "../../../shared/types/graph";

interface UseNodeReparentOptions {
  mode: "edit" | "view";
  isLocked: boolean;
  onMembershipWillChange?: (
    nodeId: string,
    oldGroupId: string | null,
    newGroupId: string | null
  ) => void;
}

interface GroupActions {
  groups: GroupStyleAnnotation[];
  addNodeToGroup: (nodeId: string, groupId: string) => void;
  removeNodeFromGroup: (nodeId: string) => void;
}

/**
 * Watches for node position changes and handles group membership updates.
 * Currently a no-op stub - membership is handled via onNodeDropped in AnnotationContext.
 */
export function useNodeReparent(
  nodes: TopoNode[],
  _options: UseNodeReparentOptions,
  _groupActions: GroupActions
): void {
  // Store previous positions for change detection
  const prevPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  useEffect(() => {
    // Update position tracking (but don't auto-reparent - let explicit drops handle it)
    const newPositions = new Map<string, { x: number; y: number }>();
    for (const node of nodes) {
      if (node.position) {
        newPositions.set(node.id, { x: node.position.x, y: node.position.y });
      }
    }
    prevPositionsRef.current = newPositions;
  }, [nodes]);
}
