/**
 * Types for free text annotations
 */
import type { Core as CyCore } from 'cytoscape';

import type { FreeTextAnnotation, GroupStyleAnnotation } from '../../../shared/types/topology';

// Re-export FreeTextAnnotation for consumers
export type { FreeTextAnnotation };

export interface UseFreeTextAnnotationsOptions {
  cy: CyCore | null;
  mode: 'edit' | 'view';
  isLocked: boolean;
  onLockedAction?: () => void;
  /** Optional: groups array for auto-assigning groupId when creating annotations */
  groups?: GroupStyleAnnotation[];
}

/** Shared interface for action methods on annotations */
export interface AnnotationActionMethods {
  closeEditor: () => void;
  saveAnnotation: (annotation: FreeTextAnnotation) => void;
  deleteAnnotation: (id: string) => void;
  updatePosition: (id: string, position: { x: number; y: number }) => void;
  updateSize: (id: string, width: number, height: number) => void;
  updateRotation: (id: string, rotation: number) => void;
  /** Generic update for any annotation fields (used by group drag) */
  updateAnnotation: (id: string, updates: Partial<FreeTextAnnotation>) => void;
  /** Update geo coordinates for an annotation */
  updateGeoPosition: (id: string, geoCoords: { lat: number; lng: number }) => void;
  /** Migrate all annotations from one groupId to another (used when group is renamed) */
  migrateGroupId: (oldGroupId: string, newGroupId: string) => void;
  loadAnnotations: (annotations: FreeTextAnnotation[]) => void;
}

/** Shared interface for selection and clipboard methods */
export interface AnnotationSelectionMethods {
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
  /** Duplicate selected annotations */
  duplicateSelectedAnnotations: () => void;
  /** Check if clipboard has annotations */
  hasClipboardContent: () => boolean;
}

export interface UseFreeTextAnnotationsReturn extends AnnotationActionMethods, AnnotationSelectionMethods {
  annotations: FreeTextAnnotation[];
  editingAnnotation: FreeTextAnnotation | null;
  isAddTextMode: boolean;
  enableAddTextMode: () => void;
  disableAddTextMode: () => void;
  handleCanvasClick: (position: { x: number; y: number }) => void;
  editAnnotation: (id: string) => void;
  getUndoRedoAction: (before: FreeTextAnnotation | null, after: FreeTextAnnotation | null) => AnnotationUndoAction;
}

export interface AnnotationUndoAction {
  type: 'annotation';
  annotationType: 'freeText';
  before: FreeTextAnnotation | null;
  after: FreeTextAnnotation | null;
  [key: string]: unknown;
}
