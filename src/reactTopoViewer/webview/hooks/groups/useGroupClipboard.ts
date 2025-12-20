/**
 * Hook for group clipboard operations (copy, paste).
 * Supports copying entire group hierarchies including annotations.
 */

import { useCallback, useRef } from 'react';

import type {
  GroupStyleAnnotation,
  FreeTextAnnotation,
  FreeShapeAnnotation
} from '../../../shared/types/topology';
import { log } from '../../utils/logger';

import type { GroupClipboardData, PastedGroupResult } from './groupTypes';
import {
  getDescendantGroups,
  getAllAnnotationsInHierarchy,
  getRelativePosition
} from './hierarchyUtils';
import { generateGroupId } from './groupHelpers';

/** Counter for generating unique annotation IDs */
let annotationIdCounter = 0;

/** Generate a unique ID for pasted annotations using timestamp + counter */
function generateAnnotationId(prefix: string): string {
  annotationIdCounter++;
  return `${prefix}_${Date.now()}_${annotationIdCounter}`;
}

/** Create descendant groups with new IDs */
function createDescendantGroups(
  clipboardData: GroupClipboardData,
  existingGroups: GroupStyleAnnotation[],
  idMapping: Map<string, string>,
  position: { x: number; y: number },
  pasteOffset: number,
  initialGroups: GroupStyleAnnotation[]
): GroupStyleAnnotation[] {
  const newGroups = [...initialGroups];

  for (const descendant of clipboardData.descendantGroups) {
    const newDescendantId = generateGroupId([...existingGroups, ...newGroups]);
    idMapping.set(descendant.id, newDescendantId);

    const newParentId = descendant.parentId
      ? idMapping.get(descendant.parentId)
      : undefined;

    newGroups.push({
      ...descendant,
      id: newDescendantId,
      parentId: newParentId,
      position: {
        x: position.x + descendant.position.x + pasteOffset,
        y: position.y + descendant.position.y + pasteOffset
      }
    });
  }

  return newGroups;
}

/** Create text annotations with new IDs */
function createTextAnnotations(
  clipboardData: GroupClipboardData,
  idMapping: Map<string, string>,
  position: { x: number; y: number },
  pasteOffset: number
): FreeTextAnnotation[] {
  return clipboardData.textAnnotations.map(text => {
    const newTextId = generateAnnotationId('freeText');
    idMapping.set(text.id, newTextId);

    const newGroupId = text.groupId ? idMapping.get(text.groupId) : undefined;
    const { relativePosition, ...rest } = text;

    return {
      ...rest,
      id: newTextId,
      groupId: newGroupId,
      position: {
        x: position.x + relativePosition.x + pasteOffset,
        y: position.y + relativePosition.y + pasteOffset
      }
    } as FreeTextAnnotation;
  });
}

/** Create shape annotations with new IDs */
function createShapeAnnotations(
  clipboardData: GroupClipboardData,
  idMapping: Map<string, string>,
  position: { x: number; y: number },
  pasteOffset: number
): FreeShapeAnnotation[] {
  return clipboardData.shapeAnnotations.map(shape => {
    const newShapeId = generateAnnotationId('freeShape');
    idMapping.set(shape.id, newShapeId);

    const newGroupId = shape.groupId ? idMapping.get(shape.groupId) : undefined;
    const { relativePosition, ...rest } = shape;

    const newShape: FreeShapeAnnotation = {
      ...rest,
      id: newShapeId,
      groupId: newGroupId,
      position: {
        x: position.x + relativePosition.x + pasteOffset,
        y: position.y + relativePosition.y + pasteOffset
      }
    };

    if (shape.endPosition) {
      const relativeEnd = {
        x: shape.endPosition.x - clipboardData.rootGroup.position.x,
        y: shape.endPosition.y - clipboardData.rootGroup.position.y
      };
      newShape.endPosition = {
        x: position.x + relativeEnd.x + pasteOffset,
        y: position.y + relativeEnd.y + pasteOffset
      };
    }

    return newShape;
  });
}

export interface UseGroupClipboardOptions {
  groups: GroupStyleAnnotation[];
  textAnnotations: FreeTextAnnotation[];
  shapeAnnotations: FreeShapeAnnotation[];
  getGroupMembers: (groupId: string) => string[];
  // Callbacks to add new elements
  onAddGroup?: (group: GroupStyleAnnotation) => void;
  onAddTextAnnotation?: (annotation: FreeTextAnnotation) => void;
  onAddShapeAnnotation?: (annotation: FreeShapeAnnotation) => void;
}

export interface UseGroupClipboardReturn {
  /** Copy a group and all its contents to clipboard */
  copyGroup: (groupId: string) => boolean;
  /** Paste the clipboard contents at a position */
  pasteGroup: (position: { x: number; y: number }) => PastedGroupResult | null;
  /** Check if clipboard has data */
  hasClipboardData: () => boolean;
  /** Clear clipboard */
  clearClipboard: () => void;
  /** Get clipboard data for inspection */
  getClipboardData: () => GroupClipboardData | null;
}

export function useGroupClipboard(options: UseGroupClipboardOptions): UseGroupClipboardReturn {
  const {
    groups,
    textAnnotations,
    shapeAnnotations,
    getGroupMembers,
    onAddGroup,
    onAddTextAnnotation,
    onAddShapeAnnotation
  } = options;

  const clipboardRef = useRef<GroupClipboardData | null>(null);
  const pasteCounterRef = useRef(0);

  const copyGroup = useCallback(
    (groupId: string): boolean => {
      const rootGroup = groups.find(g => g.id === groupId);
      if (!rootGroup) {
        log.warn(`[GroupClipboard] Group not found: ${groupId}`);
        return false;
      }

      // Get all descendant groups
      const descendantGroups = getDescendantGroups(groupId, groups);

      // Get all annotations in the hierarchy
      const { texts, shapes } = getAllAnnotationsInHierarchy(
        groupId,
        groups,
        textAnnotations,
        shapeAnnotations
      );

      // Collect member nodes with relative positions
      const allGroupIds = [groupId, ...descendantGroups.map(g => g.id)];
      const memberNodes: GroupClipboardData['memberNodes'] = [];

      for (const gId of allGroupIds) {
        const group = gId === groupId ? rootGroup : descendantGroups.find(g => g.id === gId);
        if (!group) continue;

        const members = getGroupMembers(gId);
        for (const nodeId of members) {
          // Note: We don't have node positions here, so we store group-relative membership
          // The actual node positions would need to be captured from cytoscape
          memberNodes.push({
            nodeId,
            groupId: gId,
            relativePosition: { x: 0, y: 0 } // Placeholder - actual position would come from cy
          });
        }
      }

      // Calculate relative positions from root group position
      const textAnnotationsWithRelative = texts.map(t => ({
        ...t,
        relativePosition: getRelativePosition(t.position, rootGroup)
      }));

      const shapeAnnotationsWithRelative = shapes.map(s => ({
        ...s,
        relativePosition: getRelativePosition(s.position, rootGroup)
      }));

      const descendantGroupsWithRelative = descendantGroups.map(g => ({
        ...g,
        position: getRelativePosition(g.position, rootGroup)
      }));

      clipboardRef.current = {
        rootGroup: { ...rootGroup, position: { x: 0, y: 0 } }, // Root position becomes origin
        descendantGroups: descendantGroupsWithRelative,
        memberNodes,
        textAnnotations: textAnnotationsWithRelative,
        shapeAnnotations: shapeAnnotationsWithRelative
      };

      pasteCounterRef.current = 0;

      log.info(
        `[GroupClipboard] Copied group ${groupId} with ` +
        `${descendantGroups.length} descendants, ` +
        `${texts.length} texts, ${shapes.length} shapes`
      );

      return true;
    },
    [groups, textAnnotations, shapeAnnotations, getGroupMembers]
  );

  const pasteGroup = useCallback(
    (position: { x: number; y: number }): PastedGroupResult | null => {
      const clipboardData = clipboardRef.current;
      if (!clipboardData) {
        log.warn('[GroupClipboard] No clipboard data to paste');
        return null;
      }

      const idMapping = new Map<string, string>();
      pasteCounterRef.current++;
      const pasteOffset = pasteCounterRef.current * 20;

      // Create new root group
      const newRootId = generateGroupId(groups);
      idMapping.set(clipboardData.rootGroup.id, newRootId);

      const newRootGroup: GroupStyleAnnotation = {
        ...clipboardData.rootGroup,
        id: newRootId,
        position: { x: position.x + pasteOffset, y: position.y + pasteOffset },
        parentId: undefined
      };

      // Create all groups, text annotations, and shape annotations
      const newGroups = createDescendantGroups(
        clipboardData, groups, idMapping, position, pasteOffset, [newRootGroup]
      );
      const newTextAnnotations = createTextAnnotations(clipboardData, idMapping, position, pasteOffset);
      const newShapeAnnotations = createShapeAnnotations(clipboardData, idMapping, position, pasteOffset);

      // Add elements using callbacks
      newGroups.forEach(group => onAddGroup?.(group));
      newTextAnnotations.forEach(text => onAddTextAnnotation?.(text));
      newShapeAnnotations.forEach(shape => onAddShapeAnnotation?.(shape));

      log.info(
        `[GroupClipboard] Pasted ${newGroups.length} groups, ` +
        `${newTextAnnotations.length} texts, ${newShapeAnnotations.length} shapes`
      );

      return { newGroups, newTextAnnotations, newShapeAnnotations, idMapping };
    },
    [groups, onAddGroup, onAddTextAnnotation, onAddShapeAnnotation]
  );

  const hasClipboardData = useCallback((): boolean => {
    return clipboardRef.current !== null;
  }, []);

  const clearClipboard = useCallback((): void => {
    clipboardRef.current = null;
    pasteCounterRef.current = 0;
    log.info('[GroupClipboard] Clipboard cleared');
  }, []);

  const getClipboardData = useCallback((): GroupClipboardData | null => {
    return clipboardRef.current;
  }, []);

  return {
    copyGroup,
    pasteGroup,
    hasClipboardData,
    clearClipboard,
    getClipboardData
  };
}
