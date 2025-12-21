/**
 * Free shape annotation hooks, types, and helpers
 */

// Core hooks
export { useFreeShapeAnnotations } from '../useFreeShapeAnnotations';
export { useAppFreeShapeAnnotations } from '../useAppFreeShapeAnnotations';
export { useFreeShapeUndoRedoHandlers, useFreeShapeAnnotationApplier } from '../useFreeShapeUndoRedoHandlers';
export type {
  UseFreeShapeUndoRedoHandlersReturn,
  UseFreeShapeAnnotationApplierReturn
} from '../useFreeShapeUndoRedoHandlers';

// Types
export type {
  UseFreeShapeAnnotationsOptions,
  UseFreeShapeAnnotationsReturn,
  AnnotationUndoAction as FreeShapeUndoAction
} from '../freeShapeTypes';

// Helpers
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
} from '../freeShapeHelpers';

// State hooks
export { useFreeShapeState, useFreeShapeActions } from '../useFreeShapeState';
export type {
  UseFreeShapeStateReturn,
  UseFreeShapeActionsOptions,
  UseFreeShapeActionsReturn
} from '../useFreeShapeState';
