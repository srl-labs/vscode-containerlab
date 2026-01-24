/**
 * AnnotationContext - Centralized annotation state management
 *
 * Manages groups, text annotations, and shape annotations.
 * Registers handlers with UndoRedoContext for undo/redo support.
 * Exposes state and actions to consuming components.
 */
import React, { createContext, useContext, useEffect, useCallback, useMemo, useRef } from "react";

import type {
  FreeTextAnnotation,
  FreeShapeAnnotation,
  GroupStyleAnnotation
} from "../../shared/annotations";
import type { GroupEditorData } from "../hooks/groups/groupTypes";
import {
  useAppGroups,
  useAppFreeTextAnnotations,
  useAppFreeShapeAnnotations,
  useFreeTextAnnotationApplier,
  useFreeShapeAnnotationApplier,
  useFreeTextUndoRedoHandlers,
  useFreeShapeUndoRedoHandlers,
  useAnnotationEffects,
  useAddShapesHandler,
  filterEntriesWithPosition
} from "../hooks/internal";
import {
  useAppGroupUndoHandlers,
  useCombinedAnnotationApplier,
  useGroupDragUndo,
  useGroupResizeUndo,
  useGroupUndoRedoHandlers,
  useNodeReparent,
  generateGroupId
} from "../hooks/groups";

import { useUndoRedoContext } from "./UndoRedoContext";

/** Pending membership change during node drag */
export interface PendingMembershipChange {
  nodeId: string;
  oldGroupId: string | null;
  newGroupId: string | null;
}

/** Props for AnnotationProvider */
interface AnnotationProviderProps {
  /** React Flow nodes for position queries */
  nodes: import("../../shared/types/graph").TopoNode[];
  /** React Flow instance for viewport queries */
  rfInstance: import("@xyflow/react").ReactFlowInstance | null;
  mode: "edit" | "view";
  isLocked: boolean;
  onLockedAction: () => void;
  pendingMembershipChangesRef: { current: Map<string, PendingMembershipChange> };
  /** Callback to sync node positions to React state (prevents position drift during reconcile) */
  updateNodePositions: (
    positions: Array<{ id: string; position: { x: number; y: number } }>
  ) => void;
  children: React.ReactNode;
}

interface AnnotationStateContextValue {
  // Groups
  groups: GroupStyleAnnotation[];
  selectedGroupIds: Set<string>;
  editingGroup: GroupEditorData | null;

  // Text annotations
  textAnnotations: FreeTextAnnotation[];
  selectedTextIds: Set<string>;
  editingTextAnnotation: FreeTextAnnotation | null;
  isAddTextMode: boolean;

  // Shape annotations
  shapeAnnotations: FreeShapeAnnotation[];
  selectedShapeIds: Set<string>;
  editingShapeAnnotation: FreeShapeAnnotation | null;
  isAddShapeMode: boolean;
}

interface AnnotationActionsContextValue {
  // Groups
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
  onGroupDragEnd: (
    groupId: string,
    finalPosition: { x: number; y: number },
    delta: { dx: number; dy: number }
  ) => void;
  onGroupDragMove: (groupId: string, delta: { dx: number; dy: number }) => void;
  updateGroupSizeWithUndo: (id: string, width: number, height: number) => void;
  // Group resize handlers (separate from drag to avoid undo spam)
  onResizeStart: (groupId: string) => void;
  onResizeMove: (
    groupId: string,
    width: number,
    height: number,
    position: { x: number; y: number }
  ) => void;
  onResizeEnd: (
    groupId: string,
    finalWidth: number,
    finalHeight: number,
    finalPosition: { x: number; y: number }
  ) => void;

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
  migrateTextAnnotationsGroupId: (oldGroupId: string, newGroupId: string | null) => void;

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
  migrateShapeAnnotationsGroupId: (oldGroupId: string, newGroupId: string | null) => void;

  // Membership callbacks for node reparent
  applyMembershipChange: (memberships: { nodeId: string; groupId: string | null }[]) => void;
  onMembershipWillChange: (
    nodeId: string,
    oldGroupId: string | null,
    newGroupId: string | null
  ) => void;

  // Utilities
  clearAllSelections: () => void;
  deleteAllSelected: () => void;
}

export type AnnotationContextValue = AnnotationStateContextValue & AnnotationActionsContextValue;

const AnnotationStateContext = createContext<AnnotationStateContextValue | undefined>(undefined);
const AnnotationActionsContext = createContext<AnnotationActionsContextValue | undefined>(
  undefined
);

/** Provider component for annotation context */
export const AnnotationProvider: React.FC<AnnotationProviderProps> = ({
  nodes,
  rfInstance,
  mode,
  isLocked,
  onLockedAction,
  pendingMembershipChangesRef,
  updateNodePositions,
  children
}) => {
  const {
    undoRedo,
    registerAnnotationHandler,
    registerGroupMoveHandler,
    registerMembershipHandler
  } = useUndoRedoContext();

  // Refs for late-bound migration callbacks
  const migrateTextAnnotationsRef = useRef<
    ((oldGroupId: string, newGroupId: string | null) => void) | undefined
  >(undefined);
  const migrateShapeAnnotationsRef = useRef<
    ((oldGroupId: string, newGroupId: string | null) => void) | undefined
  >(undefined);

  // Groups
  const { groups: groupsHook } = useAppGroups({
    nodes,
    rfInstance,
    mode,
    isLocked,
    onLockedAction,
    onMigrateTextAnnotations: (old, newId) => migrateTextAnnotationsRef.current?.(old, newId),
    onMigrateShapeAnnotations: (old, newId) => migrateShapeAnnotationsRef.current?.(old, newId)
  });

  // Text annotations
  const freeTextAnnotations = useAppFreeTextAnnotations({
    rfInstance,
    mode,
    isLocked,
    onLockedAction,
    groups: groupsHook.groups
  });

  // Shape annotations
  const freeShapeAnnotations = useAppFreeShapeAnnotations({
    rfInstance,
    mode,
    isLocked,
    onLockedAction,
    groups: groupsHook.groups
  });

  // Set late-bound migration callbacks
  migrateTextAnnotationsRef.current = freeTextAnnotations.migrateGroupId;
  migrateShapeAnnotationsRef.current = freeShapeAnnotations.migrateGroupId;

  // Appliers for undo/redo
  const {
    isApplyingAnnotationUndoRedo: isApplyingShapeUndoRedo,
    applyAnnotationChange: applyFreeShapeChange
  } = useFreeShapeAnnotationApplier(freeShapeAnnotations);
  const {
    isApplyingAnnotationUndoRedo: isApplyingTextUndoRedo,
    applyAnnotationChange: applyFreeTextChange
  } = useFreeTextAnnotationApplier(freeTextAnnotations);

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
  const applyMembershipChange = useCallback(
    (memberships: { nodeId: string; groupId: string | null }[]) => {
      for (const { nodeId, groupId } of memberships) {
        if (groupId) {
          groupsHook.addNodeToGroup(nodeId, groupId);
        } else {
          groupsHook.removeNodeFromGroup(nodeId);
        }
      }
    },
    [groupsHook]
  );

  const onMembershipWillChange = useCallback(
    (nodeId: string, oldGroupId: string | null, newGroupId: string | null) => {
      pendingMembershipChangesRef.current.set(nodeId, { nodeId, oldGroupId, newGroupId });
    },
    [pendingMembershipChangesRef]
  );

  // Register membership handler
  useEffect(() => {
    registerMembershipHandler(applyMembershipChange);
  }, [registerMembershipHandler, applyMembershipChange]);

  // Group undo handlers
  const { handleAddGroupWithUndo, deleteGroupWithUndo } = useAppGroupUndoHandlers({
    nodes,
    rfInstance,
    groups: groupsHook,
    undoRedo,
    textAnnotations: freeTextAnnotations.annotations,
    shapeAnnotations: freeShapeAnnotations.annotations
  });

  const groupUndoHandlers = useGroupUndoRedoHandlers(groupsHook, undoRedo);

  // Group drag undo
  const groupDragUndo = useGroupDragUndo({
    nodes,
    rfInstance,
    groups: groupsHook,
    undoRedo,
    isApplyingGroupUndoRedo: groupUndoHandlers.isApplyingGroupUndoRedo,
    textAnnotations: freeTextAnnotations.annotations,
    shapeAnnotations: freeShapeAnnotations.annotations,
    onUpdateTextAnnotation: freeTextAnnotations.updateAnnotation,
    onUpdateShapeAnnotation: freeShapeAnnotations.updateAnnotation,
    onPositionsCommitted: (positions) => {
      const withPosition = filterEntriesWithPosition(positions);
      if (withPosition.length > 0) updateNodePositions(withPosition);
    }
  });

  // Group resize undo (separate from drag to avoid undo spam during resize)
  const groupResizeUndo = useGroupResizeUndo({
    groups: groupsHook,
    undoRedo,
    isApplyingGroupUndoRedo: groupUndoHandlers.isApplyingGroupUndoRedo
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
  useNodeReparent(
    nodes,
    {
      mode,
      isLocked,
      onMembershipWillChange
    },
    {
      groups: groupsHook.groups,
      addNodeToGroup: groupsHook.addNodeToGroup,
      removeNodeFromGroup: groupsHook.removeNodeFromGroup
    }
  );

  // Annotation effects
  useAnnotationEffects({
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
  const addGroupWithUndo = useCallback(
    (group: GroupStyleAnnotation) => {
      groupsHook.addGroup(group);
      undoRedo.pushAction(groupsHook.getUndoRedoAction(null, group));
    },
    [groupsHook, undoRedo]
  );

  // Clear all selections
  const clearAllSelections = useCallback(() => {
    freeTextAnnotations.clearAnnotationSelection();
    freeShapeAnnotations.clearAnnotationSelection();
    groupsHook.clearGroupSelection();
  }, [freeTextAnnotations, freeShapeAnnotations, groupsHook]);

  // Delete all selected
  const deleteAllSelected = useCallback(() => {
    groupsHook.selectedGroupIds.forEach((id) => deleteGroupWithUndo(id));
    groupsHook.clearGroupSelection();
    freeTextAnnotations.deleteSelectedAnnotations();
    freeShapeAnnotations.deleteSelectedAnnotations();
  }, [groupsHook, deleteGroupWithUndo, freeTextAnnotations, freeShapeAnnotations]);

  const stateValue = useMemo<AnnotationStateContextValue>(
    () => ({
      groups: groupsHook.groups,
      selectedGroupIds: groupsHook.selectedGroupIds,
      editingGroup: groupsHook.editingGroup,

      textAnnotations: freeTextAnnotations.annotations,
      selectedTextIds: freeTextAnnotations.selectedAnnotationIds,
      editingTextAnnotation: freeTextAnnotations.editingAnnotation,
      isAddTextMode: freeTextAnnotations.isAddTextMode,

      shapeAnnotations: freeShapeAnnotations.annotations,
      selectedShapeIds: freeShapeAnnotations.selectedAnnotationIds,
      editingShapeAnnotation: freeShapeAnnotations.editingAnnotation,
      isAddShapeMode: freeShapeAnnotations.isAddShapeMode
    }),
    [
      groupsHook.groups,
      groupsHook.selectedGroupIds,
      groupsHook.editingGroup,
      freeTextAnnotations.annotations,
      freeTextAnnotations.selectedAnnotationIds,
      freeTextAnnotations.editingAnnotation,
      freeTextAnnotations.isAddTextMode,
      freeShapeAnnotations.annotations,
      freeShapeAnnotations.selectedAnnotationIds,
      freeShapeAnnotations.editingAnnotation,
      freeShapeAnnotations.isAddShapeMode
    ]
  );

  const actionsValue = useMemo<AnnotationActionsContextValue>(
    () => ({
      // Groups
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
      onResizeStart: groupResizeUndo.onResizeStart,
      onResizeMove: groupResizeUndo.onResizeMove,
      onResizeEnd: groupResizeUndo.onResizeEnd,

      // Text annotations
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
    }),
    [
      groupsHook.selectGroup,
      groupsHook.toggleGroupSelection,
      groupsHook.boxSelectGroups,
      groupsHook.clearGroupSelection,
      groupsHook.editGroup,
      groupsHook.closeEditor,
      groupsHook.saveGroup,
      groupsHook.deleteGroup,
      groupsHook.updateGroup,
      groupsHook.updateGroupParent,
      groupsHook.updateGroupGeoPosition,
      groupsHook.addNodeToGroup,
      groupsHook.getNodeMembership,
      groupsHook.getGroupMembers,
      handleAddGroupWithUndo,
      deleteGroupWithUndo,
      generateGroupIdCallback,
      addGroupWithUndo,
      groupDragUndo.onGroupDragStart,
      groupDragUndo.onGroupDragEnd,
      groupDragUndo.onGroupDragMove,
      groupUndoHandlers.updateGroupSizeWithUndo,
      groupResizeUndo.onResizeStart,
      groupResizeUndo.onResizeMove,
      groupResizeUndo.onResizeEnd,
      freeTextAnnotations.handleAddText,
      freeTextAnnotations.selectAnnotation,
      freeTextAnnotations.toggleAnnotationSelection,
      freeTextAnnotations.boxSelectAnnotations,
      freeTextAnnotations.clearAnnotationSelection,
      freeTextAnnotations.editAnnotation,
      freeTextAnnotations.closeEditor,
      freeTextAnnotations.saveAnnotation,
      freeTextUndoHandlers.saveAnnotationWithUndo,
      freeTextAnnotations.deleteAnnotation,
      freeTextUndoHandlers.deleteAnnotationWithUndo,
      freeTextAnnotations.deleteSelectedAnnotations,
      freeTextAnnotations.updatePosition,
      freeTextAnnotations.updateRotation,
      freeTextAnnotations.updateSize,
      freeTextAnnotations.updateGeoPosition,
      freeTextAnnotations.updateAnnotation,
      freeTextAnnotations.handleCanvasClick,
      freeTextAnnotations.migrateGroupId,
      handleAddShapes,
      freeShapeAnnotations.selectAnnotation,
      freeShapeAnnotations.toggleAnnotationSelection,
      freeShapeAnnotations.boxSelectAnnotations,
      freeShapeAnnotations.clearAnnotationSelection,
      freeShapeAnnotations.editAnnotation,
      freeShapeAnnotations.closeEditor,
      freeShapeAnnotations.saveAnnotation,
      freeShapeAnnotations.deleteAnnotation,
      freeShapeUndoHandlers.deleteAnnotationWithUndo,
      freeShapeAnnotations.deleteSelectedAnnotations,
      freeShapeUndoHandlers.updatePositionWithUndo,
      freeShapeAnnotations.updateRotation,
      freeShapeAnnotations.updateSize,
      freeShapeAnnotations.updateEndPosition,
      freeShapeAnnotations.updateGeoPosition,
      freeShapeAnnotations.updateEndGeoPosition,
      freeShapeAnnotations.updateAnnotation,
      freeShapeUndoHandlers.handleCanvasClickWithUndo,
      freeShapeUndoHandlers.captureAnnotationBefore,
      freeShapeUndoHandlers.finalizeWithUndo,
      freeShapeAnnotations.migrateGroupId,
      applyMembershipChange,
      onMembershipWillChange,
      clearAllSelections,
      deleteAllSelected
    ]
  );

  return (
    <AnnotationStateContext.Provider value={stateValue}>
      <AnnotationActionsContext.Provider value={actionsValue}>
        {children}
      </AnnotationActionsContext.Provider>
    </AnnotationStateContext.Provider>
  );
};

export function useAnnotationsState(): AnnotationStateContextValue {
  const context = useContext(AnnotationStateContext);
  if (context === undefined) {
    throw new Error("useAnnotationsState must be used within an AnnotationProvider");
  }
  return context;
}

export function useAnnotationsActions(): AnnotationActionsContextValue {
  const context = useContext(AnnotationActionsContext);
  if (context === undefined) {
    throw new Error("useAnnotationsActions must be used within an AnnotationProvider");
  }
  return context;
}

/** Legacy combined hook (prefer useAnnotationsState/useAnnotationsActions) */
export function useAnnotations(): AnnotationContextValue {
  const state = useAnnotationsState();
  const actions = useAnnotationsActions();
  return useMemo(() => ({ ...state, ...actions }), [state, actions]);
}
