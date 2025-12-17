/**
 * Utility functions for group hierarchy operations.
 * Provides tree traversal, validation, and hierarchy calculations.
 */

import type { GroupStyleAnnotation, FreeTextAnnotation, FreeShapeAnnotation } from '../../../shared/types/topology';

/**
 * Build a map of parent ID to child groups.
 * Groups with no parent (root groups) are mapped to null key.
 */
export function buildGroupTree(
  groups: GroupStyleAnnotation[]
): Map<string | null, GroupStyleAnnotation[]> {
  const tree = new Map<string | null, GroupStyleAnnotation[]>();

  for (const group of groups) {
    const parentId = group.parentId ?? null;
    const children = tree.get(parentId) ?? [];
    children.push(group);
    tree.set(parentId, children);
  }

  return tree;
}

/**
 * Get all descendant groups recursively (children, grandchildren, etc.).
 */
export function getDescendantGroups(
  groupId: string,
  groups: GroupStyleAnnotation[]
): GroupStyleAnnotation[] {
  const tree = buildGroupTree(groups);
  const descendants: GroupStyleAnnotation[] = [];

  function collectDescendants(parentId: string): void {
    const children = tree.get(parentId) ?? [];
    for (const child of children) {
      descendants.push(child);
      collectDescendants(child.id);
    }
  }

  collectDescendants(groupId);
  return descendants;
}

/**
 * Get all descendant group IDs recursively.
 */
export function getDescendantGroupIds(
  groupId: string,
  groups: GroupStyleAnnotation[]
): string[] {
  return getDescendantGroups(groupId, groups).map(g => g.id);
}

/**
 * Get direct child groups (one level deep).
 */
export function getChildGroups(
  groupId: string,
  groups: GroupStyleAnnotation[]
): GroupStyleAnnotation[] {
  return groups.filter(g => g.parentId === groupId);
}

/**
 * Get direct child group IDs.
 */
export function getChildGroupIds(
  groupId: string,
  groups: GroupStyleAnnotation[]
): string[] {
  return getChildGroups(groupId, groups).map(g => g.id);
}

/**
 * Get all ancestor groups (parent, grandparent, etc.) from closest to farthest.
 */
export function getAncestorGroups(
  groupId: string,
  groups: GroupStyleAnnotation[]
): GroupStyleAnnotation[] {
  const groupMap = new Map(groups.map(g => [g.id, g]));
  const ancestors: GroupStyleAnnotation[] = [];

  let current = groupMap.get(groupId);
  while (current?.parentId) {
    const parent = groupMap.get(current.parentId);
    if (parent) {
      ancestors.push(parent);
      current = parent;
    } else {
      break;
    }
  }

  return ancestors;
}

/**
 * Get the parent group of a group (if any).
 */
export function getParentGroup(
  groupId: string,
  groups: GroupStyleAnnotation[]
): GroupStyleAnnotation | null {
  const group = groups.find(g => g.id === groupId);
  if (!group?.parentId) return null;
  return groups.find(g => g.id === group.parentId) ?? null;
}

/**
 * Calculate the nesting depth of a group.
 * Root groups have depth 0.
 */
export function getGroupDepth(
  groupId: string,
  groups: GroupStyleAnnotation[]
): number {
  const ancestors = getAncestorGroups(groupId, groups);
  return ancestors.length;
}

/**
 * Get all root groups (groups with no parent).
 */
export function findRootGroups(groups: GroupStyleAnnotation[]): GroupStyleAnnotation[] {
  return groups.filter(g => !g.parentId);
}

/**
 * Validate that setting a parent would not create a circular reference.
 * Returns true if the assignment is valid (no cycle), false if it would create a cycle.
 */
export function validateNoCircularReference(
  groupId: string,
  proposedParentId: string | null,
  groups: GroupStyleAnnotation[]
): boolean {
  // No parent is always valid
  if (!proposedParentId) return true;

  // Can't be your own parent
  if (groupId === proposedParentId) return false;

  // Check if proposedParentId is a descendant of groupId
  const descendants = getDescendantGroupIds(groupId, groups);
  return !descendants.includes(proposedParentId);
}

/**
 * Get all annotations (text and shapes) that belong to a specific group.
 */
export function getAnnotationsInGroup(
  groupId: string,
  textAnnotations: FreeTextAnnotation[],
  shapeAnnotations: FreeShapeAnnotation[]
): {
  texts: FreeTextAnnotation[];
  shapes: FreeShapeAnnotation[];
} {
  return {
    texts: textAnnotations.filter(t => t.groupId === groupId),
    shapes: shapeAnnotations.filter(s => s.groupId === groupId)
  };
}

/**
 * Get all annotations recursively from a group and all its descendants.
 */
export function getAllAnnotationsInHierarchy(
  groupId: string,
  groups: GroupStyleAnnotation[],
  textAnnotations: FreeTextAnnotation[],
  shapeAnnotations: FreeShapeAnnotation[]
): {
  texts: FreeTextAnnotation[];
  shapes: FreeShapeAnnotation[];
} {
  // Get the group itself and all descendants
  const groupIds = [groupId, ...getDescendantGroupIds(groupId, groups)];

  return {
    texts: textAnnotations.filter(t => t.groupId && groupIds.includes(t.groupId)),
    shapes: shapeAnnotations.filter(s => s.groupId && groupIds.includes(s.groupId))
  };
}

/**
 * Sort groups by depth (root first) then by zIndex.
 * Useful for rendering parent groups before children.
 */
export function sortGroupsByDepthThenZIndex(
  groups: GroupStyleAnnotation[]
): GroupStyleAnnotation[] {
  return [...groups].sort((a, b) => {
    const depthA = getGroupDepth(a.id, groups);
    const depthB = getGroupDepth(b.id, groups);

    // Sort by depth first (lower depth = parent = render first)
    if (depthA !== depthB) {
      return depthA - depthB;
    }

    // Then by zIndex
    return (a.zIndex ?? 0) - (b.zIndex ?? 0);
  });
}

/**
 * Calculate the center position of a group.
 */
export function getGroupCenter(group: GroupStyleAnnotation): { x: number; y: number } {
  return {
    x: group.position.x + group.width / 2,
    y: group.position.y + group.height / 2
  };
}

/**
 * Calculate relative position of a point from a group's top-left corner.
 */
export function getRelativePosition(
  position: { x: number; y: number },
  group: GroupStyleAnnotation
): { x: number; y: number } {
  return {
    x: position.x - group.position.x,
    y: position.y - group.position.y
  };
}

/**
 * Calculate absolute position from a relative position and group's top-left corner.
 */
export function getAbsolutePosition(
  relativePosition: { x: number; y: number },
  group: GroupStyleAnnotation
): { x: number; y: number } {
  return {
    x: group.position.x + relativePosition.x,
    y: group.position.y + relativePosition.y
  };
}

/**
 * Check if a position is inside a group's bounding box.
 * Note: group.position is the CENTER of the group, not top-left.
 */
export function isPositionInGroup(
  position: { x: number; y: number },
  group: GroupStyleAnnotation
): boolean {
  const halfWidth = group.width / 2;
  const halfHeight = group.height / 2;
  return (
    position.x >= group.position.x - halfWidth &&
    position.x <= group.position.x + halfWidth &&
    position.y >= group.position.y - halfHeight &&
    position.y <= group.position.y + halfHeight
  );
}

/**
 * Find the deepest group at a position (considering hierarchy).
 * Returns the most nested group that contains the position.
 */
export function findDeepestGroupAtPosition(
  position: { x: number; y: number },
  groups: GroupStyleAnnotation[]
): GroupStyleAnnotation | null {
  // Get all groups containing the position
  const containingGroups = groups.filter(g => isPositionInGroup(position, g));

  if (containingGroups.length === 0) return null;

  // Sort by depth descending (deepest first), then by zIndex descending
  const sorted = [...containingGroups].sort((a, b) => {
    const depthA = getGroupDepth(a.id, groups);
    const depthB = getGroupDepth(b.id, groups);

    if (depthA !== depthB) {
      return depthB - depthA; // Higher depth first
    }

    return (b.zIndex ?? 0) - (a.zIndex ?? 0); // Higher zIndex first
  });

  return sorted[0];
}

/**
 * Clone a group with a new ID, optionally updating parentId.
 */
export function cloneGroup(
  group: GroupStyleAnnotation,
  newId: string,
  newParentId?: string | null
): GroupStyleAnnotation {
  return {
    ...group,
    id: newId,
    parentId: newParentId === null ? undefined : (newParentId ?? group.parentId)
  };
}
