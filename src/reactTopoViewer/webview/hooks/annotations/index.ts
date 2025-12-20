/**
 * Annotation hooks for React TopoViewer
 */

// Free text annotation hooks
export { useFreeTextAnnotations } from './useFreeTextAnnotations';
export type { UseFreeTextAnnotationsOptions, UseFreeTextAnnotationsReturn, AnnotationUndoAction } from './freeTextTypes';
export { useAppFreeTextAnnotations } from './useAppFreeTextAnnotations';
export type { UseAppFreeTextAnnotationsReturn } from './useAppFreeTextAnnotations';
export { useFreeTextUndoRedoHandlers, useFreeTextAnnotationApplier } from './useFreeTextUndoRedoHandlers';
export type { UseFreeTextAnnotationApplierReturn, UseFreeTextUndoRedoHandlersReturn } from './useFreeTextUndoRedoHandlers';

// Free text types
export type { FreeTextAnnotation } from './freeTextTypes';

// Free text helpers
export {
  DEFAULT_FONT_SIZE,
  DEFAULT_FONT_COLOR,
  DEFAULT_BACKGROUND_COLOR,
  SAVE_DEBOUNCE_MS as FREETEXT_SAVE_DEBOUNCE_MS,
  generateAnnotationId as generateFreeTextAnnotationId,
  createDefaultAnnotation as createDefaultFreeTextAnnotation,
  extractStyleFromAnnotation as extractFreeTextStyle,
  updateAnnotationInList as updateFreeTextInList,
  updateAnnotationPosition as updateFreeTextPosition,
  updateAnnotationRotation as updateFreeTextRotation,
  saveAnnotationToList as saveFreeTextToList,
  duplicateAnnotation as duplicateFreeTextAnnotation,
  duplicateAnnotations as duplicateFreeTextAnnotations
} from './freeTextHelpers';

// Free text state
export { useFreeTextState, useFreeTextActions } from './useFreeTextState';
export type {
  UseFreeTextStateReturn,
  UseFreeTextActionsOptions,
  UseFreeTextActionsReturn
} from './useFreeTextState';

// Free text layer helpers
export {
  modelToRendered,
  renderedToModel,
  modelToRenderedGeo,
  getCursorStyle,
  getBorderRadius,
  computeAnnotationStyle
} from './freeTextLayerHelpers';
export type { RenderedPosition } from './freeTextLayerHelpers';

// Free shape annotation hooks
export { useFreeShapeAnnotations } from './useFreeShapeAnnotations';
export { useAppFreeShapeAnnotations } from './useAppFreeShapeAnnotations';
export { useFreeShapeUndoRedoHandlers, useFreeShapeAnnotationApplier } from './useFreeShapeUndoRedoHandlers';
export type {
  UseFreeShapeUndoRedoHandlersReturn,
  UseFreeShapeAnnotationApplierReturn
} from './useFreeShapeUndoRedoHandlers';

// Free shape types
export type {
  UseFreeShapeAnnotationsOptions,
  UseFreeShapeAnnotationsReturn,
  AnnotationUndoAction as FreeShapeUndoAction
} from './freeShapeTypes';

// Free shape helpers
export {
  DEFAULT_SHAPE_WIDTH,
  DEFAULT_SHAPE_HEIGHT,
  DEFAULT_LINE_LENGTH,
  DEFAULT_FILL_COLOR,
  DEFAULT_FILL_OPACITY,
  DEFAULT_BORDER_COLOR,
  DEFAULT_BORDER_WIDTH,
  DEFAULT_BORDER_STYLE,
  DEFAULT_ARROW_SIZE,
  DEFAULT_CORNER_RADIUS,
  MIN_SHAPE_SIZE,
  SAVE_DEBOUNCE_MS as FREESHAPE_SAVE_DEBOUNCE_MS,
  generateAnnotationId as generateFreeShapeAnnotationId,
  getLineCenter,
  createDefaultAnnotation as createDefaultFreeShapeAnnotation,
  extractStyleFromAnnotation as extractFreeShapeStyle,
  updateAnnotationInList as updateFreeShapeInList,
  updateAnnotationRotation as updateFreeShapeRotation,
  updateAnnotationPosition as updateFreeShapePosition,
  updateAnnotationEndPosition,
  saveAnnotationToList as saveFreeShapeToList,
  duplicateAnnotation as duplicateFreeShapeAnnotation,
  duplicateAnnotations as duplicateFreeShapeAnnotations
} from './freeShapeHelpers';

// Free shape state
export { useFreeShapeState, useFreeShapeActions } from './useFreeShapeState';
export type {
  UseFreeShapeStateReturn,
  UseFreeShapeActionsOptions,
  UseFreeShapeActionsReturn
} from './useFreeShapeState';

// Annotation interaction hooks
export { useAnnotationDrag } from './useAnnotationDrag';
export { useRotationDrag, useResizeDrag } from './useAnnotationHandles';
export { useLineResizeDrag } from './useLineResize';
export {
  useAnnotationClickHandlers,
  useLayerClickHandler,
  useAnnotationBoxSelection
} from './useAnnotationSelection';
export { useAnnotationInteractions } from './useAnnotationInteractions';
export { useShapeLayer } from './useShapeLayer';

// Annotation list helpers
export { useAnnotationListSelection, getSelectedByIds } from './useAnnotationListSelection';
export type { AnnotationWithId, UseAnnotationListSelectionReturn } from './useAnnotationListSelection';
export { useAnnotationListCopyPaste } from './useAnnotationListCopyPaste';
export type { UseAnnotationListCopyPasteReturn } from './useAnnotationListCopyPaste';

// Common annotation hooks
export { useCombinedAnnotationShortcuts } from './useCombinedAnnotationShortcuts';
export type { UseCombinedAnnotationShortcutsReturn, GroupClipboardOptions } from './useCombinedAnnotationShortcuts';
export { useAnnotationGroupMove } from './useAnnotationGroupMove';
export { useAnnotationBackgroundClear } from './useAnnotationBackgroundClear';
export { useAddShapesHandler } from './useAddShapesHandler';
export { useAnnotationEffects } from './useAnnotationEffects';
export { useAnnotationReparent } from './useAnnotationReparent';
export type { UseAnnotationReparentOptions, UseAnnotationReparentReturn } from './useAnnotationReparent';

// Annotation ID utilities
export { generateAnnotationId } from './annotationIdUtils';

// Debounced save hook
export { useDebouncedSave } from './useDebouncedSave';
export type { UseDebouncedSaveReturn } from './useDebouncedSave';
