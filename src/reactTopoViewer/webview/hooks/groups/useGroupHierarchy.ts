/**
 * Hook for managing group hierarchy relationships.
 * Provides methods to track and manipulate the nested group structure,
 * including annotations that belong to groups.
 */

import { useCallback } from "react";

import type {
  GroupStyleAnnotation,
  FreeTextAnnotation,
  FreeShapeAnnotation
} from "../../../shared/types/topology";

import type { GroupDragOffset } from "./groupTypes";
import {
  getDescendantGroups as getDescendantsUtil,
  getChildGroups as getChildrenUtil,
  getAncestorGroups,
  getParentGroup as getParentUtil,
  getGroupDepth as getDepthUtil,
  validateNoCircularReference,
  getAnnotationsInGroup,
  getAllAnnotationsInHierarchy,
  sortGroupsByDepthThenZIndex
} from "./hierarchyUtils";

export interface UseGroupHierarchyOptions {
  groups: GroupStyleAnnotation[];
  textAnnotations: FreeTextAnnotation[];
  shapeAnnotations: FreeShapeAnnotation[];
  onUpdateGroup?: (groupId: string, updates: Partial<GroupStyleAnnotation>) => void;
  onUpdateTextAnnotation?: (annotationId: string, updates: Partial<FreeTextAnnotation>) => void;
  onUpdateShapeAnnotation?: (annotationId: string, updates: Partial<FreeShapeAnnotation>) => void;
}

export interface UseGroupHierarchyReturn {
  // Query methods
  getChildGroups: (groupId: string) => GroupStyleAnnotation[];
  getDescendantGroups: (groupId: string) => GroupStyleAnnotation[];
  getAncestorGroups: (groupId: string) => GroupStyleAnnotation[];
  getParentGroup: (groupId: string) => GroupStyleAnnotation | null;
  getGroupDepth: (groupId: string) => number;
  isDescendantOf: (groupId: string, potentialAncestorId: string) => boolean;

  // Annotation queries
  getAnnotationsInGroup: (groupId: string) => {
    texts: FreeTextAnnotation[];
    shapes: FreeShapeAnnotation[];
  };
  getAllAnnotationsInHierarchy: (groupId: string) => {
    texts: FreeTextAnnotation[];
    shapes: FreeShapeAnnotation[];
  };

  // Mutation methods
  setGroupParent: (groupId: string, parentId: string | null) => boolean;
  setAnnotationGroup: (
    annotationId: string,
    annotationType: "freeText" | "freeShape",
    groupId: string | null
  ) => void;

  // Validation
  canSetParent: (groupId: string, proposedParentId: string | null) => boolean;

  // Rendering helpers
  getSortedGroups: () => GroupStyleAnnotation[];
  calculateDragOffsets: (rootGroupId: string, dx: number, dy: number) => GroupDragOffset[];

  // Hierarchy snapshot for undo/redo
  captureHierarchyState: (groupId: string) => {
    groups: GroupStyleAnnotation[];
    textAnnotations: FreeTextAnnotation[];
    shapeAnnotations: FreeShapeAnnotation[];
  };
}

/**
 * Hook for managing group hierarchy relationships.
 */
export function useGroupHierarchy({
  groups,
  textAnnotations,
  shapeAnnotations,
  onUpdateGroup,
  onUpdateTextAnnotation,
  onUpdateShapeAnnotation
}: UseGroupHierarchyOptions): UseGroupHierarchyReturn {
  // Query methods
  const getChildGroups = useCallback(
    (groupId: string): GroupStyleAnnotation[] => {
      return getChildrenUtil(groupId, groups);
    },
    [groups]
  );

  const getDescendantGroups = useCallback(
    (groupId: string): GroupStyleAnnotation[] => {
      return getDescendantsUtil(groupId, groups);
    },
    [groups]
  );

  const getAncestors = useCallback(
    (groupId: string): GroupStyleAnnotation[] => {
      return getAncestorGroups(groupId, groups);
    },
    [groups]
  );

  const getParentGroup = useCallback(
    (groupId: string): GroupStyleAnnotation | null => {
      return getParentUtil(groupId, groups);
    },
    [groups]
  );

  const getGroupDepth = useCallback(
    (groupId: string): number => {
      return getDepthUtil(groupId, groups);
    },
    [groups]
  );

  const isDescendantOf = useCallback(
    (groupId: string, potentialAncestorId: string): boolean => {
      const ancestors = getAncestorGroups(groupId, groups);
      return ancestors.some((a) => a.id === potentialAncestorId);
    },
    [groups]
  );

  // Annotation queries
  const getGroupAnnotations = useCallback(
    (groupId: string): { texts: FreeTextAnnotation[]; shapes: FreeShapeAnnotation[] } => {
      return getAnnotationsInGroup(groupId, textAnnotations, shapeAnnotations);
    },
    [textAnnotations, shapeAnnotations]
  );

  const getAllHierarchyAnnotations = useCallback(
    (groupId: string): { texts: FreeTextAnnotation[]; shapes: FreeShapeAnnotation[] } => {
      return getAllAnnotationsInHierarchy(groupId, groups, textAnnotations, shapeAnnotations);
    },
    [groups, textAnnotations, shapeAnnotations]
  );

  // Validation
  const canSetParent = useCallback(
    (groupId: string, proposedParentId: string | null): boolean => {
      return validateNoCircularReference(groupId, proposedParentId, groups);
    },
    [groups]
  );

  // Mutation methods
  const setGroupParent = useCallback(
    (groupId: string, parentId: string | null): boolean => {
      if (!canSetParent(groupId, parentId)) {
        console.warn(`Cannot set parent: would create circular reference`);
        return false;
      }

      if (onUpdateGroup) {
        onUpdateGroup(groupId, { parentId: parentId ?? undefined });
      }
      return true;
    },
    [canSetParent, onUpdateGroup]
  );

  const setAnnotationGroup = useCallback(
    (
      annotationId: string,
      annotationType: "freeText" | "freeShape",
      groupId: string | null
    ): void => {
      if (annotationType === "freeText" && onUpdateTextAnnotation) {
        onUpdateTextAnnotation(annotationId, { groupId: groupId ?? undefined });
      } else if (annotationType === "freeShape" && onUpdateShapeAnnotation) {
        onUpdateShapeAnnotation(annotationId, { groupId: groupId ?? undefined });
      }
    },
    [onUpdateTextAnnotation, onUpdateShapeAnnotation]
  );

  // Rendering helpers
  const getSortedGroups = useCallback((): GroupStyleAnnotation[] => {
    return sortGroupsByDepthThenZIndex(groups);
  }, [groups]);

  const calculateDragOffsets = useCallback(
    (rootGroupId: string, dx: number, dy: number): GroupDragOffset[] => {
      const offsets: GroupDragOffset[] = [];

      // Add offset for root group
      offsets.push({ groupId: rootGroupId, dx, dy });

      // Add offsets for all descendant groups
      const descendants = getDescendantsUtil(rootGroupId, groups);
      for (const descendant of descendants) {
        offsets.push({ groupId: descendant.id, dx, dy });
      }

      return offsets;
    },
    [groups]
  );

  // Hierarchy snapshot for undo/redo
  const captureHierarchyState = useCallback(
    (
      groupId: string
    ): {
      groups: GroupStyleAnnotation[];
      textAnnotations: FreeTextAnnotation[];
      shapeAnnotations: FreeShapeAnnotation[];
    } => {
      // Get the group and all descendants
      const rootGroup = groups.find((g) => g.id === groupId);
      if (!rootGroup) {
        return { groups: [], textAnnotations: [], shapeAnnotations: [] };
      }

      const descendantGroups = getDescendantsUtil(groupId, groups);

      // Get all annotations in the hierarchy
      const { texts, shapes } = getAllAnnotationsInHierarchy(
        groupId,
        groups,
        textAnnotations,
        shapeAnnotations
      );

      return {
        groups: [rootGroup, ...descendantGroups].map((g) => ({ ...g })),
        textAnnotations: texts.map((t) => ({ ...t })),
        shapeAnnotations: shapes.map((s) => ({ ...s }))
      };
    },
    [groups, textAnnotations, shapeAnnotations]
  );

  return {
    // Query methods
    getChildGroups,
    getDescendantGroups,
    getAncestorGroups: getAncestors,
    getParentGroup,
    getGroupDepth,
    isDescendantOf,

    // Annotation queries
    getAnnotationsInGroup: getGroupAnnotations,
    getAllAnnotationsInHierarchy: getAllHierarchyAnnotations,

    // Mutation methods
    setGroupParent,
    setAnnotationGroup,

    // Validation
    canSetParent,

    // Rendering helpers
    getSortedGroups,
    calculateDragOffsets,

    // Hierarchy snapshot
    captureHierarchyState
  };
}
