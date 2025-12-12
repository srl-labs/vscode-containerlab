/**
 * Hook that combines free text + free shape annotation selection and clipboard shortcuts.
 * Extracted from App.tsx to keep App complexity low.
 */
import React from 'react';
import type { UseAppFreeTextAnnotationsReturn } from './useAppFreeTextAnnotations';
import type { UseFreeShapeAnnotationsReturn } from './freeShapeTypes';
import type { UseFreeShapeUndoRedoHandlersReturn } from './useFreeShapeUndoRedoHandlers';

export interface UseCombinedAnnotationShortcutsReturn {
  selectedAnnotationIds: Set<string>;
  copySelectedAnnotations: () => void;
  pasteAnnotations: () => void;
  cutSelectedAnnotations: () => void;
  duplicateSelectedAnnotations: () => void;
  deleteSelectedAnnotations: () => void;
  clearAnnotationSelection: () => void;
  hasAnnotationClipboard: () => boolean;
}

function pasteBoth(
  freeText: Pick<UseAppFreeTextAnnotationsReturn, 'hasClipboardContent' | 'pasteAnnotations'>,
  freeShape: Pick<UseFreeShapeAnnotationsReturn, 'hasClipboardContent' | 'pasteAnnotations'>
): void {
  if (freeText.hasClipboardContent()) freeText.pasteAnnotations();
  if (freeShape.hasClipboardContent()) freeShape.pasteAnnotations();
}

function hasClipboardBoth(
  freeText: Pick<UseAppFreeTextAnnotationsReturn, 'hasClipboardContent'>,
  freeShape: Pick<UseFreeShapeAnnotationsReturn, 'hasClipboardContent'>
): boolean {
  return freeText.hasClipboardContent() || freeShape.hasClipboardContent();
}

export function useCombinedAnnotationShortcuts(
  freeTextAnnotations: UseAppFreeTextAnnotationsReturn,
  freeShapeAnnotations: UseFreeShapeAnnotationsReturn,
  freeShapeUndoHandlers: Pick<UseFreeShapeUndoRedoHandlersReturn, 'cutSelectedWithUndo' | 'deleteSelectedWithUndo'>
): UseCombinedAnnotationShortcutsReturn {
  const selectedAnnotationIds = React.useMemo(() => {
    return new Set<string>([
      ...freeTextAnnotations.selectedAnnotationIds,
      ...freeShapeAnnotations.selectedAnnotationIds
    ]);
  }, [freeTextAnnotations.selectedAnnotationIds, freeShapeAnnotations.selectedAnnotationIds]);

  const copySelectedAnnotations = React.useCallback(() => {
    freeTextAnnotations.copySelectedAnnotations();
    freeShapeAnnotations.copySelectedAnnotations();
  }, [freeTextAnnotations, freeShapeAnnotations]);

  const pasteAnnotations = React.useCallback(() => {
    pasteBoth(freeTextAnnotations, freeShapeAnnotations);
  }, [freeTextAnnotations, freeShapeAnnotations]);

  const cutSelectedAnnotations = React.useCallback(() => {
    freeTextAnnotations.cutSelectedAnnotations();
    freeShapeUndoHandlers.cutSelectedWithUndo();
  }, [freeTextAnnotations, freeShapeUndoHandlers]);

  const duplicateSelectedAnnotations = React.useCallback(() => {
    freeTextAnnotations.duplicateSelectedAnnotations();
    freeShapeAnnotations.duplicateSelectedAnnotations();
  }, [freeTextAnnotations, freeShapeAnnotations]);

  const deleteSelectedAnnotations = React.useCallback(() => {
    freeTextAnnotations.deleteSelectedAnnotations();
    freeShapeUndoHandlers.deleteSelectedWithUndo();
  }, [freeTextAnnotations, freeShapeUndoHandlers]);

  const clearAnnotationSelection = React.useCallback(() => {
    freeTextAnnotations.clearAnnotationSelection();
    freeShapeAnnotations.clearAnnotationSelection();
  }, [freeTextAnnotations, freeShapeAnnotations]);

  const hasAnnotationClipboard = React.useCallback(() => {
    return hasClipboardBoth(freeTextAnnotations, freeShapeAnnotations);
  }, [freeTextAnnotations, freeShapeAnnotations]);

  return {
    selectedAnnotationIds,
    copySelectedAnnotations,
    pasteAnnotations,
    cutSelectedAnnotations,
    duplicateSelectedAnnotations,
    deleteSelectedAnnotations,
    clearAnnotationSelection,
    hasAnnotationClipboard
  };
}

