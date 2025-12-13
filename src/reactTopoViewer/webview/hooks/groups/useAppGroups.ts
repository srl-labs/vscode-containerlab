/**
 * App-level hook for group management.
 * Provides handlers for group operations with UI integration.
 *
 * [MIGRATION] Migrate to @xyflow/react - replace node selection logic
 */
import { useCallback, useEffect } from 'react';
import type { GroupStyleAnnotation, NodeAnnotation } from '../../../shared/types/topology';
import { useGroups } from './useGroups';
import { buildGroupId } from './groupHelpers';

// [MIGRATION] Replace with ReactFlow types from @xyflow/react
interface ReactFlowNode { id: string; data: Record<string, unknown> }

interface InitialData {
  groupStyleAnnotations?: unknown[];
  nodeAnnotations?: NodeAnnotation[];
}

interface TopologyDataMessage {
  type: string;
  data?: {
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
 * Check if a node can be added to a group.
 * [MIGRATION] Update for ReactFlow node structure
 */
function canBeGrouped(node: ReactFlowNode): boolean {
  const role = node.data?.topoViewerRole;
  return role !== 'freeText' && role !== 'freeShape';
}

interface UseAppGroupsOptions {
  /** [MIGRATION] Replace with ReactFlowInstance from @xyflow/react */
  cyInstance?: unknown;
  mode: 'edit' | 'view';
  isLocked: boolean;
  onLockedAction?: () => void;
}

/**
 * Hook for loading groups and memberships from initial data.
 */
function useGroupDataLoader(
  loadGroups: (groups: GroupStyleAnnotation[]) => void,
  initializeMembership: (memberships: MembershipEntry[]) => void
): void {
  useEffect(() => {
    const initialData = (window as unknown as { __INITIAL_DATA__?: InitialData }).__INITIAL_DATA__;
    const groups = initialData?.groupStyleAnnotations as GroupStyleAnnotation[] | undefined;
    if (groups?.length) loadGroups(groups);

    const memberships = extractMemberships(initialData?.nodeAnnotations);
    if (memberships.length) initializeMembership(memberships);

    const handleMessage = (event: MessageEvent<TopologyDataMessage>) => {
      const data = event.data?.data;
      if (event.data?.type !== 'topology-data' || !data) return;
      if (data.groupStyleAnnotations) loadGroups(data.groupStyleAnnotations);
      initializeMembership(extractMemberships(data.nodeAnnotations));
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [loadGroups, initializeMembership]);
}

export function useAppGroups(options: UseAppGroupsOptions) {
  const { cyInstance, mode, isLocked, onLockedAction } = options;

  const groupsHook = useGroups({ cyInstance, mode, isLocked, onLockedAction });
  useGroupDataLoader(groupsHook.loadGroups, groupsHook.initializeMembership);

  const handleAddGroup = useCallback(() => {
    // [MIGRATION] Use ReactFlow selection instead of cyInstance
    const groupId = groupsHook.createGroup();
    if (groupId) groupsHook.editGroup(groupId);
  }, [groupsHook]);

  return { groups: groupsHook, handleAddGroup };
}
