/**
 * App-level hook for group management.
 * Provides handlers for group operations with UI integration.
 */
import { useCallback, useEffect } from 'react';
import type { Core as CyCore, NodeSingular } from 'cytoscape';
import type { GroupStyleAnnotation, NodeAnnotation } from '../../../shared/types/topology';
import { useGroups } from './useGroups';
import { buildGroupId } from './groupHelpers';

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
 */
function canBeGrouped(node: NodeSingular): boolean {
  const role = node.data('topoViewerRole');
  return role !== 'freeText' && role !== 'freeShape';
}

interface UseAppGroupsOptions {
  cyInstance: CyCore | null;
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

  const groupsHook = useGroups({ cy: cyInstance, mode, isLocked, onLockedAction });
  useGroupDataLoader(groupsHook.loadGroups, groupsHook.initializeMembership);

  const handleAddGroup = useCallback(() => {
    if (!cyInstance) return;
    const selectedNodeIds = cyInstance
      .nodes(':selected')
      .filter(n => canBeGrouped(n as NodeSingular))
      .map(n => n.id());

    const groupId = groupsHook.createGroup(selectedNodeIds.length > 0 ? selectedNodeIds : undefined);
    if (groupId) groupsHook.editGroup(groupId);
  }, [cyInstance, groupsHook]);

  return { groups: groupsHook, handleAddGroup };
}
