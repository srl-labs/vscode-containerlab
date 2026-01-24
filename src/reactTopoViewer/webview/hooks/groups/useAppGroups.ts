/**
 * App-level hook for group management.
 * Provides handlers for group operations with UI integration.
 */
import type React from "react";
import { useCallback, useEffect, useRef } from "react";

import type { GroupStyleAnnotation, NodeAnnotation } from "../../../shared/types/topology";
import { log } from "../../utils/logger";
import { subscribeToWebviewMessages, type TypedMessageEvent } from "../../utils/webviewMessageBus";

import { useGroups } from "./useGroups";
import { buildGroupId, parseGroupId, calculateBoundingBox } from "./groupHelpers";

interface InitialData {
  groupStyleAnnotations?: unknown[];
  nodeAnnotations?: NodeAnnotation[];
}

interface TopologyDataMessage {
  type: "topology-data";
  data: {
    groupStyleAnnotations?: GroupStyleAnnotation[];
    nodeAnnotations?: NodeAnnotation[];
  };
}

type MembershipEntry = { nodeId: string; groupId: string };

/**
 * Extract group memberships from node annotations.
 */
function extractMemberships(
  nodeAnnotations: NodeAnnotation[] | undefined,
  groups: GroupStyleAnnotation[] | undefined
): MembershipEntry[] {
  if (!nodeAnnotations) return [];

  const groupKeyToIds = new Map<string, string[]>();
  (groups ?? []).forEach((group) => {
    const key = buildGroupId(group.name, group.level);
    const list = groupKeyToIds.get(key) ?? [];
    list.push(group.id);
    groupKeyToIds.set(key, list);
  });

  const memberships: MembershipEntry[] = [];
  for (const ann of nodeAnnotations) {
    if (ann.groupId) {
      memberships.push({ nodeId: ann.id, groupId: ann.groupId });
      continue;
    }
    if (ann.group && ann.level) {
      const key = buildGroupId(ann.group, ann.level);
      const ids = groupKeyToIds.get(key) ?? [];
      if (ids.length > 1) {
        log.warn(
          `[Groups] Ambiguous membership for ${ann.id}: ${key} maps to ${ids.length} groups`
        );
      }
      if (ids.length > 0) {
        memberships.push({ nodeId: ann.id, groupId: ids[0] });
      } else {
        log.warn(`[Groups] No group match for membership ${ann.id}: ${key}`);
      }
    }
  }

  return memberships;
}

/**
 * Migrate legacy groups that are missing geometry fields.
 * Legacy TopoViewer stored only styling (colors, borders) without position/width/height.
 * This function computes geometry from member node positions in nodeAnnotations.
 */
function migrateLegacyGroups(
  groups: GroupStyleAnnotation[] | undefined,
  nodeAnnotations: NodeAnnotation[] | undefined
): GroupStyleAnnotation[] {
  if (!groups?.length) return [];

  return groups.map((group) => {
    const labelColor = group.labelColor ?? group.color;

    // Already has geometry - just ensure name/level exist
    if (group.position && group.width && group.height) {
      if (!group.name || !group.level) {
        const { name, level } = parseGroupId(group.id);
        const updated = { ...group, name, level };
        return labelColor !== undefined ? { ...updated, labelColor } : updated;
      }
      return labelColor !== undefined ? { ...group, labelColor } : group;
    }

    // Legacy group - compute geometry from member node positions
    const { name, level } = parseGroupId(group.id);

    // Find member nodes with positions
    const memberPositions = (nodeAnnotations || [])
      .filter((ann) => ann.group === name && ann.level === level && ann.position)
      .map((ann) => ann.position!);

    // Calculate bounding box from positions
    const bounds = calculateBoundingBox(memberPositions);

    const updated = {
      ...group,
      name,
      level,
      position: bounds.position,
      width: bounds.width,
      height: bounds.height
    };
    return labelColor !== undefined ? { ...updated, labelColor } : updated;
  });
}

/**
 * Check if a node can be added to a group based on its role.
 * NOTE: During ReactFlow migration, this function is not used.
 * Selection filtering should be done at the React level.
 */
function canBeGrouped(role: string | undefined): boolean {
  return role !== "freeText" && role !== "freeShape";
}

interface UseAppGroupsOptions {
  /** React Flow nodes for position queries */
  nodes: import("../../../shared/types/graph").TopoNode[];
  /** React Flow instance for viewport queries */
  rfInstance: import("@xyflow/react").ReactFlowInstance | null;
  mode: "edit" | "view";
  isLocked: boolean;
  onLockedAction?: () => void;
  /** Callback to reassign text annotations when group membership changes */
  onMigrateTextAnnotations?: (oldGroupId: string, newGroupId: string | null) => void;
  /** Callback to reassign shape annotations when group membership changes */
  onMigrateShapeAnnotations?: (oldGroupId: string, newGroupId: string | null) => void;
}

/**
 * Hook for loading groups and memberships from initial data.
 * Handles migration of legacy groups that are missing geometry fields.
 */
function useGroupDataLoader(
  loadGroups: (
    groups: GroupStyleAnnotation[] | ((prev: GroupStyleAnnotation[]) => GroupStyleAnnotation[]),
    persistToExtension?: boolean
  ) => void,
  initializeMembership: (memberships: MembershipEntry[]) => void,
  currentGroupsRef: React.RefObject<GroupStyleAnnotation[]>
): void {
  useEffect(() => {
    const initialData = (window as unknown as { __INITIAL_DATA__?: InitialData }).__INITIAL_DATA__;
    const nodeAnnotations = initialData?.nodeAnnotations;

    // Migrate legacy groups and load
    const rawGroups = initialData?.groupStyleAnnotations as GroupStyleAnnotation[] | undefined;
    const migratedGroups = migrateLegacyGroups(rawGroups, nodeAnnotations);
    if (migratedGroups.length) loadGroups(migratedGroups, false);

    // Extract memberships after group migration so we can resolve group IDs
    const memberships = extractMemberships(nodeAnnotations, migratedGroups);
    if (memberships.length) initializeMembership(memberships);

    const handleMessage = (event: TypedMessageEvent) => {
      const message = event.data as TopologyDataMessage | undefined;
      if (!message || message.type !== "topology-data" || !message.data) return;
      const data = message.data;

      // Extract memberships for migration - always update from topology refresh
      // as this syncs with the YAML file
      const msgNodeAnnotations = data.nodeAnnotations;
      // Only update membership when nodeAnnotations are present in the message.
      // Some topology refreshes omit nodeAnnotations; in that case we keep local membership state.
      const msgGroups = data.groupStyleAnnotations as GroupStyleAnnotation[] | undefined;
      const membershipGroups =
        msgGroups && msgGroups.length > 0 ? msgGroups : currentGroupsRef.current;
      if (msgNodeAnnotations) {
        initializeMembership(extractMemberships(msgNodeAnnotations, membershipGroups));
      }

      // Group reload logic:
      // - Normally we DON'T reload groups from topology-refresh to avoid race conditions
      //   during undo/redo where stale data could overwrite in-flight changes
      // - HOWEVER, if React has no groups but the file has groups, this indicates
      //   the topology was reloaded from file and we should sync the state
      // This handles the "reload from file" case (BUG-NESTED-GROUP-CREATE-001)
      const hasMessageGroups = msgGroups && msgGroups.length > 0;
      const hasNoLocalGroups = currentGroupsRef.current.length === 0;

      if (hasMessageGroups && hasNoLocalGroups) {
        const migratedGroups = migrateLegacyGroups(msgGroups, msgNodeAnnotations);
        if (migratedGroups.length) {
          loadGroups(migratedGroups, false);
        }
      }
    };
    return subscribeToWebviewMessages(handleMessage, (e) => e.data?.type === "topology-data");
  }, [loadGroups, initializeMembership, currentGroupsRef]);
}

export function useAppGroups(options: UseAppGroupsOptions) {
  const {
    nodes,
    rfInstance,
    mode,
    isLocked,
    onLockedAction,
    onMigrateTextAnnotations,
    onMigrateShapeAnnotations
  } = options;

  const groupsHook = useGroups({
    nodes,
    rfInstance,
    mode,
    isLocked,
    onLockedAction,
    onMigrateTextAnnotations,
    onMigrateShapeAnnotations
  });

  // Keep a ref to current groups for race condition handling
  const currentGroupsRef = useRef<GroupStyleAnnotation[]>([]);
  currentGroupsRef.current = groupsHook.groups;

  useGroupDataLoader(groupsHook.loadGroups, groupsHook.initializeMembership, currentGroupsRef);

  const handleAddGroup = useCallback(() => {
    // NOTE: During ReactFlow migration, selection state is managed by ReactFlow.
    // This function now creates an empty group. Selection-based group creation
    // should be handled by the component using ReactFlow's selection state.
    void canBeGrouped; // Suppress unused warning
    const result = groupsHook.createGroup();
    if (result) groupsHook.editGroup(result.groupId);
  }, [groupsHook]);

  return { groups: groupsHook, handleAddGroup };
}
