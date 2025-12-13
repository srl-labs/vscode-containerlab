/**
 * Annotation hooks for React TopoViewer
 */
export * from './useFreeTextAnnotations';
export * from './freeTextTypes';
export * from './freeTextHelpers';
export * from './useFreeTextState';
export * from './useAppFreeTextAnnotations';
export { useFreeShapeAnnotations } from './useFreeShapeAnnotations';
export { useAppFreeShapeAnnotations } from './useAppFreeShapeAnnotations';
export { useFreeShapeUndoRedoHandlers, useFreeShapeAnnotationApplier } from './useFreeShapeUndoRedoHandlers';
export { useCombinedAnnotationShortcuts } from './useCombinedAnnotationShortcuts';
export * from './useAnnotationGroupMove';
export * from './useAnnotationBackgroundClear';
export * from './useAddShapesHandler';
export * from './useAnnotationEffects';

// Annotation interaction hooks (moved from components/annotations/)
export { useAnnotationDrag } from './useAnnotationDrag';
export { useRotationDrag, useResizeDrag } from './useAnnotationHandles';
