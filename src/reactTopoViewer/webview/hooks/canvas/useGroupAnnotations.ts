import { useCallback, useMemo } from "react";
import type { Node, ReactFlowInstance } from "@xyflow/react";

import type { GroupStyleAnnotation } from "../../../shared/types/topology";
import type { GroupNodeData } from "../../components/canvas/types";
import type { AnnotationUIActions } from "../../stores/annotationUIStore";
import { saveAnnotationNodesFromGraph, saveAnnotationNodesWithMemberships } from "../../services";
import { useGraphStore } from "../../stores/graphStore";
import { collectNodeGroupMemberships } from "../../annotations/groupMembership";
import {
  GROUP_NODE_TYPE,
  nodeToGroup,
  resolveGroupParentId
} from "../../annotations/annotationNodeConverters";

import type { GroupEditorData } from "./groupTypes";
import { calculateDefaultGroupPosition, calculateGroupBoundsFromNodes } from "./annotationHelpers";
import { findParentGroupForBounds, generateGroupId } from "./groupUtils";
import type { UseDerivedAnnotationsReturn } from "./useDerivedAnnotations";
import { readThemeColor } from "./themeColor";
interface UseGroupAnnotationsParams {
  isLocked: boolean;
  onLockedAction: () => void;
  rfInstance: ReactFlowInstance | null;
  derived: UseDerivedAnnotationsReturn;
  uiActions: Pick<AnnotationUIActions, "setEditingGroup" | "removeFromGroupSelection">;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isGroupNodeData(value: unknown): value is GroupNodeData {
  if (!isRecord(value)) return false;
  return (
    typeof value.name === "string" &&
    typeof value.level === "string" &&
    typeof value.width === "number" &&
    typeof value.height === "number"
  );
}

function isGroupNode(node: Node): node is Node<GroupNodeData> {
  return node.type === GROUP_NODE_TYPE && isGroupNodeData(node.data);
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

export interface GroupAnnotationActions {
  editGroup: (id: string) => void;
  saveGroup: (data: GroupEditorData) => void;
  deleteGroup: (id: string) => void;
  handleAddGroup: () => void;
  createGroupAtPosition: (position: { x: number; y: number }) => void;
  addGroup: (group: GroupStyleAnnotation) => void;
  updateGroupSize: (id: string, width: number, height: number) => void;
}

function buildGroupsSnapshot(
  derived: UseDerivedAnnotationsReturn,
  graphNodes: Node[]
): GroupStyleAnnotation[] {
  if (derived.groups.length > 0) return derived.groups;

  return graphNodes.filter(isGroupNode).map((node) => nodeToGroup(node));
}

function getGroupDeletionContext(
  derived: UseDerivedAnnotationsReturn,
  groupsSnapshot: GroupStyleAnnotation[],
  id: string
): {
  parentId: string | null;
  memberIds: string[];
  childGroups: GroupStyleAnnotation[];
  textIds: Set<string>;
  shapeIds: Set<string>;
  trafficRateIds: Set<string>;
} {
  const group = groupsSnapshot.find((g) => g.id === id);
  const parentId = group ? (resolveGroupParentId(group.parentId, group.groupId) ?? null) : null;
  const memberIds = derived.getGroupMembers(id);
  const childGroups = groupsSnapshot.filter(
    (g) => resolveGroupParentId(g.parentId, g.groupId) === id
  );
  const textIds = new Set(derived.textAnnotations.map((t) => t.id));
  const shapeIds = new Set(derived.shapeAnnotations.map((s) => s.id));
  const trafficRateIds = new Set(derived.trafficRateAnnotations.map((entry) => entry.id));

  return {
    parentId,
    memberIds,
    childGroups,
    textIds,
    shapeIds,
    trafficRateIds
  };
}

function updateChildGroupParents(
  derived: UseDerivedAnnotationsReturn,
  childGroups: GroupStyleAnnotation[],
  parentId: string | null
): void {
  for (const child of childGroups) {
    derived.updateGroup(child.id, {
      parentId: parentId ?? undefined,
      groupId: parentId ?? undefined
    });
  }
}

function reassignGroupMembers(
  derived: UseDerivedAnnotationsReturn,
  memberIds: string[],
  parentId: string | null,
  textIds: Set<string>,
  shapeIds: Set<string>,
  trafficRateIds: Set<string>
): void {
  for (const memberId of memberIds) {
    if (textIds.has(memberId)) {
      derived.updateTextAnnotation(memberId, { groupId: parentId ?? undefined });
      continue;
    }
    if (shapeIds.has(memberId)) {
      derived.updateShapeAnnotation(memberId, { groupId: parentId ?? undefined });
      continue;
    }
    if (trafficRateIds.has(memberId)) {
      derived.updateTrafficRateAnnotation(memberId, { groupId: parentId ?? undefined });
      continue;
    }

    if (parentId !== null && parentId.length > 0) {
      derived.addNodeToGroup(memberId, parentId);
    } else {
      derived.removeNodeFromGroup(memberId);
    }
  }
}

export function useGroupAnnotations(params: UseGroupAnnotationsParams): GroupAnnotationActions {
  const { isLocked, onLockedAction, rfInstance, derived, uiActions } = params;
  const canEditAnnotations = !isLocked;

  const persist = useCallback(() => {
    void saveAnnotationNodesFromGraph();
  }, []);

  /** Persist annotations + memberships as a single host command (one undo step). */
  const persistWithMemberships = useCallback(() => {
    const memberships = collectNodeGroupMemberships(useGraphStore.getState().nodes);
    void saveAnnotationNodesWithMemberships(memberships);
  }, []);

  const editGroup = useCallback(
    (id: string) => {
      const group = derived.groups.find((g) => g.id === id);
      if (!group) return;

      uiActions.setEditingGroup({
        id: group.id,
        name: group.name,
        level: group.level,
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
        width: group.width,
        height: group.height
      });
    },
    [derived.groups, uiActions]
  );

  const saveGroup = useCallback(
    (data: GroupEditorData) => {
      const group = derived.groups.find((g) => g.id === data.id);
      if (!group) return;

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
      persist();
    },
    [derived, persist]
  );

  const deleteGroup = useCallback(
    (id: string) => {
      const graphNodes = useGraphStore.getState().nodes;
      const groupsSnapshot = buildGroupsSnapshot(derived, graphNodes);
      const { parentId, memberIds, childGroups, textIds, shapeIds, trafficRateIds } =
        getGroupDeletionContext(
        derived,
        groupsSnapshot,
        id
      );

      derived.deleteGroup(id);
      uiActions.removeFromGroupSelection(id);

      // Promote child groups to parent (or clear parent if none)
      updateChildGroupParents(derived, childGroups, parentId);
      reassignGroupMembers(derived, memberIds, parentId, textIds, shapeIds, trafficRateIds);

      const memberships = collectNodeGroupMemberships(useGraphStore.getState().nodes);
      void saveAnnotationNodesWithMemberships(memberships);
    },
    [derived, uiActions]
  );

  const handleAddGroup = useCallback(() => {
    if (!canEditAnnotations) {
      onLockedAction();
      return;
    }

    const viewport = rfInstance?.getViewport() ?? { x: 0, y: 0, zoom: 1 };
    const newGroupId = generateGroupId(derived.groups);
    const padding = 40;

    const rfNodes = rfInstance?.getNodes() ?? [];
    const selectedNodes = rfNodes.filter((n) => n.selected === true && n.type !== "group");

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
      borderColor: readThemeColor("--vscode-editor-foreground", "#666666"),
      borderWidth: 2,
      borderStyle: "dashed",
      borderRadius: 8,
      members,
      ...(parentGroup ? { parentId: parentGroup.id, groupId: parentGroup.id } : {})
    };

    derived.addGroup(newGroup);
    if (members.length > 0) {
      for (const memberId of members) {
        derived.addNodeToGroup(memberId, newGroupId);
      }
    }

    persistWithMemberships();
  }, [canEditAnnotations, onLockedAction, rfInstance, derived, persistWithMemberships]);

  const createGroupAtPosition = useCallback(
    (position: { x: number; y: number }) => {
      if (!canEditAnnotations) {
        onLockedAction();
        return;
      }

      const newGroupId = generateGroupId(derived.groups);
      const padding = 40;

      const rfNodes = rfInstance?.getNodes() ?? [];
      const selectedNodes = rfNodes.filter((n) => n.selected === true && n.type !== "group");

      const bounds =
        selectedNodes.length > 0
          ? calculateGroupBoundsFromNodes(selectedNodes, padding)
          : {
              position,
              width: 300,
              height: 200,
              members: []
            };

      const parentGroup = findParentGroupForBounds(
        { x: bounds.position.x, y: bounds.position.y, width: bounds.width, height: bounds.height },
        derived.groups,
        newGroupId
      );

      const newGroup: GroupStyleAnnotation = {
        id: newGroupId,
        name: "New Group",
        level: "1",
        position: bounds.position,
        width: bounds.width,
        height: bounds.height,
        backgroundColor: "rgba(100, 100, 255, 0.1)",
        borderColor: readThemeColor("--vscode-editor-foreground", "#666666"),
        borderWidth: 2,
        borderStyle: "dashed",
        borderRadius: 8,
        members: bounds.members,
        ...(parentGroup ? { parentId: parentGroup.id, groupId: parentGroup.id } : {})
      };

      derived.addGroup(newGroup);
      if (bounds.members.length > 0) {
        for (const memberId of bounds.members) {
          derived.addNodeToGroup(memberId, newGroupId);
        }
      }

      persistWithMemberships();
    },
    [canEditAnnotations, onLockedAction, rfInstance, derived, persistWithMemberships]
  );

  const addGroup = useCallback(
    (group: GroupStyleAnnotation) => {
      const memberIds = toStringArray(group.members);
      derived.addGroup(group);
      if (memberIds.length > 0) {
        for (const memberId of memberIds) {
          derived.addNodeToGroup(memberId, group.id);
        }
      }
      persistWithMemberships();
    },
    [derived, persistWithMemberships]
  );

  const updateGroupSize = useCallback(
    (id: string, width: number, height: number) => {
      const group = derived.groups.find((g) => g.id === id);
      if (!group) return;
      derived.updateGroup(id, { width, height });
      persist();
    },
    [derived, persist]
  );

  return useMemo(
    () => ({
      editGroup,
      saveGroup,
      deleteGroup,
      handleAddGroup,
      createGroupAtPosition,
      addGroup,
      updateGroupSize
    }),
    [
      editGroup,
      saveGroup,
      deleteGroup,
      handleAddGroup,
      createGroupAtPosition,
      addGroup,
      updateGroupSize
    ]
  );
}
