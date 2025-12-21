/**
 * AnnotationContext - Centralized annotation state management
 *
 * Manages groups, text annotations, and shape annotations.
 * Registers handlers with UndoRedoContext for undo/redo support.
 * Exposes state and actions to consuming components.
 */
import React, { createContext, useContext, useEffect, useCallback, useMemo, useRef } from 'react';
import type { Core as CyCore } from 'cytoscape';

import type { FreeTextAnnotation, FreeShapeAnnotation, GroupStyleAnnotation } from '../../shared/annotations';
import type { MapLibreState } from '../hooks/canvas/maplibreUtils';
import type { GroupEditorData } from '../hooks/groups/groupTypes';
import {
  useAppGroups,
  useAppFreeTextAnnotations,
  useAppFreeShapeAnnotations,
  useFreeTextAnnotationApplier,
  useFreeShapeAnnotationApplier,
  useFreeTextUndoRedoHandlers,
  useFreeShapeUndoRedoHandlers,
  useAnnotationEffects,
  useAddShapesHandler
} from '../hooks';
import {
  useAppGroupUndoHandlers,
  useCombinedAnnotationApplier,
  useGroupDragUndo,
  useGroupUndoRedoHandlers,
  useNodeReparent,
  generateGroupId
} from '../hooks/groups';

import { useUndoRedoContext } from './UndoRedoContext';

/** Pending membership change during node drag */
export interface PendingMembershipChange {
  nodeId: string;
  oldGroupId: string | null;
  newGroupId: string | null;
}

/** Props for AnnotationProvider */
interface AnnotationProviderProps {
  cy: CyCore | null;
  mode: 'edit' | 'view';
  isLocked: boolean;
  onLockedAction: () => void;
  isGeoLayout: boolean;
  geoMode: 'pan' | 'edit';
  mapLibreState: MapLibreState | null;
  shapeLayerNode: HTMLElement | null;
  pendingMembershipChangesRef: { current: Map<string, PendingMembershipChange> };
  children: React.ReactNode;
}

/** Annotation context value */
interface AnnotationContextValue {
  // Groups
  groups: GroupStyleAnnotation[];
  selectedGroupIds: Set<string>;
  editingGroup: GroupEditorData | null;
  selectGroup: (id: string) => void;
  toggleGroupSelection: (id: string) => void;
  boxSelectGroups: (ids: string[]) => void;
  clearGroupSelection: () => void;
  editGroup: (id: string) => void;
  closeGroupEditor: () => void;
  saveGroup: (data: GroupEditorData) => void;
  deleteGroup: (id: string) => void;
  updateGroup: (id: string, updates: Partial<GroupStyleAnnotation>) => void;
  updateGroupParent: (id: string, parentId: string | null) => void;
  updateGroupGeoPosition: (id: string, coords: { lat: number; lng: number }) => void;
  addNodeToGroup: (nodeId: string, groupId: string) => void;
  getNodeMembership: (nodeId: string) => string | null;
  getGroupMembers: (groupId: string) => string[];
  handleAddGroupWithUndo: () => void;
  deleteGroupWithUndo: (id: string) => void;
  generateGroupId: () => string;
  addGroupWithUndo: (group: GroupStyleAnnotation) => void;
  // Group drag handlers
  onGroupDragStart: (groupId: string) => void;
  onGroupDragEnd: (groupId: string, finalPosition: { x: number; y: number }, delta: { dx: number; dy: number }) => void;
  onGroupDragMove: (groupId: string, delta: { dx: number; dy: number }) => void;
  updateGroupSizeWithUndo: (id: string, width: number, height: number) => void;

  // Text annotations
  textAnnotations: FreeTextAnnotation[];
  selectedTextIds: Set<string>;
  editingTextAnnotation: FreeTextAnnotation | null;
  isAddTextMode: boolean;
  handleAddText: () => void;
  selectTextAnnotation: (id: string) => void;
  toggleTextAnnotationSelection: (id: string) => void;
  boxSelectTextAnnotations: (ids: string[]) => void;
  clearTextAnnotationSelection: () => void;
  editTextAnnotation: (id: string) => void;
  closeTextEditor: () => void;
  saveTextAnnotation: (annotation: FreeTextAnnotation) => void;
  saveTextAnnotationWithUndo: (annotation: FreeTextAnnotation, isNew: boolean) => void;
  deleteTextAnnotation: (id: string) => void;
  deleteTextAnnotationWithUndo: (id: string) => void;
  deleteSelectedTextAnnotations: () => void;
  updateTextPosition: (id: string, position: { x: number; y: number }) => void;
  updateTextRotation: (id: string, rotation: number) => void;
  updateTextSize: (id: string, width: number, height: number) => void;
  updateTextGeoPosition: (id: string, coords: { lat: number; lng: number }) => void;
  updateTextAnnotation: (id: string, updates: Partial<FreeTextAnnotation>) => void;
  handleTextCanvasClick: (position: { x: number; y: number }) => void;
  migrateTextAnnotationsGroupId: (oldGroupId: string, newGroupId: string) => void;

  // Shape annotations
  shapeAnnotations: FreeShapeAnnotation[];
  selectedShapeIds: Set<string>;
  editingShapeAnnotation: FreeShapeAnnotation | null;
  isAddShapeMode: boolean;
  handleAddShapes: (shapeType?: string) => void;
  selectShapeAnnotation: (id: string) => void;
  toggleShapeAnnotationSelection: (id: string) => void;
  boxSelectShapeAnnotations: (ids: string[]) => void;
  clearShapeAnnotationSelection: () => void;
  editShapeAnnotation: (id: string) => void;
  closeShapeEditor: () => void;
  saveShapeAnnotation: (annotation: FreeShapeAnnotation) => void;
  deleteShapeAnnotation: (id: string) => void;
  deleteShapeAnnotationWithUndo: (id: string) => void;
  deleteSelectedShapeAnnotations: () => void;
  updateShapePositionWithUndo: (id: string, position: { x: number; y: number }) => void;
  updateShapeRotation: (id: string, rotation: number) => void;
  updateShapeSize: (id: string, width: number, height: number) => void;
  updateShapeEndPosition: (id: string, endPosition: { x: number; y: number }) => void;
  updateShapeGeoPosition: (id: string, coords: { lat: number; lng: number }) => void;
  updateShapeEndGeoPosition: (id: string, coords: { lat: number; lng: number }) => void;
  updateShapeAnnotation: (id: string, updates: Partial<FreeShapeAnnotation>) => void;
  handleShapeCanvasClickWithUndo: (position: { x: number; y: number }) => void;
  captureShapeAnnotationBefore: (id: string) => FreeShapeAnnotation | null;
  finalizeShapeWithUndo: (before: FreeShapeAnnotation | null, id: string) => void;
  migrateShapeAnnotationsGroupId: (oldGroupId: string, newGroupId: string) => void;

  // Membership callbacks for node reparent
  applyMembershipChange: (memberships: { nodeId: string; groupId: string | null }[]) => void;
  onMembershipWillChange: (nodeId: string, oldGroupId: string | null, newGroupId: string | null) => void;

  // Utilities
  clearAllSelections: () => void;
  deleteAllSelected: () => void;
}

const AnnotationContext = createContext<AnnotationContextValue | null>(null);

/** Provider component for annotation context */
export const AnnotationProvider: React.FC<AnnotationProviderProps> = ({
  cy,
  mode,
  isLocked,
  onLockedAction,
  pendingMembershipChangesRef,
  children
}) => {
  const { undoRedo, registerAnnotationHandler, registerGroupMoveHandler, registerMembershipHandler } = useUndoRedoContext();

  // Refs for late-bound migration callbacks
  const migrateTextAnnotationsRef = useRef<((oldGroupId: string, newGroupId: string) => void) | undefined>(undefined);
  const migrateShapeAnnotationsRef = useRef<((oldGroupId: string, newGroupId: string) => void) | undefined>(undefined);

  // Groups
  const { groups: groupsHook } = useAppGroups({
    cyInstance: cy,
    mode,
    isLocked,
    onLockedAction,
    onMigrateTextAnnotations: (old, newId) => migrateTextAnnotationsRef.current?.(old, newId),
    onMigrateShapeAnnotations: (old, newId) => migrateShapeAnnotationsRef.current?.(old, newId)
  });

  // Text annotations
  const freeTextAnnotations = useAppFreeTextAnnotations({
    cyInstance: cy,
    mode,
    isLocked,
    onLockedAction,
    groups: groupsHook.groups
  });

  // Shape annotations
  const freeShapeAnnotations = useAppFreeShapeAnnotations({
    cyInstance: cy,
    mode,
    isLocked,
    onLockedAction,
    groups: groupsHook.groups
  });

  // Set late-bound migration callbacks
  migrateTextAnnotationsRef.current = freeTextAnnotations.migrateGroupId;
  migrateShapeAnnotationsRef.current = freeShapeAnnotations.migrateGroupId;

  // Appliers for undo/redo
  const { isApplyingAnnotationUndoRedo: isApplyingShapeUndoRedo, applyAnnotationChange: applyFreeShapeChange } =
    useFreeShapeAnnotationApplier(freeShapeAnnotations);
  const { isApplyingAnnotationUndoRedo: isApplyingTextUndoRedo, applyAnnotationChange: applyFreeTextChange } =
    useFreeTextAnnotationApplier(freeTextAnnotations);

  // Combined annotation applier
  const { applyAnnotationChange, applyGroupMoveChange } = useCombinedAnnotationApplier({
    groups: groupsHook,
    applyFreeShapeChange,
    applyFreeTextChange,
    onUpdateTextAnnotation: freeTextAnnotations.updateAnnotation,
    onUpdateShapeAnnotation: freeShapeAnnotations.updateAnnotation
  });

  // Register annotation and group move handlers with context
  useEffect(() => {
    registerAnnotationHandler(applyAnnotationChange);
  }, [registerAnnotationHandler, applyAnnotationChange]);

  useEffect(() => {
    registerGroupMoveHandler(applyGroupMoveChange);
  }, [registerGroupMoveHandler, applyGroupMoveChange]);

  // Membership callbacks
  const applyMembershipChange = useCallback((memberships: { nodeId: string; groupId: string | null }[]) => {
    for (const { nodeId, groupId } of memberships) {
      if (groupId) {
        groupsHook.addNodeToGroup(nodeId, groupId);
      } else {
        groupsHook.removeNodeFromGroup(nodeId);
      }
    }
  }, [groupsHook]);

  const onMembershipWillChange = useCallback((nodeId: string, oldGroupId: string | null, newGroupId: string | null) => {
    pendingMembershipChangesRef.current.set(nodeId, { nodeId, oldGroupId, newGroupId });
  }, [pendingMembershipChangesRef]);

  // Register membership handler
  useEffect(() => {
    registerMembershipHandler(applyMembershipChange);
  }, [registerMembershipHandler, applyMembershipChange]);

  // Group undo handlers
  const { handleAddGroupWithUndo, deleteGroupWithUndo } = useAppGroupUndoHandlers({
    cyInstance: cy,
    groups: groupsHook,
    undoRedo
  });

  const groupUndoHandlers = useGroupUndoRedoHandlers(groupsHook, undoRedo);

  // Group drag undo
  const groupDragUndo = useGroupDragUndo({
    cyInstance: cy,
    groups: groupsHook,
    undoRedo,
    isApplyingGroupUndoRedo: groupUndoHandlers.isApplyingGroupUndoRedo,
    textAnnotations: freeTextAnnotations.annotations,
    shapeAnnotations: freeShapeAnnotations.annotations,
    onUpdateTextAnnotation: freeTextAnnotations.updateAnnotation,
    onUpdateShapeAnnotation: freeShapeAnnotations.updateAnnotation
  });

  // Text undo handlers
  const freeTextUndoHandlers = useFreeTextUndoRedoHandlers(
    freeTextAnnotations,
    undoRedo,
    isApplyingTextUndoRedo
  );

  // Shape undo handlers
  const freeShapeUndoHandlers = useFreeShapeUndoRedoHandlers(
    freeShapeAnnotations,
    undoRedo,
    isApplyingShapeUndoRedo
  );

  // Node reparent
  useNodeReparent(cy, {
    mode,
    isLocked,
    onMembershipWillChange
  }, {
    groups: groupsHook.groups,
    addNodeToGroup: groupsHook.addNodeToGroup,
    removeNodeFromGroup: groupsHook.removeNodeFromGroup
  });

  // Annotation effects
  useAnnotationEffects({
    cy,
    isLocked,
    freeTextAnnotations: freeTextAnnotations.annotations,
    freeTextSelectedIds: freeTextAnnotations.selectedAnnotationIds,
    onFreeTextPositionChange: freeTextAnnotations.updatePosition,
    onFreeTextClearSelection: freeTextAnnotations.clearAnnotationSelection,
    freeShapeSelectedIds: freeShapeAnnotations.selectedAnnotationIds,
    onFreeShapeClearSelection: freeShapeAnnotations.clearAnnotationSelection,
    groupSelectedIds: groupsHook.selectedGroupIds,
    onGroupClearSelection: groupsHook.clearGroupSelection
  });

  // Add shapes handler
  const handleAddShapes = useAddShapesHandler({
    isLocked,
    onLockedAction,
    enableAddShapeMode: freeShapeAnnotations.enableAddShapeMode
  });

  // Generate unique group ID callback
  const generateGroupIdCallback = useCallback(() => {
    return generateGroupId(groupsHook.groups);
  }, [groupsHook.groups]);

  // Add group with undo recording (for paste operations)
  const addGroupWithUndo = useCallback((group: GroupStyleAnnotation) => {
    groupsHook.addGroup(group);
    undoRedo.pushAction(groupsHook.getUndoRedoAction(null, group));
  }, [groupsHook, undoRedo]);

  // Clear all selections
  const clearAllSelections = useCallback(() => {
    freeTextAnnotations.clearAnnotationSelection();
    freeShapeAnnotations.clearAnnotationSelection();
    groupsHook.clearGroupSelection();
  }, [freeTextAnnotations, freeShapeAnnotations, groupsHook]);

  // Delete all selected
  const deleteAllSelected = useCallback(() => {
    groupsHook.selectedGroupIds.forEach(id => deleteGroupWithUndo(id));
    groupsHook.clearGroupSelection();
    freeTextAnnotations.deleteSelectedAnnotations();
    freeShapeAnnotations.deleteSelectedAnnotations();
  }, [groupsHook, deleteGroupWithUndo, freeTextAnnotations, freeShapeAnnotations]);

  const value = useMemo<AnnotationContextValue>(() => ({
    // Groups
    groups: groupsHook.groups,
    selectedGroupIds: groupsHook.selectedGroupIds,
    editingGroup: groupsHook.editingGroup,
    selectGroup: groupsHook.selectGroup,
    toggleGroupSelection: groupsHook.toggleGroupSelection,
    boxSelectGroups: groupsHook.boxSelectGroups,
    clearGroupSelection: groupsHook.clearGroupSelection,
    editGroup: groupsHook.editGroup,
    closeGroupEditor: groupsHook.closeEditor,
    saveGroup: groupsHook.saveGroup,
    deleteGroup: groupsHook.deleteGroup,
    updateGroup: groupsHook.updateGroup,
    updateGroupParent: groupsHook.updateGroupParent,
    updateGroupGeoPosition: groupsHook.updateGroupGeoPosition,
    addNodeToGroup: groupsHook.addNodeToGroup,
    getNodeMembership: groupsHook.getNodeMembership,
    getGroupMembers: groupsHook.getGroupMembers,
    handleAddGroupWithUndo,
    deleteGroupWithUndo,
    generateGroupId: generateGroupIdCallback,
    addGroupWithUndo,
    onGroupDragStart: groupDragUndo.onGroupDragStart,
    onGroupDragEnd: groupDragUndo.onGroupDragEnd,
    onGroupDragMove: groupDragUndo.onGroupDragMove,
    updateGroupSizeWithUndo: groupUndoHandlers.updateGroupSizeWithUndo,

    // Text annotations
    textAnnotations: freeTextAnnotations.annotations,
    selectedTextIds: freeTextAnnotations.selectedAnnotationIds,
    editingTextAnnotation: freeTextAnnotations.editingAnnotation,
    isAddTextMode: freeTextAnnotations.isAddTextMode,
    handleAddText: freeTextAnnotations.handleAddText,
    selectTextAnnotation: freeTextAnnotations.selectAnnotation,
    toggleTextAnnotationSelection: freeTextAnnotations.toggleAnnotationSelection,
    boxSelectTextAnnotations: freeTextAnnotations.boxSelectAnnotations,
    clearTextAnnotationSelection: freeTextAnnotations.clearAnnotationSelection,
    editTextAnnotation: freeTextAnnotations.editAnnotation,
    closeTextEditor: freeTextAnnotations.closeEditor,
    saveTextAnnotation: freeTextAnnotations.saveAnnotation,
    saveTextAnnotationWithUndo: freeTextUndoHandlers.saveAnnotationWithUndo,
    deleteTextAnnotation: freeTextAnnotations.deleteAnnotation,
    deleteTextAnnotationWithUndo: freeTextUndoHandlers.deleteAnnotationWithUndo,
    deleteSelectedTextAnnotations: freeTextAnnotations.deleteSelectedAnnotations,
    updateTextPosition: freeTextAnnotations.updatePosition,
    updateTextRotation: freeTextAnnotations.updateRotation,
    updateTextSize: freeTextAnnotations.updateSize,
    updateTextGeoPosition: freeTextAnnotations.updateGeoPosition,
    updateTextAnnotation: freeTextAnnotations.updateAnnotation,
    handleTextCanvasClick: freeTextAnnotations.handleCanvasClick,
    migrateTextAnnotationsGroupId: freeTextAnnotations.migrateGroupId,

    // Shape annotations
    shapeAnnotations: freeShapeAnnotations.annotations,
    selectedShapeIds: freeShapeAnnotations.selectedAnnotationIds,
    editingShapeAnnotation: freeShapeAnnotations.editingAnnotation,
    isAddShapeMode: freeShapeAnnotations.isAddShapeMode,
    handleAddShapes,
    selectShapeAnnotation: freeShapeAnnotations.selectAnnotation,
    toggleShapeAnnotationSelection: freeShapeAnnotations.toggleAnnotationSelection,
    boxSelectShapeAnnotations: freeShapeAnnotations.boxSelectAnnotations,
    clearShapeAnnotationSelection: freeShapeAnnotations.clearAnnotationSelection,
    editShapeAnnotation: freeShapeAnnotations.editAnnotation,
    closeShapeEditor: freeShapeAnnotations.closeEditor,
    saveShapeAnnotation: freeShapeAnnotations.saveAnnotation,
    deleteShapeAnnotation: freeShapeAnnotations.deleteAnnotation,
    deleteShapeAnnotationWithUndo: freeShapeUndoHandlers.deleteAnnotationWithUndo,
    deleteSelectedShapeAnnotations: freeShapeAnnotations.deleteSelectedAnnotations,
    updateShapePositionWithUndo: freeShapeUndoHandlers.updatePositionWithUndo,
    updateShapeRotation: freeShapeAnnotations.updateRotation,
    updateShapeSize: freeShapeAnnotations.updateSize,
    updateShapeEndPosition: freeShapeAnnotations.updateEndPosition,
    updateShapeGeoPosition: freeShapeAnnotations.updateGeoPosition,
    updateShapeEndGeoPosition: freeShapeAnnotations.updateEndGeoPosition,
    updateShapeAnnotation: freeShapeAnnotations.updateAnnotation,
    handleShapeCanvasClickWithUndo: freeShapeUndoHandlers.handleCanvasClickWithUndo,
    captureShapeAnnotationBefore: freeShapeUndoHandlers.captureAnnotationBefore,
    finalizeShapeWithUndo: freeShapeUndoHandlers.finalizeWithUndo,
    migrateShapeAnnotationsGroupId: freeShapeAnnotations.migrateGroupId,

    // Membership callbacks
    applyMembershipChange,
    onMembershipWillChange,

    // Utilities
    clearAllSelections,
    deleteAllSelected
  }), [
    groupsHook, handleAddGroupWithUndo, deleteGroupWithUndo, generateGroupIdCallback, addGroupWithUndo,
    groupDragUndo, groupUndoHandlers,
    freeTextAnnotations, freeTextUndoHandlers,
    freeShapeAnnotations, freeShapeUndoHandlers, handleAddShapes,
    applyMembershipChange, onMembershipWillChange,
    clearAllSelections, deleteAllSelected
  ]);

  return (
    <AnnotationContext.Provider value={value}>
      {children}
    </AnnotationContext.Provider>
  );
};

/** Hook to access annotation context */
export function useAnnotations(): AnnotationContextValue {
  const context = useContext(AnnotationContext);
  if (!context) {
    throw new Error('useAnnotations must be used within an AnnotationProvider');
  }
  return context;
}
