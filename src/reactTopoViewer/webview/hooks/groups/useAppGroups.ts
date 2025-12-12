/**
 * App-level hook for group management.
 * Provides handlers for group operations with UI integration.
 */
import { useCallback, useEffect } from 'react';
import type { Core as CyCore, NodeSingular } from 'cytoscape';
import type { GroupStyleAnnotation } from '../../../shared/types/topology';
import { useGroups, UseGroupsHookOptions } from './useGroups';

interface InitialData {
  groupStyleAnnotations?: unknown[];
}

interface TopologyDataMessage {
  type: string;
  data?: {
    groupStyleAnnotations?: GroupStyleAnnotation[];
  };
}

interface UseAppGroupsOptions {
  cyInstance: CyCore | null;
  mode: 'edit' | 'view';
  isLocked: boolean;
  onLockedAction?: () => void;
}

/**
 * Check if a node can be added to a group.
 * Returns false for annotations.
 */
function canBeGrouped(node: NodeSingular): boolean {
  const role = node.data('topoViewerRole');
  return role !== 'freeText' && role !== 'freeShape';
}

export function useAppGroups(options: UseAppGroupsOptions) {
  const { cyInstance, mode, isLocked, onLockedAction } = options;

  const hookOptions: UseGroupsHookOptions = {
    cy: cyInstance,
    mode,
    isLocked,
    onLockedAction
  };

  const groupsHook = useGroups(hookOptions);
  const { loadGroups } = groupsHook;

  // Load groups from initial data and extension messages
  useEffect(() => {
    const initialData = (window as unknown as { __INITIAL_DATA__?: InitialData }).__INITIAL_DATA__;
    if (initialData?.groupStyleAnnotations?.length) {
      loadGroups(initialData.groupStyleAnnotations as GroupStyleAnnotation[]);
    }

    const handleMessage = (event: MessageEvent<TopologyDataMessage>) => {
      const message = event.data;
      if (message?.type === 'topology-data' && message.data?.groupStyleAnnotations) {
        loadGroups(message.data.groupStyleAnnotations);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [loadGroups]);

  // Handler for Add Group button - creates group with selected nodes and opens editor
  const handleAddGroup = useCallback(() => {
    if (!cyInstance) return;
    const selectedNodeIds = cyInstance
      .nodes(':selected')
      .filter(n => canBeGrouped(n as NodeSingular))
      .map(n => n.id());

    const groupId = groupsHook.createGroup(selectedNodeIds.length > 0 ? selectedNodeIds : undefined);
    if (groupId) {
      groupsHook.editGroup(groupId);
    }
  }, [cyInstance, groupsHook]);

  return {
    groups: groupsHook,
    handleAddGroup
  };
}
