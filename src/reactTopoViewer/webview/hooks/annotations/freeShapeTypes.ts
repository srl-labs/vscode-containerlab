/**
 * Types for free shape annotations
 */
import type { Core as CyCore } from 'cytoscape';

import { FreeShapeAnnotation, GroupStyleAnnotation } from '../../../shared/types/topology';

export interface UseFreeShapeAnnotationsOptions {
  cy: CyCore | null;
  mode: 'edit' | 'view';
  isLocked: boolean;
  onLockedAction?: () => void;
  /** Optional: groups array for auto-assigning groupId when creating annotations */
  groups?: GroupStyleAnnotation[];
}

export interface UseFreeShapeAnnotationsReturn {
  annotations: FreeShapeAnnotation[];
  isAddShapeMode: boolean;
  pendingShapeType: FreeShapeAnnotation['shapeType'];
  /** The annotation currently being edited, or null */
  editingAnnotation: FreeShapeAnnotation | null;
  enableAddShapeMode: (shapeType?: FreeShapeAnnotation['shapeType']) => void;
  disableAddShapeMode: () => void;
  /** Handle canvas click when add-shape mode is active. Returns created annotation if any. */
  handleCanvasClick: (position: { x: number; y: number }) => FreeShapeAnnotation | null;
  /** Open an annotation for editing */
  editAnnotation: (id: string) => void;
  /** Close the editor */
  closeEditor: () => void;
  deleteAnnotation: (id: string) => void;
  /** Save or update an annotation (used by undo/redo) */
  saveAnnotation: (annotation: FreeShapeAnnotation) => void;
  updatePosition: (id: string, position: { x: number; y: number }) => void;
  updateSize: (id: string, width: number, height: number) => void;
  updateRotation: (id: string, rotation: number) => void;
  updateEndPosition: (id: string, endPosition: { x: number; y: number }) => void;
  /** Generic update for any annotation fields (used by group drag) */
  updateAnnotation: (id: string, updates: Partial<FreeShapeAnnotation>) => void;
  /** Update geo coordinates for an annotation */
  updateGeoPosition: (id: string, geoCoords: { lat: number; lng: number }) => void;
  /** Update end geo coordinates for a line annotation */
  updateEndGeoPosition: (id: string, geoCoords: { lat: number; lng: number }) => void;
  /** Migrate all annotations from one groupId to another (used when group is renamed) */
  migrateGroupId: (oldGroupId: string, newGroupId: string) => void;
  loadAnnotations: (annotations: FreeShapeAnnotation[]) => void;
  getUndoRedoAction: (before: FreeShapeAnnotation | null, after: FreeShapeAnnotation | null) => AnnotationUndoAction;
  /** IDs of currently selected annotations */
  selectedAnnotationIds: Set<string>;
  selectAnnotation: (id: string) => void;
  toggleAnnotationSelection: (id: string) => void;
  clearAnnotationSelection: () => void;
  deleteSelectedAnnotations: () => void;
  getSelectedAnnotations: () => FreeShapeAnnotation[];
  boxSelectAnnotations: (ids: string[]) => void;
  copySelectedAnnotations: () => void;
  pasteAnnotations: () => void;
  duplicateSelectedAnnotations: () => void;
  hasClipboardContent: () => boolean;
}

export interface AnnotationUndoAction {
  type: 'annotation';
  annotationType: 'freeShape';
  before: FreeShapeAnnotation | null;
  after: FreeShapeAnnotation | null;
  [key: string]: unknown;
}
