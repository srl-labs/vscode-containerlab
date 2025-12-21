/**
 * Annotations hooks barrel - exports all annotation-related hooks
 * Consolidated from: text/, shapes/, interactions/, management/ sub-directories
 */

// ============================================================================
// App-level hooks (main entry points for App.tsx)
// ============================================================================
export { useAppFreeTextAnnotations } from './useAppFreeTextAnnotations';
export type { UseAppFreeTextAnnotationsReturn } from './useAppFreeTextAnnotations';
export { useAppFreeShapeAnnotations, useAddShapesHandler } from './useAppFreeShapeAnnotations';

// ============================================================================
// Undo/Redo Handlers
// ============================================================================
export { useFreeTextUndoRedoHandlers, useFreeTextAnnotationApplier } from './useFreeTextUndoRedoHandlers';
export type { UseFreeTextAnnotationApplierReturn, UseFreeTextUndoRedoHandlersReturn } from './useFreeTextUndoRedoHandlers';
export { useFreeShapeUndoRedoHandlers, useFreeShapeAnnotationApplier } from './useFreeShapeUndoRedoHandlers';
export type { UseFreeShapeUndoRedoHandlersReturn, UseFreeShapeAnnotationApplierReturn } from './useFreeShapeUndoRedoHandlers';

// ============================================================================
// Types
// ============================================================================
export type {
  FreeTextAnnotation,
  UseFreeTextAnnotationsOptions,
  UseFreeTextAnnotationsReturn,
  AnnotationUndoAction
} from './freeText';

export type {
  FreeShapeAnnotation,
  UseFreeShapeAnnotationsOptions,
  UseFreeShapeAnnotationsReturn,
  AnnotationUndoAction as FreeShapeUndoAction
} from './freeShape';

// ============================================================================
// Layer Helpers (for FreeTextLayer)
// ============================================================================
export {
  modelToRendered,
  renderedToModel,
  modelToRenderedGeo,
  getCursorStyle,
  getBorderRadius,
  computeAnnotationStyle
} from './freeText';
export type { RenderedPosition } from './freeText';

// Shape Helpers (for FreeShapeLayer)
export { getLineCenter } from './freeShape';

// ============================================================================
// Interaction Hooks (drag, resize, rotation, selection)
// ============================================================================
export { useAnnotationDrag } from './useAnnotationDrag';
export { useRotationDrag, useResizeDrag, useLineResizeDrag } from './useAnnotationHandles';
export {
  useAnnotationClickHandlers,
  useLayerClickHandler,
  useAnnotationBoxSelection
} from './useAnnotationSelection';
export { useAnnotationInteractions } from './useAnnotationInteractions';
export { useShapeLayer } from './useShapeLayer';

// ============================================================================
// Management Hooks (list operations, shortcuts, effects)
// ============================================================================
export { useAnnotationListSelection, useAnnotationListCopyPaste, getSelectedByIds } from './useAnnotationListOperations';
export type { AnnotationWithId, UseAnnotationListSelectionReturn, UseAnnotationListCopyPasteReturn } from './useAnnotationListOperations';
export { useCombinedAnnotationShortcuts } from './useCombinedAnnotationShortcuts';
export type { UseCombinedAnnotationShortcutsReturn, GroupClipboardOptions } from './useCombinedAnnotationShortcuts';
export { useAnnotationEffects } from './useAnnotationEffects';
export { useAnnotationReparent } from './useAnnotationReparent';
export type { UseAnnotationReparentOptions, UseAnnotationReparentReturn } from './useAnnotationReparent';
export { generateAnnotationId, useDebouncedSave } from './sharedAnnotationHelpers';
export type { UseDebouncedSaveReturn } from './sharedAnnotationHelpers';
