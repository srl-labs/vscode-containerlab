/**
 * Group undo/redo handlers - minimal implementations
 */
import { useCallback, useRef } from "react";
import type { ReactFlowInstance } from "@xyflow/react";

import type {
  GroupStyleAnnotation,
  FreeTextAnnotation,
  FreeShapeAnnotation
} from "../../../shared/types/topology";
import type { TopoNode } from "../../../shared/types/graph";
import type { UseUndoRedoReturn } from "../state/useUndoRedo";

import type { useAppGroups } from "./useAppGroups";

type GroupsHook = ReturnType<typeof useAppGroups>["groups"];

interface UseAppGroupUndoHandlersOptions {
  nodes: TopoNode[];
  rfInstance: ReactFlowInstance | null;
  groups: GroupsHook;
  undoRedo: UseUndoRedoReturn;
  textAnnotations: FreeTextAnnotation[];
  shapeAnnotations: FreeShapeAnnotation[];
}

export function useAppGroupUndoHandlers(options: UseAppGroupUndoHandlersOptions) {
  const { rfInstance, groups, undoRedo } = options;

  const handleAddGroupWithUndo = useCallback(() => {
    const viewport = rfInstance?.getViewport() ?? { x: 0, y: 0, zoom: 1 };
    const newGroup: GroupStyleAnnotation = {
      id: groups.generateGroupId(),
      name: "New Group",
      level: "1",
      position: { x: -viewport.x / viewport.zoom + 200, y: -viewport.y / viewport.zoom + 200 },
      width: 300,
      height: 200,
      backgroundColor: "rgba(100, 100, 255, 0.1)",
      borderColor: "#666",
      borderWidth: 2,
      borderStyle: "dashed",
      borderRadius: 8,
      members: []
    };
    groups.addGroup(newGroup);
    undoRedo.pushAction(groups.getUndoRedoAction(null, newGroup));
  }, [rfInstance, groups, undoRedo]);

  const deleteGroupWithUndo = useCallback(
    (id: string) => {
      const group = groups.groups.find((g) => g.id === id);
      if (group) {
        groups.deleteGroup(id);
        undoRedo.pushAction(groups.getUndoRedoAction(group, null));
      }
    },
    [groups, undoRedo]
  );

  return {
    handleAddGroupWithUndo,
    deleteGroupWithUndo
  };
}

export function useGroupUndoRedoHandlers(groups: GroupsHook, undoRedo: UseUndoRedoReturn) {
  const isApplyingRef = useRef(false);

  const updateGroupSizeWithUndo = useCallback(
    (id: string, width: number, height: number) => {
      const group = groups.groups.find((g) => g.id === id);
      if (!group) return;

      const before = { ...group };
      groups.updateGroup(id, { width, height });
      const after = { ...group, width, height };
      undoRedo.pushAction(groups.getUndoRedoAction(before, after));
    },
    [groups, undoRedo]
  );

  return {
    isApplyingGroupUndoRedo: isApplyingRef.current,
    updateGroupSizeWithUndo
  };
}

interface UseGroupDragUndoOptions {
  nodes: TopoNode[];
  rfInstance: ReactFlowInstance | null;
  groups: GroupsHook;
  undoRedo: UseUndoRedoReturn;
  isApplyingGroupUndoRedo: boolean;
  textAnnotations: FreeTextAnnotation[];
  shapeAnnotations: FreeShapeAnnotation[];
  onUpdateTextAnnotation: (id: string, updates: Partial<FreeTextAnnotation>) => void;
  onUpdateShapeAnnotation: (id: string, updates: Partial<FreeShapeAnnotation>) => void;
  onPositionsCommitted: (
    positions: Array<{ id: string; position?: { x: number; y: number } }>
  ) => void;
  onMoveNodes: (positions: Array<{ id: string; position: { x: number; y: number } }>) => void;
}

export function useGroupDragUndo(options: UseGroupDragUndoOptions) {
  const { groups, undoRedo } = options;
  const dragStartRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  const onGroupDragStart = useCallback(
    (groupId: string) => {
      const group = groups.groups.find((g) => g.id === groupId);
      if (group) {
        dragStartRef.current.set(groupId, { x: group.position.x, y: group.position.y });
      }
    },
    [groups]
  );

  const onGroupDragMove = useCallback(
    (groupId: string, delta: { dx: number; dy: number }) => {
      const group = groups.groups.find((g) => g.id === groupId);
      if (group) {
        groups.updateGroup(groupId, {
          position: { x: group.position.x + delta.dx, y: group.position.y + delta.dy }
        });
      }
    },
    [groups]
  );

  const onGroupDragEnd = useCallback(
    (groupId: string, finalPosition: { x: number; y: number }) => {
      const startPos = dragStartRef.current.get(groupId);
      if (!startPos) return;
      dragStartRef.current.delete(groupId);

      const group = groups.groups.find((g) => g.id === groupId);
      if (!group) return;

      const before = { ...group, position: startPos };
      const after = { ...group, position: finalPosition };
      undoRedo.pushAction(groups.getUndoRedoAction(before, after));
    },
    [groups, undoRedo]
  );

  return {
    onGroupDragStart,
    onGroupDragMove,
    onGroupDragEnd
  };
}

interface UseGroupResizeUndoOptions {
  groups: GroupsHook;
  undoRedo: UseUndoRedoReturn;
  isApplyingGroupUndoRedo: boolean;
}

export function useGroupResizeUndo(options: UseGroupResizeUndoOptions) {
  const { groups, undoRedo } = options;
  const resizeStartRef = useRef<Map<string, GroupStyleAnnotation>>(new Map());

  const onResizeStart = useCallback(
    (groupId: string) => {
      const group = groups.groups.find((g) => g.id === groupId);
      if (group) {
        resizeStartRef.current.set(groupId, { ...group });
      }
    },
    [groups]
  );

  const onResizeMove = useCallback(
    (groupId: string, width: number, height: number, position: { x: number; y: number }) => {
      groups.updateGroup(groupId, { width, height, position });
    },
    [groups]
  );

  const onResizeEnd = useCallback(
    (
      groupId: string,
      finalWidth: number,
      finalHeight: number,
      finalPosition: { x: number; y: number }
    ) => {
      const startGroup = resizeStartRef.current.get(groupId);
      if (!startGroup) return;
      resizeStartRef.current.delete(groupId);

      const group = groups.groups.find((g) => g.id === groupId);
      if (!group) return;

      const after = { ...group, width: finalWidth, height: finalHeight, position: finalPosition };
      undoRedo.pushAction(groups.getUndoRedoAction(startGroup, after));
    },
    [groups, undoRedo]
  );

  return {
    onResizeStart,
    onResizeMove,
    onResizeEnd
  };
}
