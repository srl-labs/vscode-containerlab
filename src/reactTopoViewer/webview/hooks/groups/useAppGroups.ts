/**
 * App-level hook for group management.
 * Provides handlers for group operations with UI integration.
 */
import type React from 'react';
import { useCallback, useEffect, useRef } from 'react';
import type { Core as CyCore, NodeSingular } from 'cytoscape';

import type { GroupStyleAnnotation, NodeAnnotation } from '../../../shared/types/topology';
import { subscribeToWebviewMessages, type TypedMessageEvent } from '../../utils/webviewMessageBus';

import { useGroups } from './useGroups';
import { buildGroupId, parseGroupId, calculateBoundingBox } from './groupHelpers';

interface InitialData {
  groupStyleAnnotations?: unknown[];
  nodeAnnotations?: NodeAnnotation[];
}

interface TopologyDataMessage {
  type: 'topology-data';
  data: {
    groupStyleAnnotations?: GroupStyleAnnotation[];
    nodeAnnotations?: NodeAnnotation[];
  };
}

type MembershipEntry = { nodeId: string; groupId: string };

/**
 * Extract group memberships from node annotations.
 */
function extractMemberships(nodeAnnotations: NodeAnnotation[] | undefined): MembershipEntry[] {
  if (!nodeAnnotations) return [];
  return nodeAnnotations
    .filter(ann => ann.group && ann.level)
    .map(ann => ({ nodeId: ann.id, groupId: buildGroupId(ann.group!, ann.level!) }));
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

  return groups.map(group => {
    // Already has geometry - just ensure name/level exist
    if (group.position && group.width && group.height) {
      if (!group.name || !group.level) {
        const { name, level } = parseGroupId(group.id);
        return { ...group, name, level };
      }
      return group;
    }

    // Legacy group - compute geometry from member node positions
    const { name, level } = parseGroupId(group.id);

    // Find member nodes with positions
    const memberPositions = (nodeAnnotations || [])
      .filter(ann => ann.group === name && ann.level === level && ann.position)
      .map(ann => ann.position!);

    // Calculate bounding box from positions
    const bounds = calculateBoundingBox(memberPositions);

    return {
      ...group,
      name,
      level,
      position: bounds.position,
      width: bounds.width,
      height: bounds.height
    };
  });
}

/**
 * Check if a node can be added to a group.
 */
function canBeGrouped(node: NodeSingular): boolean {
  const role = node.data('topoViewerRole') as string | undefined;
  return role !== 'freeText' && role !== 'freeShape';
}

interface UseAppGroupsOptions {
  cyInstance: CyCore | null;
  mode: 'edit' | 'view';
  isLocked: boolean;
  onLockedAction?: () => void;
  /** Callback to migrate text annotations when a group is renamed */
  onMigrateTextAnnotations?: (oldGroupId: string, newGroupId: string) => void;
  /** Callback to migrate shape annotations when a group is renamed */
  onMigrateShapeAnnotations?: (oldGroupId: string, newGroupId: string) => void;
}

/**
 * Hook for loading groups and memberships from initial data.
 * Handles migration of legacy groups that are missing geometry fields.
 */
function useGroupDataLoader(
  loadGroups: (groups: GroupStyleAnnotation[], persistToExtension?: boolean) => void,
  initializeMembership: (memberships: MembershipEntry[]) => void,
  currentGroupsRef: React.RefObject<GroupStyleAnnotation[]>
): void {
  useEffect(() => {
    const initialData = (window as unknown as { __INITIAL_DATA__?: InitialData }).__INITIAL_DATA__;
    const nodeAnnotations = initialData?.nodeAnnotations;

    // Extract memberships first (needed for migration)
    const memberships = extractMemberships(nodeAnnotations);
    if (memberships.length) initializeMembership(memberships);

    // Migrate legacy groups and load
    const rawGroups = initialData?.groupStyleAnnotations as GroupStyleAnnotation[] | undefined;
    const migratedGroups = migrateLegacyGroups(rawGroups, nodeAnnotations);
    if (migratedGroups.length) loadGroups(migratedGroups, false);

    const handleMessage = (event: TypedMessageEvent) => {
      const message = event.data as TopologyDataMessage | undefined;
      if (!message || message.type !== 'topology-data' || !message.data) return;
      const data = message.data;

      // Extract memberships for migration - always update from topology refresh
      // as this syncs with the YAML file
      const msgNodeAnnotations = data.nodeAnnotations;
      // Only update membership when nodeAnnotations are present in the message.
      // Some topology refreshes omit nodeAnnotations; in that case we keep local membership state.
      if (msgNodeAnnotations) {
        initializeMembership(extractMemberships(msgNodeAnnotations));
      }

      // Group reload logic:
      // - Normally we DON'T reload groups from topology-refresh to avoid race conditions
      //   during undo/redo where stale data could overwrite in-flight changes
      // - HOWEVER, if React has no groups but the file has groups, this indicates
      //   the topology was reloaded from file and we should sync the state
      // This handles the "reload from file" case (BUG-NESTED-GROUP-CREATE-001)
      const msgGroups = data.groupStyleAnnotations as GroupStyleAnnotation[] | undefined;
      const hasMessageGroups = msgGroups && msgGroups.length > 0;
      const hasNoLocalGroups = currentGroupsRef.current.length === 0;

      if (hasMessageGroups && hasNoLocalGroups) {
        const migratedGroups = migrateLegacyGroups(msgGroups, msgNodeAnnotations);
        if (migratedGroups.length) {
          loadGroups(migratedGroups, false);
        }
      }
    };
    return subscribeToWebviewMessages(handleMessage, (e) => e.data?.type === 'topology-data');
  }, [loadGroups, initializeMembership, currentGroupsRef]);
}

export function useAppGroups(options: UseAppGroupsOptions) {
  const { cyInstance, mode, isLocked, onLockedAction, onMigrateTextAnnotations, onMigrateShapeAnnotations } = options;

  const groupsHook = useGroups({
    cy: cyInstance,
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
    if (!cyInstance) return;
    const selectedNodeIds = cyInstance
      .nodes(':selected')
      .filter(n => canBeGrouped(n as NodeSingular))
      .map(n => n.id());

    const result = groupsHook.createGroup(selectedNodeIds.length > 0 ? selectedNodeIds : undefined);
    if (result) groupsHook.editGroup(result.groupId);
  }, [cyInstance, groupsHook]);

  return { groups: groupsHook, handleAddGroup };
}
