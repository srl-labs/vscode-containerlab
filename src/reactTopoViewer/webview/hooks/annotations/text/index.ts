/**
 * Free text annotation hooks, types, and helpers
 */

// Core hooks
export { useFreeTextAnnotations } from '../useFreeTextAnnotations';
export { useAppFreeTextAnnotations } from '../useAppFreeTextAnnotations';
export type { UseAppFreeTextAnnotationsReturn } from '../useAppFreeTextAnnotations';
export { useFreeTextUndoRedoHandlers, useFreeTextAnnotationApplier } from '../useFreeTextUndoRedoHandlers';
export type { UseFreeTextAnnotationApplierReturn, UseFreeTextUndoRedoHandlersReturn } from '../useFreeTextUndoRedoHandlers';

// Types
export type {
  FreeTextAnnotation,
  UseFreeTextAnnotationsOptions,
  UseFreeTextAnnotationsReturn,
  AnnotationUndoAction
} from '../freeTextTypes';

// Helpers
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
} from '../freeTextHelpers';

// State hooks
export { useFreeTextState, useFreeTextActions } from '../useFreeTextState';
export type {
  UseFreeTextStateReturn,
  UseFreeTextActionsOptions,
  UseFreeTextActionsReturn
} from '../useFreeTextState';

// Layer helpers
export {
  modelToRendered,
  renderedToModel,
  modelToRenderedGeo,
  getCursorStyle,
  getBorderRadius,
  computeAnnotationStyle
} from '../freeTextLayerHelpers';
export type { RenderedPosition } from '../freeTextLayerHelpers';
