import { useCallback, useMemo } from "react";
import type { ReactFlowInstance } from "@xyflow/react";

import type { GroupStyleAnnotation } from "../../../shared/types/topology";
import type { GroupEditorData } from "../groups/groupTypes";
import type { AnnotationUIActions } from "../../stores/annotationUIStore";
import type { UndoRedoActions } from "./types";
import type { UseDerivedAnnotationsReturn } from "../useDerivedAnnotations";
import { findParentGroupForBounds, generateGroupId } from "../groups";
import { groupToNode } from "../../utils/annotationNodeConverters";

import { calculateDefaultGroupPosition, calculateGroupBoundsFromNodes } from "./helpers";

interface UseGroupAnnotationsParams {
  mode: "edit" | "view";
  isLocked: boolean;
  onLockedAction: () => void;
  rfInstance: ReactFlowInstance | null;
  derived: UseDerivedAnnotationsReturn;
  uiActions: Pick<
    AnnotationUIActions,
    "setEditingGroup" | "closeGroupEditor" | "removeFromGroupSelection"
  >;
  undoRedo: UndoRedoActions;
}

export interface GroupAnnotationActions {
  editGroup: (id: string) => void;
  saveGroup: (data: GroupEditorData) => void;
  deleteGroup: (id: string) => void;
  handleAddGroup: () => void;
  addGroup: (group: GroupStyleAnnotation) => void;
  updateGroupSize: (id: string, width: number, height: number) => void;
}

export function useGroupAnnotations(params: UseGroupAnnotationsParams): GroupAnnotationActions {
  const { mode, isLocked, onLockedAction, rfInstance, derived, uiActions, undoRedo } = params;

  const editGroup = useCallback(
    (id: string) => {
      if (mode !== "edit") return;
      if (isLocked) {
        onLockedAction();
        return;
      }
      const group = derived.groups.find((g) => g.id === id);
      if (!group) return;

      uiActions.setEditingGroup({
        id: group.id,
        name: group.name,
        level: group.level ?? "1",
        style: {
          backgroundColor: group.backgroundColor,
          backgroundOpacity: group.backgroundOpacity,
          borderColor: group.borderColor,
          borderWidth: group.borderWidth,
          borderStyle: group.borderStyle,
          borderRadius: group.borderRadius,
          labelColor: group.labelColor,
          labelPosition: group.labelPosition
        },
        position: group.position,
        width: group.width ?? 200,
        height: group.height ?? 150
      });
    },
    [mode, isLocked, onLockedAction, derived.groups, uiActions]
  );

  const saveGroup = useCallback(
    (data: GroupEditorData) => {
      const group = derived.groups.find((g) => g.id === data.id);
      if (!group) return;

      const memberIds = derived.getGroupMembers(data.id);
      const snapshot = undoRedo.captureSnapshot({ nodeIds: [data.id, ...memberIds] });

      derived.updateGroup(data.id, {
        name: data.name,
        level: data.level,
        position: data.position,
        width: data.width,
        height: data.height,
        backgroundColor: data.style.backgroundColor,
        backgroundOpacity: data.style.backgroundOpacity,
        borderColor: data.style.borderColor,
        borderWidth: data.style.borderWidth,
        borderStyle: data.style.borderStyle,
        borderRadius: data.style.borderRadius,
        labelColor: data.style.labelColor,
        labelPosition: data.style.labelPosition
      });
      uiActions.closeGroupEditor();

      const updatedGroup: GroupStyleAnnotation = {
        ...group,
        name: data.name,
        level: data.level,
        position: data.position,
        width: data.width,
        height: data.height,
        backgroundColor: data.style.backgroundColor,
        backgroundOpacity: data.style.backgroundOpacity,
        borderColor: data.style.borderColor,
        borderWidth: data.style.borderWidth,
        borderStyle: data.style.borderStyle,
        borderRadius: data.style.borderRadius,
        labelColor: data.style.labelColor,
        labelPosition: data.style.labelPosition
      };

      undoRedo.commitChange(snapshot, `Edit group ${data.name ?? data.id}`, {
        explicitNodes: [groupToNode(updatedGroup)]
      });
    },
    [derived, uiActions, undoRedo]
  );

  const deleteGroup = useCallback(
    (id: string) => {
      const group = derived.groups.find((g) => g.id === id);
      const snapshot = undoRedo.captureSnapshot({ nodeIds: [id] });
      derived.deleteGroup(id);
      uiActions.removeFromGroupSelection(id);
      if (group) {
        undoRedo.commitChange(snapshot, `Delete group ${group.name ?? group.id}`, {
          explicitNodes: []
        });
      }
    },
    [derived, uiActions, undoRedo]
  );

  const handleAddGroup = useCallback(() => {
    if (mode !== "edit") return;
    if (isLocked) {
      onLockedAction();
      return;
    }

    const viewport = rfInstance?.getViewport() ?? { x: 0, y: 0, zoom: 1 };
    const newGroupId = generateGroupId(derived.groups);
    const padding = 40;

    const rfNodes = rfInstance?.getNodes() ?? [];
    const selectedNodes = rfNodes.filter((n) => n.selected && n.type !== "group");

    const { position, width, height, members } =
      selectedNodes.length > 0
        ? calculateGroupBoundsFromNodes(selectedNodes, padding)
        : calculateDefaultGroupPosition(viewport);

    const parentGroup = findParentGroupForBounds(
      { x: position.x, y: position.y, width, height },
      derived.groups,
      newGroupId
    );

    const newGroup: GroupStyleAnnotation = {
      id: newGroupId,
      name: "New Group",
      level: "1",
      position,
      width,
      height,
      backgroundColor: "rgba(100, 100, 255, 0.1)",
      borderColor: "#666",
      borderWidth: 2,
      borderStyle: "dashed",
      borderRadius: 8,
      members,
      ...(parentGroup ? { parentId: parentGroup.id } : {})
    };

    const snapshot = undoRedo.captureSnapshot({ nodeIds: [newGroupId, ...members] });
    derived.addGroup(newGroup);
    if (members.length > 0) {
      for (const memberId of members) {
        derived.addNodeToGroup(memberId, newGroupId);
      }
    }

    undoRedo.commitChange(snapshot, `Add group ${newGroup.name ?? newGroup.id}`, {
      explicitNodes: [groupToNode(newGroup)]
    });
  }, [mode, isLocked, onLockedAction, rfInstance, derived, undoRedo]);

  const addGroup = useCallback(
    (group: GroupStyleAnnotation) => {
      const memberIds = Array.isArray(group.members) ? (group.members as string[]) : [];
      const snapshot = undoRedo.captureSnapshot({ nodeIds: [group.id, ...memberIds] });
      derived.addGroup(group);
      if (memberIds.length > 0) {
        for (const memberId of memberIds) {
          derived.addNodeToGroup(memberId, group.id);
        }
      }
      undoRedo.commitChange(snapshot, `Add group ${group.name ?? group.id}`, {
        explicitNodes: [groupToNode(group)]
      });
    },
    [derived, undoRedo]
  );

  const updateGroupSize = useCallback(
    (id: string, width: number, height: number) => {
      const group = derived.groups.find((g) => g.id === id);
      if (!group) return;
      const snapshot = undoRedo.captureSnapshot({ nodeIds: [id] });
      derived.updateGroup(id, { width, height });
      const updatedGroup: GroupStyleAnnotation = { ...group, width, height };
      undoRedo.commitChange(snapshot, `Resize group ${id}`, {
        explicitNodes: [groupToNode(updatedGroup)]
      });
    },
    [derived, undoRedo]
  );

  return useMemo(
    () => ({
      editGroup,
      saveGroup,
      deleteGroup,
      handleAddGroup,
      addGroup,
      updateGroupSize
    }),
    [editGroup, saveGroup, deleteGroup, handleAddGroup, addGroup, updateGroupSize]
  );
}
