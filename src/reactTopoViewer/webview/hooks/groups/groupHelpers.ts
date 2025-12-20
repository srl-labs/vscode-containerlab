/**
 * Helper functions for overlay-based group management.
 * Groups are rendered as HTML/SVG overlays, not Cytoscape nodes.
 */
import type { GroupStyleAnnotation } from '../../../shared/types/topology';

import {
  DEFAULT_GROUP_STYLE,
  DEFAULT_GROUP_WIDTH,
  DEFAULT_GROUP_HEIGHT
} from './groupTypes';

/** Command name for saving node group membership */
export const CMD_SAVE_NODE_GROUP_MEMBERSHIP = 'save-node-group-membership';
export const CMD_SAVE_GROUP_ANNOTATIONS = 'save-group-annotations';

/** Debounce time for saving to extension */
export const GROUP_SAVE_DEBOUNCE_MS = 300;

/**
 * Generate a unique group ID.
 */
export function generateGroupId(existingGroups: GroupStyleAnnotation[]): string {
  let counter = 1;
  let newId = `group${counter}:1`;

  const existingIds = new Set(existingGroups.map(g => g.id));
  while (existingIds.has(newId)) {
    counter++;
    newId = `group${counter}:1`;
  }

  return newId;
}

/**
 * Parse a group ID into name and level.
 */
export function parseGroupId(groupId: string): { name: string; level: string } {
  const [name, level] = groupId.split(':');
  return { name: name || '', level: level || '1' };
}

/**
 * Build a group ID from name and level.
 */
export function buildGroupId(name: string, level: string): string {
  return `${name}:${level}`;
}

/** Keys to exclude when copying last style (geometry and identity) */
const EXCLUDED_STYLE_KEYS = new Set(['width', 'height', 'position', 'id', 'name', 'level']);

/**
 * Create a new group with default values.
 * Note: width, height, position are NOT taken from lastStyle - only visual styles.
 */
export function createDefaultGroup(
  id: string,
  position: { x: number; y: number },
  lastStyle?: Partial<GroupStyleAnnotation>
): GroupStyleAnnotation {
  const { name, level } = parseGroupId(id);
  // Only copy visual style properties, not geometry
  const visualStyles: Partial<GroupStyleAnnotation> = {};
  if (lastStyle) {
    for (const [key, value] of Object.entries(lastStyle)) {
      if (!EXCLUDED_STYLE_KEYS.has(key)) {
        (visualStyles as Record<string, unknown>)[key] = value;
      }
    }
  }
  return {
    id,
    name,
    level,
    position,
    width: DEFAULT_GROUP_WIDTH,
    height: DEFAULT_GROUP_HEIGHT,
    ...DEFAULT_GROUP_STYLE,
    ...visualStyles
  };
}

/**
 * Check if a point is inside a group's bounding box.
 */
export function isPointInsideGroup(
  point: { x: number; y: number },
  group: GroupStyleAnnotation
): boolean {
  const halfWidth = group.width / 2;
  const halfHeight = group.height / 2;
  return (
    point.x >= group.position.x - halfWidth &&
    point.x <= group.position.x + halfWidth &&
    point.y >= group.position.y - halfHeight &&
    point.y <= group.position.y + halfHeight
  );
}

/**
 * Find the group that contains a given position.
 * Returns the topmost group (highest zIndex) if multiple overlap.
 */
export function findGroupAtPosition(
  groups: GroupStyleAnnotation[],
  position: { x: number; y: number }
): GroupStyleAnnotation | null {
  // Sort by zIndex descending to get topmost first
  const sorted = [...groups].sort((a, b) => (b.zIndex ?? 5) - (a.zIndex ?? 5));
  for (const group of sorted) {
    if (isPointInsideGroup(position, group)) {
      return group;
    }
  }
  return null;
}

/**
 * Get the bounding box of a group.
 */
export function getGroupBoundingBox(group: GroupStyleAnnotation): {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
} {
  const halfWidth = group.width / 2;
  const halfHeight = group.height / 2;
  return {
    x1: group.position.x - halfWidth,
    y1: group.position.y - halfHeight,
    x2: group.position.x + halfWidth,
    y2: group.position.y + halfHeight
  };
}

/**
 * Calculate bounding box that encompasses all given positions with padding.
 */
export function calculateBoundingBox(
  positions: { x: number; y: number }[],
  padding: number = 30
): { position: { x: number; y: number }; width: number; height: number } {
  if (positions.length === 0) {
    return { position: { x: 0, y: 0 }, width: DEFAULT_GROUP_WIDTH, height: DEFAULT_GROUP_HEIGHT };
  }

  const xs = positions.map(p => p.x);
  const ys = positions.map(p => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const width = Math.max(maxX - minX + padding * 2, DEFAULT_GROUP_WIDTH);
  const height = Math.max(maxY - minY + padding * 2, DEFAULT_GROUP_HEIGHT);

  return {
    position: {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2
    },
    width,
    height
  };
}

/**
 * Update a group in the list.
 */
export function updateGroupInList(
  groups: GroupStyleAnnotation[],
  groupId: string,
  updates: Partial<GroupStyleAnnotation>
): GroupStyleAnnotation[] {
  return groups.map(g => (g.id === groupId ? { ...g, ...updates } : g));
}

/**
 * Remove a group from the list.
 */
export function removeGroupFromList(
  groups: GroupStyleAnnotation[],
  groupId: string
): GroupStyleAnnotation[] {
  return groups.filter(g => g.id !== groupId);
}

/**
 * Check if a bounding box intersects with selection box.
 */
export function isGroupInSelectionBox(
  group: GroupStyleAnnotation,
  box: { x1: number; y1: number; x2: number; y2: number }
): boolean {
  const minX = Math.min(box.x1, box.x2);
  const maxX = Math.max(box.x1, box.x2);
  const minY = Math.min(box.y1, box.y2);
  const maxY = Math.max(box.y1, box.y2);

  // Check if group center is in box
  return (
    group.position.x >= minX &&
    group.position.x <= maxX &&
    group.position.y >= minY &&
    group.position.y <= maxY
  );
}

/**
 * Get label position styles based on labelPosition setting.
 * Labels are positioned OUTSIDE the group border.
 */
export function getLabelPositionStyles(labelPosition: string = 'top-center'): {
  top?: string;
  bottom?: string;
  left?: string;
  right?: string;
  textAlign: 'left' | 'center' | 'right';
  transform: string;
} {
  const baseTransform = 'translateX(-50%)';
  // Position labels outside the border (negative offset moves them out)
  const topOffset = '-18px';
  const bottomOffset = '-18px';

  switch (labelPosition) {
    case 'top-left':
      return { top: topOffset, left: '0', textAlign: 'left', transform: 'none' };
    case 'top-center':
      return { top: topOffset, left: '50%', textAlign: 'center', transform: baseTransform };
    case 'top-right':
      return { top: topOffset, right: '0', textAlign: 'right', transform: 'none' };
    case 'bottom-left':
      return { bottom: bottomOffset, left: '0', textAlign: 'left', transform: 'none' };
    case 'bottom-center':
      return { bottom: bottomOffset, left: '50%', textAlign: 'center', transform: baseTransform };
    case 'bottom-right':
      return { bottom: bottomOffset, right: '0', textAlign: 'right', transform: 'none' };
    default:
      return { top: topOffset, left: '50%', textAlign: 'center', transform: baseTransform };
  }
}
