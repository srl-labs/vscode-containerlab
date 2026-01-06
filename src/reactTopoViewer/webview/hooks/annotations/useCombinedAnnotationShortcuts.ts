/**
 * Hook that combines free text + free shape annotation + group selection and clipboard shortcuts.
 * Extracted from App.tsx to keep App complexity low.
 */
import React from 'react';

import type { UseGroupClipboardReturn } from '../groups';
import { log } from '../../utils/logger';

import type { UseAppFreeTextAnnotationsReturn } from './useAppFreeTextAnnotations';
import type { UseFreeShapeAnnotationsReturn } from './freeShape';
import type { UseFreeShapeUndoRedoHandlersReturn } from './useFreeShapeUndoRedoHandlers';

export interface UseCombinedAnnotationShortcutsReturn {
  selectedAnnotationIds: Set<string>;
  copySelectedAnnotations: () => void;
  pasteAnnotations: () => void;
  duplicateSelectedAnnotations: () => void;
  deleteSelectedAnnotations: () => void;
  clearAnnotationSelection: () => void;
  hasAnnotationClipboard: () => boolean;
}

export interface GroupClipboardOptions {
  selectedGroupIds: Set<string>;
  groupClipboard: UseGroupClipboardReturn;
  deleteGroup: (groupId: string) => void;
  clearGroupSelection: () => void;
  getViewportCenter: () => { x: number; y: number };
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
  freeShapeUndoHandlers: Pick<UseFreeShapeUndoRedoHandlersReturn, 'deleteSelectedWithUndo'>,
  groupOptions?: GroupClipboardOptions
): UseCombinedAnnotationShortcutsReturn {
  // Use refs to ensure we always have the latest values in callbacks
  const groupOptionsRef = React.useRef(groupOptions);
  groupOptionsRef.current = groupOptions;

  // Combine all selections: freeText + freeShape + groups
  const selectedAnnotationIds = React.useMemo(() => {
    const combined = new Set<string>([
      ...freeTextAnnotations.selectedAnnotationIds,
      ...freeShapeAnnotations.selectedAnnotationIds
    ]);
    // Also include group IDs in the combined selection for keyboard shortcut detection
    if (groupOptions) {
      groupOptions.selectedGroupIds.forEach(id => combined.add(id));
    }
    return combined;
  }, [freeTextAnnotations.selectedAnnotationIds, freeShapeAnnotations.selectedAnnotationIds, groupOptions]);

  const copySelectedAnnotations = React.useCallback(() => {
    const opts = groupOptionsRef.current;
    log.info(`[CombinedAnnotations] Copy triggered. Groups selected: ${opts?.selectedGroupIds.size ?? 0}`);

    // Copy groups if any are selected
    if (opts && opts.selectedGroupIds.size > 0) {
      const groupIds = Array.from(opts.selectedGroupIds);
      log.info(`[CombinedAnnotations] Copying groups: ${groupIds.join(', ')}`);
      if (groupIds.length > 0) {
        const success = opts.groupClipboard.copyGroup(groupIds[0]);
        if (success) {
          log.info(`[CombinedAnnotations] Successfully copied group ${groupIds[0]}`);
          // Note: We do NOT deselect nodes here - let them be copied separately
          // by the graph clipboard. This allows all selected elements to be copied.
        } else {
          log.warn(`[CombinedAnnotations] Failed to copy group ${groupIds[0]}`);
        }
      }
    }
    // Also copy annotations (they have separate clipboards)
    freeTextAnnotations.copySelectedAnnotations();
    freeShapeAnnotations.copySelectedAnnotations();
  }, [freeTextAnnotations, freeShapeAnnotations]);

  const pasteAnnotations = React.useCallback(() => {
    const opts = groupOptionsRef.current;
    // Paste groups first if clipboard has group data
    if (opts && opts.groupClipboard.hasClipboardData()) {
      log.info('[CombinedAnnotations] Pasting group');
      const center = opts.getViewportCenter();
      opts.groupClipboard.pasteGroup(center);
    }
    // Also paste annotations (they have separate clipboards)
    pasteBoth(freeTextAnnotations, freeShapeAnnotations);
  }, [freeTextAnnotations, freeShapeAnnotations]);

  const duplicateSelectedAnnotations = React.useCallback(() => {
    const opts = groupOptionsRef.current;
    // Duplicate groups: copy then paste
    if (opts && opts.selectedGroupIds.size > 0) {
      const groupIds = Array.from(opts.selectedGroupIds);
      if (groupIds.length > 0) {
        opts.groupClipboard.copyGroup(groupIds[0]);
        const center = opts.getViewportCenter();
        opts.groupClipboard.pasteGroup(center);
      }
    }
    // Also duplicate annotations
    freeTextAnnotations.duplicateSelectedAnnotations();
    freeShapeAnnotations.duplicateSelectedAnnotations();
  }, [freeTextAnnotations, freeShapeAnnotations]);

  const deleteSelectedAnnotations = React.useCallback(() => {
    const opts = groupOptionsRef.current;
    // Delete groups if any are selected
    if (opts && opts.selectedGroupIds.size > 0) {
      const groupIds = Array.from(opts.selectedGroupIds);
      groupIds.forEach(id => opts.deleteGroup(id));
      opts.clearGroupSelection();
    }
    // Also delete annotations
    freeTextAnnotations.deleteSelectedAnnotations();
    freeShapeUndoHandlers.deleteSelectedWithUndo();
  }, [freeTextAnnotations, freeShapeUndoHandlers]);

  const clearAnnotationSelection = React.useCallback(() => {
    freeTextAnnotations.clearAnnotationSelection();
    freeShapeAnnotations.clearAnnotationSelection();
    // Also clear group selection
    const opts = groupOptionsRef.current;
    if (opts) {
      opts.clearGroupSelection();
    }
  }, [freeTextAnnotations, freeShapeAnnotations]);

  const hasAnnotationClipboard = React.useCallback(() => {
    const opts = groupOptionsRef.current;
    const hasGroupClipboard = opts?.groupClipboard.hasClipboardData() ?? false;
    return hasGroupClipboard || hasClipboardBoth(freeTextAnnotations, freeShapeAnnotations);
  }, [freeTextAnnotations, freeShapeAnnotations]);

  return {
    selectedAnnotationIds,
    copySelectedAnnotations,
    pasteAnnotations,
    duplicateSelectedAnnotations,
    deleteSelectedAnnotations,
    clearAnnotationSelection,
    hasAnnotationClipboard
  };
}

