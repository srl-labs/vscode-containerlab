import { useCallback } from 'react';
import type { Dispatch, SetStateAction, RefObject } from 'react';
import { log } from '../../utils/logger';
import { AnnotationWithId, getSelectedByIds } from './useAnnotationListSelection';

export interface UseAnnotationListCopyPasteReturn {
  copySelectedAnnotations: () => void;
  pasteAnnotations: () => void;
  duplicateSelectedAnnotations: () => void;
  hasClipboardContent: () => boolean;
}

export function useAnnotationListCopyPaste<T extends AnnotationWithId>(params: {
  logPrefix: string;
  annotations: T[];
  setAnnotations: Dispatch<SetStateAction<T[]>>;
  selectedAnnotationIds: Set<string>;
  setSelectedAnnotationIds: Dispatch<SetStateAction<Set<string>>>;
  clipboardRef: RefObject<T[]>;
  pasteCounterRef: RefObject<number>;
  duplicateAnnotations: (annotations: T[], pasteCounter: number) => T[];
  saveAnnotationsToExtension: (annotations: T[]) => void;
  saveAnnotationsImmediate: (annotations: T[]) => void;
}): UseAnnotationListCopyPasteReturn {
  const {
    logPrefix,
    annotations,
    setAnnotations,
    selectedAnnotationIds,
    setSelectedAnnotationIds,
    clipboardRef,
    pasteCounterRef,
    duplicateAnnotations,
    saveAnnotationsToExtension,
    saveAnnotationsImmediate,
  } = params;

  const copySelectedAnnotations = useCallback(() => {
    const selected = getSelectedByIds(annotations, selectedAnnotationIds);
    if (selected.length === 0) return;
    clipboardRef.current = selected;
    pasteCounterRef.current = 0;
    log.info(`[${logPrefix}] Copied ${selected.length} annotations to clipboard`);
  }, [annotations, clipboardRef, logPrefix, pasteCounterRef, selectedAnnotationIds]);

  const pasteAnnotations = useCallback(() => {
    if (!clipboardRef.current || clipboardRef.current.length === 0) return;
    const duplicated = duplicateAnnotations(clipboardRef.current, pasteCounterRef.current);
    pasteCounterRef.current++;
    setAnnotations((prev) => {
      const updated = [...prev, ...duplicated];
      saveAnnotationsImmediate(updated);
      return updated;
    });
    setSelectedAnnotationIds(new Set(duplicated.map((a) => a.id)));
    log.info(`[${logPrefix}] Pasted ${duplicated.length} annotations`);
  }, [
    clipboardRef,
    duplicateAnnotations,
    logPrefix,
    pasteCounterRef,
    saveAnnotationsImmediate,
    setAnnotations,
    setSelectedAnnotationIds,
  ]);

  const duplicateSelectedAnnotations = useCallback(() => {
    const selected = getSelectedByIds(annotations, selectedAnnotationIds);
    if (selected.length === 0) return;
    const duplicated = duplicateAnnotations(selected, 0);
    setAnnotations((prev) => {
      const updated = [...prev, ...duplicated];
      saveAnnotationsToExtension(updated);
      return updated;
    });
    setSelectedAnnotationIds(new Set(duplicated.map((a) => a.id)));
    log.info(`[${logPrefix}] Duplicated ${duplicated.length} annotations`);
  }, [
    annotations,
    duplicateAnnotations,
    logPrefix,
    saveAnnotationsToExtension,
    selectedAnnotationIds,
    setAnnotations,
    setSelectedAnnotationIds,
  ]);

  const hasClipboardContent = useCallback(() => {
    return clipboardRef.current && clipboardRef.current.length > 0;
  }, [clipboardRef]);

  return {
    copySelectedAnnotations,
    pasteAnnotations,
    duplicateSelectedAnnotations,
    hasClipboardContent,
  };
}
