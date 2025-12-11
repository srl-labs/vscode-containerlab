/**
 * Types for free text annotations
 */
import type { Core as CyCore } from 'cytoscape';
import { FreeTextAnnotation } from '../../../shared/types/topology';

export interface UseFreeTextAnnotationsOptions {
  cy: CyCore | null;
  mode: 'edit' | 'view';
  isLocked: boolean;
  onLockedAction?: () => void;
}

export interface UseFreeTextAnnotationsReturn {
  annotations: FreeTextAnnotation[];
  editingAnnotation: FreeTextAnnotation | null;
  isAddTextMode: boolean;
  enableAddTextMode: () => void;
  disableAddTextMode: () => void;
  handleCanvasClick: (position: { x: number; y: number }) => void;
  editAnnotation: (id: string) => void;
  closeEditor: () => void;
  saveAnnotation: (annotation: FreeTextAnnotation) => void;
  deleteAnnotation: (id: string) => void;
  updatePosition: (id: string, position: { x: number; y: number }) => void;
  updateSize: (id: string, width: number, height: number) => void;
  updateRotation: (id: string, rotation: number) => void;
  loadAnnotations: (annotations: FreeTextAnnotation[]) => void;
  getUndoRedoAction: (before: FreeTextAnnotation | null, after: FreeTextAnnotation | null) => AnnotationUndoAction;
  /** IDs of currently selected annotations */
  selectedAnnotationIds: Set<string>;
  /** Select a single annotation (clears existing selection) */
  selectAnnotation: (id: string) => void;
  /** Toggle annotation selection (Ctrl+click behavior) */
  toggleAnnotationSelection: (id: string) => void;
  /** Clear all annotation selection */
  clearAnnotationSelection: () => void;
  /** Delete all selected annotations */
  deleteSelectedAnnotations: () => void;
  /** Get selected annotations */
  getSelectedAnnotations: () => FreeTextAnnotation[];
  /** Box select multiple annotations (adds to existing selection) */
  boxSelectAnnotations: (ids: string[]) => void;
  /** Copy selected annotations to clipboard */
  copySelectedAnnotations: () => void;
  /** Paste annotations from clipboard */
  pasteAnnotations: () => void;
  /** Cut selected annotations (copy and delete) */
  cutSelectedAnnotations: () => void;
  /** Duplicate selected annotations */
  duplicateSelectedAnnotations: () => void;
  /** Check if clipboard has annotations */
  hasClipboardContent: () => boolean;
}

export interface AnnotationUndoAction {
  type: 'annotation';
  annotationType: 'freeText';
  before: FreeTextAnnotation | null;
  after: FreeTextAnnotation | null;
}
