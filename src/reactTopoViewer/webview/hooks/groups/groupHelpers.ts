/**
 * Helper functions for group management.
 */
import type { Core as CyCore, NodeSingular } from 'cytoscape';
import type { GroupStyleAnnotation } from '../../../shared/types/topology';
import { DEFAULT_GROUP_STYLE, GROUP_LABEL_POSITIONS, GroupLabelPosition } from './groupTypes';

/** Debounce time for saving to extension (internal, not exported to avoid conflicts) */
const GROUP_SAVE_DEBOUNCE_MS = 300;
export { GROUP_SAVE_DEBOUNCE_MS };

/** Command name for saving node group membership */
export const CMD_SAVE_NODE_GROUP_MEMBERSHIP = 'save-node-group-membership';

/**
 * Generates a unique group ID.
 */
export function generateGroupId(cy: CyCore): string {
  let counter = 1;
  const baseCount = cy.nodes().length;
  let newId = `groupName${baseCount + counter}:1`;

  while (cy.getElementById(newId).length > 0) {
    counter++;
    newId = `groupName${baseCount + counter}:1`;
  }

  return newId;
}

/**
 * Parses a group ID into name and level.
 */
export function parseGroupId(groupId: string): { name: string; level: string } {
  const [name, level] = groupId.split(':');
  return { name: name || '', level: level || '1' };
}

/**
 * Builds a group ID from name and level.
 */
export function buildGroupId(name: string, level: string): string {
  return `${name}:${level}`;
}

/**
 * Creates a default group style for a new group.
 */
export function createDefaultGroupStyle(
  groupId: string,
  lastStyle?: Partial<GroupStyleAnnotation>
): GroupStyleAnnotation {
  return {
    ...DEFAULT_GROUP_STYLE,
    ...lastStyle,
    id: groupId
  };
}

/**
 * Checks if a node is a group node.
 */
export function isGroupNode(node: NodeSingular): boolean {
  return node.data('topoViewerRole') === 'group';
}

/**
 * Checks if a node can be added to a group.
 * Returns false for groups, annotations, and nodes already in a group.
 */
export function canBeGrouped(node: NodeSingular): boolean {
  const role = node.data('topoViewerRole');
  if (role === 'group' || role === 'freeText' || role === 'freeShape') {
    return false;
  }
  // Don't allow nodes already in a group to be added to another group
  const parent = node.parent();
  if (parent.length > 0) {
    return false;
  }
  return true;
}

/**
 * Gets groupable nodes from selection.
 */
export function getGroupableNodes(cy: CyCore): NodeSingular[] {
  return cy.nodes(':selected').filter(node => canBeGrouped(node)).toArray() as NodeSingular[];
}

/**
 * Updates the label position class on a group node.
 */
export function updateLabelPositionClass(
  node: NodeSingular,
  labelPosition: string
): void {
  // Remove all label position classes
  GROUP_LABEL_POSITIONS.forEach(pos => node.removeClass(pos));

  // Add the new label position class
  if (GROUP_LABEL_POSITIONS.includes(labelPosition as GroupLabelPosition)) {
    node.addClass(labelPosition);
    node.data('groupLabelPos', labelPosition);
  }
}

/**
 * Updates the empty status class on a group node.
 */
export function updateGroupEmptyStatus(group: NodeSingular): void {
  if (!group || group.removed() || !isGroupNode(group)) {
    return;
  }

  if (group.children().length === 0) {
    group.addClass('empty-group');
  } else {
    group.removeClass('empty-group');
  }
}

/**
 * Applies a group style to a Cytoscape node.
 */
export function applyGroupStyleToNode(
  node: NodeSingular,
  style: GroupStyleAnnotation
): void {
  const css: Record<string, string | number> = {};

  if (style.backgroundColor) {
    css['background-color'] = style.backgroundColor;
  }
  if (style.backgroundOpacity !== undefined) {
    css['background-opacity'] = style.backgroundOpacity / 100;
  }
  if (style.borderColor) {
    css['border-color'] = style.borderColor;
  }
  if (style.borderWidth !== undefined) {
    css['border-width'] = `${style.borderWidth}px`;
  }
  if (style.borderStyle) {
    css['border-style'] = style.borderStyle;
  }
  if (style.borderRadius !== undefined) {
    css['corner-radius'] = style.borderRadius;
  }
  if (style.color) {
    css.color = style.color;
  }

  node.style(css);

  if (style.labelPosition) {
    updateLabelPositionClass(node, style.labelPosition);
  }
}

/**
 * Checks if a position is inside a group's bounding box.
 */
export function isPositionInsideGroup(
  position: { x: number; y: number },
  group: NodeSingular
): boolean {
  const box = group.boundingBox();
  return (
    position.x >= box.x1 &&
    position.x <= box.x2 &&
    position.y >= box.y1 &&
    position.y <= box.y2
  );
}

/**
 * Finds the group that contains a given position.
 */
export function findGroupAtPosition(
  cy: CyCore,
  position: { x: number; y: number }
): NodeSingular | null {
  const groups = cy.nodes('[topoViewerRole="group"]');
  for (const group of groups.toArray() as NodeSingular[]) {
    if (isPositionInsideGroup(position, group)) {
      return group;
    }
  }
  return null;
}

/**
 * Updates a style in the styles array.
 */
export function updateStyleInList(
  styles: GroupStyleAnnotation[],
  groupId: string,
  updates: Partial<GroupStyleAnnotation>
): GroupStyleAnnotation[] {
  const existing = styles.find(s => s.id === groupId);
  if (existing) {
    return styles.map(s => (s.id === groupId ? { ...s, ...updates } : s));
  }
  return [...styles, { ...DEFAULT_GROUP_STYLE, id: groupId, ...updates }];
}

/**
 * Removes a style from the styles array.
 */
export function removeStyleFromList(
  styles: GroupStyleAnnotation[],
  groupId: string
): GroupStyleAnnotation[] {
  return styles.filter(s => s.id !== groupId);
}
