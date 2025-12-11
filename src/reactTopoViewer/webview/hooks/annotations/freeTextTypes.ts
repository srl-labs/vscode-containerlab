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
}

export interface AnnotationUndoAction {
  type: 'annotation';
  annotationType: 'freeText';
  before: FreeTextAnnotation | null;
  after: FreeTextAnnotation | null;
}
