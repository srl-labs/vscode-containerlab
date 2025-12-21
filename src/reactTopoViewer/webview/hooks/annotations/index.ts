/**
 * Annotations hooks barrel - re-exports from sub-barrels
 */

// Text annotations
export {
  useAppFreeTextAnnotations,
  useFreeTextAnnotationApplier,
  useFreeTextUndoRedoHandlers
} from './text';
export type {
  FreeTextAnnotation,
  UseFreeTextAnnotationsReturn
} from './text';

// Shape annotations
export {
  useAppFreeShapeAnnotations,
  useFreeShapeAnnotationApplier,
  useFreeShapeUndoRedoHandlers
} from './shapes';
export type {
  FreeShapeAnnotation,
  UseFreeShapeAnnotationsReturn
} from './shapes';

// Interactions
export {
  useShapeLayer
} from './interactions';

// Management
export {
  useAnnotationEffects,
  useAddShapesHandler,
  generateAnnotationId
} from './management';
