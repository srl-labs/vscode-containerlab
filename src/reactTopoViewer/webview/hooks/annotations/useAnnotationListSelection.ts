import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { log } from '../../utils/logger';

export type AnnotationWithId = { id: string };

export interface UseAnnotationListSelectionReturn<T extends AnnotationWithId> {
  selectAnnotation: (id: string) => void;
  toggleAnnotationSelection: (id: string) => void;
  clearAnnotationSelection: () => void;
  deleteSelectedAnnotations: () => void;
  boxSelectAnnotations: (ids: string[]) => void;
  getSelectedAnnotations: () => T[];
}

export function getSelectedByIds<T extends AnnotationWithId>(
  annotations: T[],
  ids: Set<string>
): T[] {
  return annotations.filter((a) => ids.has(a.id));
}

export function useAnnotationListSelection<T extends AnnotationWithId>(params: {
  logPrefix: string;
  annotations: T[];
  setAnnotations: Dispatch<SetStateAction<T[]>>;
  selectedAnnotationIds: Set<string>;
  setSelectedAnnotationIds: Dispatch<SetStateAction<Set<string>>>;
  saveAnnotationsToExtension: (annotations: T[]) => void;
}): UseAnnotationListSelectionReturn<T> {
  const {
    logPrefix,
    annotations,
    setAnnotations,
    selectedAnnotationIds,
    setSelectedAnnotationIds,
    saveAnnotationsToExtension,
  } = params;

  const selectAnnotation = useCallback((id: string) => {
    setSelectedAnnotationIds(new Set([id]));
    log.info(`[${logPrefix}] Selected annotation: ${id}`);
  }, [logPrefix, setSelectedAnnotationIds]);

  const toggleAnnotationSelection = useCallback((id: string) => {
    setSelectedAnnotationIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        log.info(`[${logPrefix}] Deselected annotation: ${id}`);
      } else {
        next.add(id);
        log.info(`[${logPrefix}] Added annotation to selection: ${id}`);
      }
      return next;
    });
  }, [logPrefix, setSelectedAnnotationIds]);

  const clearAnnotationSelection = useCallback(() => {
    setSelectedAnnotationIds(new Set());
    log.info(`[${logPrefix}] Cleared annotation selection`);
  }, [logPrefix, setSelectedAnnotationIds]);

  const boxSelectAnnotations = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    setSelectedAnnotationIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
    log.info(`[${logPrefix}] Box selected ${ids.length} annotations`);
  }, [logPrefix, setSelectedAnnotationIds]);

  const deleteSelectedAnnotations = useCallback(() => {
    if (selectedAnnotationIds.size === 0) return;
    setAnnotations((prev) => {
      const updated = prev.filter((a) => !selectedAnnotationIds.has(a.id));
      saveAnnotationsToExtension(updated);
      return updated;
    });
    log.info(`[${logPrefix}] Deleted ${selectedAnnotationIds.size} selected annotations`);
    setSelectedAnnotationIds(new Set());
  }, [logPrefix, saveAnnotationsToExtension, selectedAnnotationIds, setAnnotations, setSelectedAnnotationIds]);

  const getSelectedAnnotations = useCallback(() => {
    return getSelectedByIds(annotations, selectedAnnotationIds);
  }, [annotations, selectedAnnotationIds]);

  return {
    selectAnnotation,
    toggleAnnotationSelection,
    clearAnnotationSelection,
    boxSelectAnnotations,
    deleteSelectedAnnotations,
    getSelectedAnnotations,
  };
}
