/**
 * Hook for drag-to-group functionality for annotations.
 * When an annotation is dragged and dropped inside a group, it becomes a member.
 * When dragged outside all groups, it's removed from its group.
 */
import { useCallback, useRef } from 'react';
import type { GroupStyleAnnotation } from '../../../shared/types/topology';
import { log } from '../../utils/logger';
import { findDeepestGroupAtPosition } from '../groups/hierarchyUtils';

export interface UseAnnotationReparentOptions {
  mode: 'edit' | 'view';
  isLocked: boolean;
  groups: GroupStyleAnnotation[];
  /** Callback to update annotation's groupId */
  onUpdateGroupId: (annotationId: string, groupId: string | undefined) => void;
}

export interface UseAnnotationReparentReturn {
  /** Call when annotation drag starts */
  onDragStart: (annotationId: string, currentGroupId: string | undefined) => void;
  /** Call when annotation drag ends */
  onDragEnd: (annotationId: string, finalPosition: { x: number; y: number }) => void;
}

/**
 * Hook for handling annotation reparenting via drag-drop.
 */
export function useAnnotationReparent(options: UseAnnotationReparentOptions): UseAnnotationReparentReturn {
  const { mode, isLocked, groups, onUpdateGroupId } = options;

  // Track the group the annotation was in when drag started
  const dragStartGroupRef = useRef<Map<string, string | undefined>>(new Map());

  const onDragStart = useCallback((annotationId: string, currentGroupId: string | undefined) => {
    if (mode === 'view' || isLocked) return;
    dragStartGroupRef.current.set(annotationId, currentGroupId);
  }, [mode, isLocked]);

  const onDragEnd = useCallback((annotationId: string, finalPosition: { x: number; y: number }) => {
    if (mode === 'view' || isLocked) return;

    const oldGroupId = dragStartGroupRef.current.get(annotationId);
    dragStartGroupRef.current.delete(annotationId);

    // Find the deepest group at the drop position
    const dropTarget = findDeepestGroupAtPosition(finalPosition, groups);
    const newGroupId = dropTarget?.id;

    // Only update if the group changed
    if (oldGroupId !== newGroupId) {
      onUpdateGroupId(annotationId, newGroupId);
      if (newGroupId) {
        log.info(`[AnnotationReparent] Annotation ${annotationId} added to group ${newGroupId}`);
      } else if (oldGroupId) {
        log.info(`[AnnotationReparent] Annotation ${annotationId} removed from group`);
      }
    }
  }, [mode, isLocked, groups, onUpdateGroupId]);

  return { onDragStart, onDragEnd };
}
