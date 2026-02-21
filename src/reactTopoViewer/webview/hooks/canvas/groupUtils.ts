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

/** Check if a group's bounds are fully contained within another group */
export function isGroupInsideGroup(
  inner: GroupStyleAnnotation,
  outer: GroupStyleAnnotation
): boolean {
  const innerLeft = inner.position.x;
  const innerRight = inner.position.x + inner.width;
  const innerTop = inner.position.y;
  const innerBottom = inner.position.y + inner.height;

  const outerLeft = outer.position.x;
  const outerRight = outer.position.x + outer.width;
  const outerTop = outer.position.y;
  const outerBottom = outer.position.y + outer.height;

  return (
    innerLeft >= outerLeft &&
    innerRight <= outerRight &&
    innerTop >= outerTop &&
    innerBottom <= outerBottom
  );
}

/**
 * Find the smallest group that fully contains the given bounds.
 * Used to determine the parentId for nested groups.
 * @param bounds - The bounding box of the new/inner group
 * @param groups - All existing groups to check against
 * @param excludeId - Optional group ID to exclude (e.g., the new group itself)
 */
export function findParentGroupForBounds(
  bounds: { x: number; y: number; width: number; height: number },
  groups: GroupStyleAnnotation[],
  excludeId?: string
): GroupStyleAnnotation | null {
  let parent: GroupStyleAnnotation | null = null;
  let smallestArea = Infinity;

  // Create a temporary group-like object for comparison
  const innerBounds: GroupStyleAnnotation = {
    id: "__temp__",
    name: "",
    level: "1",
    position: { x: bounds.x, y: bounds.y },
    width: bounds.width,
    height: bounds.height,
  };

  for (const group of groups) {
    // Skip the group itself
    if (excludeId !== undefined && group.id === excludeId) continue;

    // Check if this group fully contains the inner bounds
    if (isGroupInsideGroup(innerBounds, group)) {
      const area = group.width * group.height;
      if (area < smallestArea) {
        smallestArea = area;
        parent = group;
      }
    }
  }

  return parent;
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
  if (newGroupId !== null && targetGroup !== null) {
    actions.addNodeToGroup(nodeId, newGroupId);
  } else if (oldGroupId !== null) {
    actions.removeNodeFromGroup(nodeId);
  }
}
