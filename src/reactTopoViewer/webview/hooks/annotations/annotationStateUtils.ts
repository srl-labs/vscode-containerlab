/**
 * Shared utilities for annotation state management (FreeShape and FreeText)
 * These factory functions create common callback patterns to reduce code duplication
 */
import type React from 'react';
import { useCallback } from 'react';

import { log } from '../../utils/logger';

/**
 * Generic annotation type with minimal required fields for these utilities
 */
interface BaseAnnotation {
  id: string;
  groupId?: string;
}

/**
 * Creates a delete annotation callback
 */
export function useDeleteAnnotation<T extends BaseAnnotation>(
  logPrefix: string,
  setAnnotations: React.Dispatch<React.SetStateAction<T[]>>,
  saveAnnotationsToExtension: (annotations: T[]) => void
) {
  return useCallback((id: string) => {
    setAnnotations(prev => {
      const updated = prev.filter(a => a.id !== id);
      saveAnnotationsToExtension(updated);
      return updated;
    });
    log.info(`[${logPrefix}] Deleted annotation: ${id}`);
  }, [setAnnotations, saveAnnotationsToExtension]);
}

/**
 * Creates standard position/size/rotation update callbacks
 */
export function useStandardUpdates<T extends BaseAnnotation>(
  setAnnotations: React.Dispatch<React.SetStateAction<T[]>>,
  saveAnnotationsToExtension: (annotations: T[]) => void,
  updateAnnotationInList: (
    annotations: T[],
    id: string,
    updater: (annotation: T) => T
  ) => T[],
  updateAnnotationPosition: (annotation: T, position: { x: number; y: number }) => T,
  updateAnnotationRotation: (annotation: T, rotation: number) => T
) {
  const updatePosition = useCallback((id: string, position: { x: number; y: number }) => {
    setAnnotations(prev => {
      const updated = updateAnnotationInList(prev, id, a => updateAnnotationPosition(a, position));
      saveAnnotationsToExtension(updated);
      return updated;
    });
  }, [setAnnotations, saveAnnotationsToExtension, updateAnnotationInList, updateAnnotationPosition]);

  const updateSize = useCallback((id: string, width: number, height: number) => {
    setAnnotations(prev => {
      const updated = updateAnnotationInList(prev, id, a => ({ ...a, width, height } as T));
      saveAnnotationsToExtension(updated);
      return updated;
    });
  }, [setAnnotations, saveAnnotationsToExtension, updateAnnotationInList]);

  const updateRotation = useCallback((id: string, rotation: number) => {
    setAnnotations(prev => {
      const updated = updateAnnotationInList(prev, id, a => updateAnnotationRotation(a, rotation));
      saveAnnotationsToExtension(updated);
      return updated;
    });
  }, [setAnnotations, saveAnnotationsToExtension, updateAnnotationInList, updateAnnotationRotation]);

  return { updatePosition, updateSize, updateRotation };
}

/**
 * Creates generic annotation update and group migration callbacks
 */
export function useGenericAnnotationUpdates<T extends BaseAnnotation>(
  logPrefix: string,
  setAnnotations: React.Dispatch<React.SetStateAction<T[]>>,
  saveAnnotationsToExtension: (annotations: T[]) => void,
  updateAnnotationInList: (
    annotations: T[],
    id: string,
    updater: (annotation: T) => T
  ) => T[]
) {
  const updateAnnotation = useCallback((id: string, updates: Partial<T>) => {
    setAnnotations(prev => {
      const updated = updateAnnotationInList(prev, id, a => ({ ...a, ...updates }));
      saveAnnotationsToExtension(updated);
      return updated;
    });
  }, [setAnnotations, saveAnnotationsToExtension, updateAnnotationInList]);

  const migrateGroupId = useCallback((oldGroupId: string, newGroupId: string) => {
    setAnnotations(prev => {
      const updated = prev.map(a =>
        a.groupId === oldGroupId ? { ...a, groupId: newGroupId } : a
      );
      // Only save if something actually changed
      const hasChanges = updated.some((a, i) => a !== prev[i]);
      if (hasChanges) {
        saveAnnotationsToExtension(updated);
        log.info(`[${logPrefix}] Migrated annotations from group ${oldGroupId} to ${newGroupId}`);
      }
      return updated;
    });
  }, [setAnnotations, saveAnnotationsToExtension]);

  return { updateAnnotation, migrateGroupId };
}
