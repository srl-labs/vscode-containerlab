/**
 * annotationUIStore - Zustand store for annotation UI state
 *
 * This store manages annotation-specific UI state like selections and editing.
 * Annotation data is derived from graphStore via useDerivedAnnotations hook.
 */
import { createWithEqualityFn } from "zustand/traditional";
import { shallow } from "zustand/shallow";

import type {
  FreeTextAnnotation,
  FreeShapeAnnotation,
  TrafficRateAnnotation
} from "../../shared/types/topology";
import type { GroupEditorData } from "../hooks/canvas/groupTypes";

// ============================================================================
// Types
// ============================================================================

type ShapeAnnotationType = FreeShapeAnnotation["shapeType"];

export interface AnnotationUIState {
  // Group UI state
  selectedGroupIds: Set<string>;
  editingGroup: GroupEditorData | null;

  // Text annotation UI state
  selectedTextIds: Set<string>;
  editingTextAnnotation: FreeTextAnnotation | null;
  isAddTextMode: boolean;

  // Shape annotation UI state
  selectedShapeIds: Set<string>;
  editingShapeAnnotation: FreeShapeAnnotation | null;
  isAddShapeMode: boolean;
  pendingShapeType: ShapeAnnotationType;

  // Traffic-rate annotation UI state
  selectedTrafficRateIds: Set<string>;
  editingTrafficRateAnnotation: TrafficRateAnnotation | null;
}

export interface AnnotationUIActions {
  // Group selection
  selectGroup: (id: string) => void;
  toggleGroupSelection: (id: string) => void;
  boxSelectGroups: (ids: string[]) => void;
  clearGroupSelection: () => void;

  // Group editing
  setEditingGroup: (data: GroupEditorData | null) => void;
  closeGroupEditor: () => void;

  // Text annotation selection
  selectTextAnnotation: (id: string) => void;
  toggleTextAnnotationSelection: (id: string) => void;
  boxSelectTextAnnotations: (ids: string[]) => void;
  clearTextAnnotationSelection: () => void;

  // Text annotation editing
  setEditingTextAnnotation: (annotation: FreeTextAnnotation | null) => void;
  closeTextEditor: () => void;
  setAddTextMode: (enabled: boolean) => void;
  disableAddTextMode: () => void;

  // Shape annotation selection
  selectShapeAnnotation: (id: string) => void;
  toggleShapeAnnotationSelection: (id: string) => void;
  boxSelectShapeAnnotations: (ids: string[]) => void;
  clearShapeAnnotationSelection: () => void;

  // Shape annotation editing
  setEditingShapeAnnotation: (annotation: FreeShapeAnnotation | null) => void;
  closeShapeEditor: () => void;
  setAddShapeMode: (enabled: boolean, shapeType?: ShapeAnnotationType) => void;
  disableAddShapeMode: () => void;
  setPendingShapeType: (shapeType: ShapeAnnotationType) => void;

  // Traffic-rate annotation selection
  selectTrafficRateAnnotation: (id: string) => void;
  toggleTrafficRateAnnotationSelection: (id: string) => void;
  boxSelectTrafficRateAnnotations: (ids: string[]) => void;
  clearTrafficRateAnnotationSelection: () => void;

  // Traffic-rate annotation editing
  setEditingTrafficRateAnnotation: (annotation: TrafficRateAnnotation | null) => void;
  closeTrafficRateEditor: () => void;

  // Utility
  clearAllSelections: () => void;

  // For deletion cleanup
  removeFromGroupSelection: (id: string) => void;
  removeFromTextSelection: (id: string) => void;
  removeFromShapeSelection: (id: string) => void;
  removeFromTrafficRateSelection: (id: string) => void;
}

export type AnnotationUIStore = AnnotationUIState & AnnotationUIActions;

// ============================================================================
// Initial State
// ============================================================================

const initialState: AnnotationUIState = {
  selectedGroupIds: new Set(),
  editingGroup: null,
  selectedTextIds: new Set(),
  editingTextAnnotation: null,
  isAddTextMode: false,
  selectedShapeIds: new Set(),
  editingShapeAnnotation: null,
  isAddShapeMode: false,
  pendingShapeType: "rectangle",
  selectedTrafficRateIds: new Set(),
  editingTrafficRateAnnotation: null
};

// ============================================================================
// Store Creation
// ============================================================================

export const useAnnotationUIStore = createWithEqualityFn<AnnotationUIStore>((set) => ({
  ...initialState,

  // Group selection
  selectGroup: (id) => {
    set({ selectedGroupIds: new Set([id]) });
  },

  toggleGroupSelection: (id) => {
    set((state) => {
      const next = new Set(state.selectedGroupIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selectedGroupIds: next };
    });
  },

  boxSelectGroups: (ids) => {
    set({ selectedGroupIds: new Set(ids) });
  },

  clearGroupSelection: () => {
    set({ selectedGroupIds: new Set() });
  },

  // Group editing
  setEditingGroup: (editingGroup) => {
    set({
      editingGroup,
      ...(editingGroup
        ? {
            // Ensure only one annotation editor is active at a time.
            editingTextAnnotation: null,
            editingShapeAnnotation: null,
            editingTrafficRateAnnotation: null
          }
        : {})
    });
  },

  closeGroupEditor: () => {
    set({ editingGroup: null });
  },

  // Text annotation selection
  selectTextAnnotation: (id) => {
    set({ selectedTextIds: new Set([id]) });
  },

  toggleTextAnnotationSelection: (id) => {
    set((state) => {
      const next = new Set(state.selectedTextIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selectedTextIds: next };
    });
  },

  boxSelectTextAnnotations: (ids) => {
    set({ selectedTextIds: new Set(ids) });
  },

  clearTextAnnotationSelection: () => {
    set({ selectedTextIds: new Set() });
  },

  // Text annotation editing
  setEditingTextAnnotation: (editingTextAnnotation) => {
    set({
      editingTextAnnotation,
      ...(editingTextAnnotation
        ? {
            // Ensure only one annotation editor is active at a time.
            editingGroup: null,
            editingShapeAnnotation: null,
            editingTrafficRateAnnotation: null
          }
        : {})
    });
  },

  closeTextEditor: () => {
    set({ editingTextAnnotation: null });
  },

  setAddTextMode: (isAddTextMode) => {
    set({ isAddTextMode, isAddShapeMode: false });
  },

  disableAddTextMode: () => {
    set({ isAddTextMode: false });
  },

  // Shape annotation selection
  selectShapeAnnotation: (id) => {
    set({ selectedShapeIds: new Set([id]) });
  },

  toggleShapeAnnotationSelection: (id) => {
    set((state) => {
      const next = new Set(state.selectedShapeIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selectedShapeIds: next };
    });
  },

  boxSelectShapeAnnotations: (ids) => {
    set({ selectedShapeIds: new Set(ids) });
  },

  clearShapeAnnotationSelection: () => {
    set({ selectedShapeIds: new Set() });
  },

  // Shape annotation editing
  setEditingShapeAnnotation: (editingShapeAnnotation) => {
    set({
      editingShapeAnnotation,
      ...(editingShapeAnnotation
        ? {
            // Ensure only one annotation editor is active at a time.
            editingGroup: null,
            editingTextAnnotation: null,
            editingTrafficRateAnnotation: null
          }
        : {})
    });
  },

  closeShapeEditor: () => {
    set({ editingShapeAnnotation: null });
  },

  setAddShapeMode: (enabled, shapeType) => {
    set({
      isAddShapeMode: enabled,
      isAddTextMode: false,
      ...(shapeType ? { pendingShapeType: shapeType } : {})
    });
  },

  disableAddShapeMode: () => {
    set({ isAddShapeMode: false });
  },

  setPendingShapeType: (pendingShapeType) => {
    set({ pendingShapeType });
  },

  // Traffic-rate annotation selection
  selectTrafficRateAnnotation: (id) => {
    set({ selectedTrafficRateIds: new Set([id]) });
  },

  toggleTrafficRateAnnotationSelection: (id) => {
    set((state) => {
      const next = new Set(state.selectedTrafficRateIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selectedTrafficRateIds: next };
    });
  },

  boxSelectTrafficRateAnnotations: (ids) => {
    set({ selectedTrafficRateIds: new Set(ids) });
  },

  clearTrafficRateAnnotationSelection: () => {
    set({ selectedTrafficRateIds: new Set() });
  },

  // Traffic-rate annotation editing
  setEditingTrafficRateAnnotation: (editingTrafficRateAnnotation) => {
    set({
      editingTrafficRateAnnotation,
      ...(editingTrafficRateAnnotation
        ? {
            // Ensure only one annotation editor is active at a time.
            editingGroup: null,
            editingTextAnnotation: null,
            editingShapeAnnotation: null
          }
        : {})
    });
  },

  closeTrafficRateEditor: () => {
    set({ editingTrafficRateAnnotation: null });
  },

  // Utility
  clearAllSelections: () => {
    set({
      selectedGroupIds: new Set(),
      selectedTextIds: new Set(),
      selectedShapeIds: new Set(),
      selectedTrafficRateIds: new Set()
    });
  },

  // For deletion cleanup
  removeFromGroupSelection: (id) => {
    set((state) => {
      if (!state.selectedGroupIds.has(id)) return state;
      const next = new Set(state.selectedGroupIds);
      next.delete(id);
      return { selectedGroupIds: next };
    });
  },

  removeFromTextSelection: (id) => {
    set((state) => {
      if (!state.selectedTextIds.has(id)) return state;
      const next = new Set(state.selectedTextIds);
      next.delete(id);
      return { selectedTextIds: next };
    });
  },

  removeFromShapeSelection: (id) => {
    set((state) => {
      if (!state.selectedShapeIds.has(id)) return state;
      const next = new Set(state.selectedShapeIds);
      next.delete(id);
      return { selectedShapeIds: next };
    });
  },

  removeFromTrafficRateSelection: (id) => {
    set((state) => {
      if (!state.selectedTrafficRateIds.has(id)) return state;
      const next = new Set(state.selectedTrafficRateIds);
      next.delete(id);
      return { selectedTrafficRateIds: next };
    });
  }
}));

// ============================================================================
// Selector Hooks (for convenience)
// ============================================================================

/** Get selected group IDs */
export const useSelectedGroupIds = () => useAnnotationUIStore((state) => state.selectedGroupIds);

/** Get editing group */
export const useEditingGroup = () => useAnnotationUIStore((state) => state.editingGroup);

/** Get selected text IDs */
export const useSelectedTextIds = () => useAnnotationUIStore((state) => state.selectedTextIds);

/** Get editing text annotation */
export const useEditingTextAnnotation = () =>
  useAnnotationUIStore((state) => state.editingTextAnnotation);

/** Get add text mode */
export const useIsAddTextMode = () => useAnnotationUIStore((state) => state.isAddTextMode);

/** Get selected shape IDs */
export const useSelectedShapeIds = () => useAnnotationUIStore((state) => state.selectedShapeIds);

/** Get editing shape annotation */
export const useEditingShapeAnnotation = () =>
  useAnnotationUIStore((state) => state.editingShapeAnnotation);

/** Get add shape mode */
export const useIsAddShapeMode = () => useAnnotationUIStore((state) => state.isAddShapeMode);

/** Get pending shape type */
export const usePendingShapeType = () => useAnnotationUIStore((state) => state.pendingShapeType);

/** Get selected traffic-rate IDs */
export const useSelectedTrafficRateIds = () =>
  useAnnotationUIStore((state) => state.selectedTrafficRateIds);

/** Get editing traffic-rate annotation */
export const useEditingTrafficRateAnnotation = () =>
  useAnnotationUIStore((state) => state.editingTrafficRateAnnotation);

/** Get annotation UI state (group/text/shape selections and edit modes) */
export const useAnnotationUIState = () =>
  useAnnotationUIStore(
    (state) => ({
      selectedGroupIds: state.selectedGroupIds,
      editingGroup: state.editingGroup,
      selectedTextIds: state.selectedTextIds,
      editingTextAnnotation: state.editingTextAnnotation,
      isAddTextMode: state.isAddTextMode,
      selectedShapeIds: state.selectedShapeIds,
      editingShapeAnnotation: state.editingShapeAnnotation,
      isAddShapeMode: state.isAddShapeMode,
      pendingShapeType: state.pendingShapeType,
      selectedTrafficRateIds: state.selectedTrafficRateIds,
      editingTrafficRateAnnotation: state.editingTrafficRateAnnotation
    }),
    shallow
  );

/** Get annotation UI actions (stable) */
export const useAnnotationUIActions = () =>
  useAnnotationUIStore(
    (state) => ({
      selectGroup: state.selectGroup,
      toggleGroupSelection: state.toggleGroupSelection,
      boxSelectGroups: state.boxSelectGroups,
      clearGroupSelection: state.clearGroupSelection,
      setEditingGroup: state.setEditingGroup,
      closeGroupEditor: state.closeGroupEditor,
      selectTextAnnotation: state.selectTextAnnotation,
      toggleTextAnnotationSelection: state.toggleTextAnnotationSelection,
      boxSelectTextAnnotations: state.boxSelectTextAnnotations,
      clearTextAnnotationSelection: state.clearTextAnnotationSelection,
      setEditingTextAnnotation: state.setEditingTextAnnotation,
      closeTextEditor: state.closeTextEditor,
      setAddTextMode: state.setAddTextMode,
      disableAddTextMode: state.disableAddTextMode,
      selectShapeAnnotation: state.selectShapeAnnotation,
      toggleShapeAnnotationSelection: state.toggleShapeAnnotationSelection,
      boxSelectShapeAnnotations: state.boxSelectShapeAnnotations,
      clearShapeAnnotationSelection: state.clearShapeAnnotationSelection,
      setEditingShapeAnnotation: state.setEditingShapeAnnotation,
      closeShapeEditor: state.closeShapeEditor,
      setAddShapeMode: state.setAddShapeMode,
      disableAddShapeMode: state.disableAddShapeMode,
      setPendingShapeType: state.setPendingShapeType,
      selectTrafficRateAnnotation: state.selectTrafficRateAnnotation,
      toggleTrafficRateAnnotationSelection: state.toggleTrafficRateAnnotationSelection,
      boxSelectTrafficRateAnnotations: state.boxSelectTrafficRateAnnotations,
      clearTrafficRateAnnotationSelection: state.clearTrafficRateAnnotationSelection,
      setEditingTrafficRateAnnotation: state.setEditingTrafficRateAnnotation,
      closeTrafficRateEditor: state.closeTrafficRateEditor,
      clearAllSelections: state.clearAllSelections,
      removeFromGroupSelection: state.removeFromGroupSelection,
      removeFromTextSelection: state.removeFromTextSelection,
      removeFromShapeSelection: state.removeFromShapeSelection,
      removeFromTrafficRateSelection: state.removeFromTrafficRateSelection
    }),
    shallow
  );
