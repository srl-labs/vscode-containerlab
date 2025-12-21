/**
 * Annotation management hooks for list operations, shortcuts, and effects
 */

// List selection
export { useAnnotationListSelection, getSelectedByIds } from '../useAnnotationListSelection';
export type { AnnotationWithId, UseAnnotationListSelectionReturn } from '../useAnnotationListSelection';

// Copy/paste
export { useAnnotationListCopyPaste } from '../useAnnotationListCopyPaste';
export type { UseAnnotationListCopyPasteReturn } from '../useAnnotationListCopyPaste';

// Combined shortcuts
export { useCombinedAnnotationShortcuts } from '../useCombinedAnnotationShortcuts';
export type { UseCombinedAnnotationShortcutsReturn, GroupClipboardOptions } from '../useCombinedAnnotationShortcuts';

// Group move
export { useAnnotationGroupMove } from '../useAnnotationGroupMove';

// Background clear
export { useAnnotationBackgroundClear } from '../useAnnotationBackgroundClear';

// Add shapes handler
export { useAddShapesHandler } from '../useAddShapesHandler';

// Effects
export { useAnnotationEffects } from '../useAnnotationEffects';

// Reparent
export { useAnnotationReparent } from '../useAnnotationReparent';
export type { UseAnnotationReparentOptions, UseAnnotationReparentReturn } from '../useAnnotationReparent';

// ID utilities
export { generateAnnotationId } from '../annotationIdUtils';

// Debounced save
export { useDebouncedSave } from '../useDebouncedSave';
export type { UseDebouncedSaveReturn } from '../useDebouncedSave';
