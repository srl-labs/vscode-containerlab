/**
 * Hook for managing group annotations
 * Provides state and actions for groups
 */
import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import type { ReactFlowInstance } from "@xyflow/react";

import type { GroupStyleAnnotation } from "../../../shared/types/topology";
import type { TopoNode } from "../../../shared/types/graph";
import { subscribeToWebviewMessages, type TypedMessageEvent } from "../../utils/webviewMessageBus";
import { saveGroupStyleAnnotations, saveNodeGroupMembership } from "../../services";
import { useDebouncedSave, SAVE_DEBOUNCE_MS } from "../annotations/sharedAnnotationHelpers";

import type { GroupEditorData } from "./groupTypes";
import { groupToEditorData, editorDataToGroup } from "./groupTypes";
import { generateGroupId } from "./groupUtils";

interface UseAppGroupsOptions {
  nodes: TopoNode[];
  rfInstance: ReactFlowInstance | null;
  mode: "edit" | "view";
  isLocked: boolean;
  onLockedAction: () => void;
  onMigrateTextAnnotations?: (oldGroupId: string, newGroupId: string | null) => void;
  onMigrateShapeAnnotations?: (oldGroupId: string, newGroupId: string | null) => void;
}

interface NodeAnnotation {
  id: string;
  group?: string;
  groupId?: string;
}

interface TopologyDataMessage {
  type: "topology-data";
  data: {
    groupStyleAnnotations?: GroupStyleAnnotation[];
    nodeAnnotations?: NodeAnnotation[];
  };
}

interface InitialData {
  groupStyleAnnotations?: GroupStyleAnnotation[];
  nodeAnnotations?: NodeAnnotation[];
}

export function useAppGroups(options: UseAppGroupsOptions) {
  const { mode, isLocked, onLockedAction } = options;

  const [groups, setGroups] = useState<GroupStyleAnnotation[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());
  const [editingGroup, setEditingGroup] = useState<GroupEditorData | null>(null);

  // Debounced save for persistence
  const { saveDebounced: saveGroupsToExtension } = useDebouncedSave(
    saveGroupStyleAnnotations,
    "Groups",
    SAVE_DEBOUNCE_MS
  );

  // Track if we're loading from initial data (skip save during load)
  const isLoadingRef = useRef(true);

  // Auto-save groups when they change (after initial load)
  useEffect(() => {
    if (isLoadingRef.current) return;
    saveGroupsToExtension(groups);
  }, [groups, saveGroupsToExtension]);

  // Membership tracking: nodeId -> groupId
  const membershipMapRef = useRef<Map<string, string>>(new Map());

  // Helper to build membership map from nodeAnnotations (old format only)
  // Membership is stored on nodeAnnotations[].group or nodeAnnotations[].groupId
  const buildMembershipMap = (
    groups: GroupStyleAnnotation[],
    nodeAnnotations?: NodeAnnotation[]
  ): Map<string, string> => {
    const newMap = new Map<string, string>();

    if (nodeAnnotations) {
      for (const nodeAnn of nodeAnnotations) {
        const groupRef = nodeAnn.groupId || nodeAnn.group;
        if (groupRef) {
          // Verify the group exists
          const groupExists = groups.some((g) => g.id === groupRef);
          if (groupExists) {
            newMap.set(nodeAnn.id, groupRef);
          }
        }
      }
    }

    return newMap;
  };

  // Load groups from initial data
  useEffect(() => {
    const initialData = (window as { __INITIAL_DATA__?: InitialData }).__INITIAL_DATA__;

    if (initialData?.groupStyleAnnotations?.length) {
      setGroups(initialData.groupStyleAnnotations);
      membershipMapRef.current = buildMembershipMap(
        initialData.groupStyleAnnotations,
        initialData.nodeAnnotations
      );
    }
    // Mark loading complete after initial setup
    setTimeout(() => {
      isLoadingRef.current = false;
    }, 0);

    const handleMessage = (event: TypedMessageEvent) => {
      const message = event.data as TopologyDataMessage | undefined;
      if (message?.type === "topology-data") {
        const newGroups = message.data?.groupStyleAnnotations || [];
        setGroups(newGroups);
        membershipMapRef.current = buildMembershipMap(newGroups, message.data?.nodeAnnotations);
      }
    };
    return subscribeToWebviewMessages(handleMessage, (e) => e.data?.type === "topology-data");
  }, []);

  // Selection actions
  const selectGroup = useCallback((id: string) => {
    setSelectedGroupIds(new Set([id]));
  }, []);

  const toggleGroupSelection = useCallback((id: string) => {
    setSelectedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const boxSelectGroups = useCallback((ids: string[]) => {
    setSelectedGroupIds(new Set(ids));
  }, []);

  const clearGroupSelection = useCallback(() => {
    setSelectedGroupIds(new Set());
  }, []);

  // Editor actions
  const editGroup = useCallback(
    (id: string) => {
      if (mode === "edit" && isLocked) {
        onLockedAction();
        return;
      }
      const group = groups.find((g) => g.id === id);
      if (group) {
        setEditingGroup(groupToEditorData(group));
      }
    },
    [groups, mode, isLocked, onLockedAction]
  );

  const closeEditor = useCallback(() => {
    setEditingGroup(null);
  }, []);

  const saveGroup = useCallback((data: GroupEditorData) => {
    const updated = editorDataToGroup(data);
    setGroups((prev) => {
      const idx = prev.findIndex((g) => g.id === data.id);
      if (idx >= 0) {
        const newGroups = [...prev];
        newGroups[idx] = updated;
        return newGroups;
      }
      return [...prev, updated];
    });
    setEditingGroup(null);
  }, []);

  const addGroup = useCallback((group: GroupStyleAnnotation) => {
    setGroups((prev) => [...prev, group]);
  }, []);

  const deleteGroup = useCallback((id: string) => {
    setGroups((prev) => prev.filter((g) => g.id !== id));
    // Clear membership for nodes that were in this group
    membershipMapRef.current.forEach((groupId, nodeId) => {
      if (groupId === id) {
        membershipMapRef.current.delete(nodeId);
      }
    });
  }, []);

  const updateGroup = useCallback((id: string, updates: Partial<GroupStyleAnnotation>) => {
    setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, ...updates } : g)));
  }, []);

  const updateGroupParent = useCallback((id: string, parentId: string | null) => {
    setGroups((prev) =>
      prev.map((g) => (g.id === id ? { ...g, parentId: parentId ?? undefined } : g))
    );
  }, []);

  const updateGroupGeoPosition = useCallback((id: string, coords: { lat: number; lng: number }) => {
    setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, geoCoordinates: coords } : g)));
  }, []);

  // Membership actions - uses old format (stored on nodeAnnotations.group)
  const addNodeToGroup = useCallback((nodeId: string, groupId: string) => {
    membershipMapRef.current.set(nodeId, groupId);
    // Save to nodeAnnotations (old format)
    void saveNodeGroupMembership(nodeId, groupId);
  }, []);

  const removeNodeFromGroup = useCallback((nodeId: string) => {
    membershipMapRef.current.delete(nodeId);
    // Save to nodeAnnotations (old format) - null removes the group field
    void saveNodeGroupMembership(nodeId, null);
  }, []);

  const getNodeMembership = useCallback((nodeId: string): string | null => {
    return membershipMapRef.current.get(nodeId) ?? null;
  }, []);

  const getGroupMembers = useCallback((groupId: string): string[] => {
    // Read from membership map (old format - stored on nodeAnnotations)
    const members: string[] = [];
    membershipMapRef.current.forEach((gId, nodeId) => {
      if (gId === groupId) {
        members.push(nodeId);
      }
    });
    return members;
  }, []);

  const getUndoRedoAction = useCallback(
    (before: GroupStyleAnnotation | null, after: GroupStyleAnnotation | null) => ({
      type: "annotation" as const,
      annotationType: "group" as const,
      before,
      after
    }),
    []
  );

  return {
    groups: useMemo(
      () => ({
        groups,
        selectedGroupIds,
        editingGroup,
        selectGroup,
        toggleGroupSelection,
        boxSelectGroups,
        clearGroupSelection,
        editGroup,
        closeEditor,
        saveGroup,
        addGroup,
        deleteGroup,
        updateGroup,
        updateGroupParent,
        updateGroupGeoPosition,
        addNodeToGroup,
        removeNodeFromGroup,
        getNodeMembership,
        getGroupMembers,
        getUndoRedoAction,
        generateGroupId: () => generateGroupId(groups)
      }),
      [
        groups,
        selectedGroupIds,
        editingGroup,
        selectGroup,
        toggleGroupSelection,
        boxSelectGroups,
        clearGroupSelection,
        editGroup,
        closeEditor,
        saveGroup,
        addGroup,
        deleteGroup,
        updateGroup,
        updateGroupParent,
        updateGroupGeoPosition,
        addNodeToGroup,
        removeNodeFromGroup,
        getNodeMembership,
        getGroupMembers,
        getUndoRedoAction
      ]
    )
  };
}
