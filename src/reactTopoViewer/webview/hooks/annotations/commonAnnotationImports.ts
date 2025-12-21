/**
 * Common imports for annotation helper modules
 * Extracted to avoid code duplication
 */
import { generateAnnotationId } from './annotationIdUtils';
import {
  SAVE_DEBOUNCE_MS,
  PASTE_OFFSET,
  updateAnnotationInList,
  updateAnnotationRotation,
  saveAnnotationToList,
  duplicateAnnotations,
} from './sharedAnnotationHelpers';

export const generateId = generateAnnotationId;
export const genericUpdateInList = updateAnnotationInList;
export const genericUpdateRotation = updateAnnotationRotation;
export const genericSaveToList = saveAnnotationToList;
export const genericDuplicateAnnotations = duplicateAnnotations;
export { SAVE_DEBOUNCE_MS, PASTE_OFFSET };
