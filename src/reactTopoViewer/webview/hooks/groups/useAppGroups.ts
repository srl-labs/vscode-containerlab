/**
 * App-level hook for group management.
 * Provides handlers for group operations with UI integration.
 */
import { useCallback, useEffect } from 'react';
import type { Core as CyCore, NodeSingular } from 'cytoscape';
import type { GroupStyleAnnotation, NodeAnnotation } from '../../../shared/types/topology';
import { useGroups } from './useGroups';
import { buildGroupId, parseGroupId, calculateBoundingBox } from './groupHelpers';

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
  const role = node.data('topoViewerRole');
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
  loadGroups: (groups: GroupStyleAnnotation[]) => void,
  initializeMembership: (memberships: MembershipEntry[]) => void
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
    if (migratedGroups.length) loadGroups(migratedGroups);

    const handleMessage = (event: MessageEvent<TopologyDataMessage>) => {
      const data = event.data?.data;
      if (event.data?.type !== 'topology-data' || !data) return;

      // Extract memberships for migration
      const msgNodeAnnotations = data.nodeAnnotations;
      initializeMembership(extractMemberships(msgNodeAnnotations));

      // Migrate legacy groups and load
      const msgGroups = migrateLegacyGroups(data.groupStyleAnnotations, msgNodeAnnotations);
      if (msgGroups.length) loadGroups(msgGroups);
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [loadGroups, initializeMembership]);
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
