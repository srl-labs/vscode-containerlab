/**
 * Group utility functions - minimal implementations
 */
import type { GroupStyleAnnotation } from "../../../shared/types/topology";

/** Check if a position is inside a group's bounding box */
export function isPositionInsideGroup(
  position: { x: number; y: number },
  group: GroupStyleAnnotation
): boolean {
  const gx = group.position.x;
  const gy = group.position.y;
  return (
    position.x >= gx &&
    position.x <= gx + group.width &&
    position.y >= gy &&
    position.y <= gy + group.height
  );
}

/** Find the deepest (smallest) group that contains the given position */
export function findDeepestGroupAtPosition(
  position: { x: number; y: number },
  groups: GroupStyleAnnotation[]
): GroupStyleAnnotation | null {
  let deepest: GroupStyleAnnotation | null = null;
  let smallestArea = Infinity;

  for (const group of groups) {
    if (isPositionInsideGroup(position, group)) {
      const area = group.width * group.height;
      if (area < smallestArea) {
        smallestArea = area;
        deepest = group;
      }
    }
  }

  return deepest;
}

/** Alias for findDeepestGroupAtPosition */
export function findGroupForNodeAtPosition(
  position: { x: number; y: number },
  groups: GroupStyleAnnotation[]
): GroupStyleAnnotation | null {
  return findDeepestGroupAtPosition(position, groups);
}

/** Generate a unique group ID */
export function generateGroupId(existingGroups: GroupStyleAnnotation[]): string {
  const existingIds = new Set(existingGroups.map((g) => g.id));
  let counter = 1;
  while (existingIds.has(`group-${counter}`)) {
    counter++;
  }
  return `group-${counter}`;
}

/** Handle node membership change between groups */
export function handleNodeMembershipChange(
  nodeId: string,
  oldGroupId: string | null,
  newGroupId: string | null,
  targetGroup: GroupStyleAnnotation | null,
  actions: {
    addNodeToGroup: (nodeId: string, groupId: string) => void;
    removeNodeFromGroup: (nodeId: string) => void;
  },
  onMembershipWillChange?: (
    nodeId: string,
    oldGroupId: string | null,
    newGroupId: string | null
  ) => void
): void {
  // Notify about the change
  onMembershipWillChange?.(nodeId, oldGroupId, newGroupId);

  // Apply the change
  if (newGroupId && targetGroup) {
    actions.addNodeToGroup(nodeId, newGroupId);
  } else if (oldGroupId) {
    actions.removeNodeFromGroup(nodeId);
  }
}
