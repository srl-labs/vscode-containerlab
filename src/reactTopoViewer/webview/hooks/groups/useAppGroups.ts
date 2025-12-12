/**
 * App-level hook for group management.
 * Provides handlers for group operations with UI integration.
 */
import React, { useCallback, useEffect } from 'react';
import type { Core as CyCore, NodeSingular } from 'cytoscape';
import type { GroupStyleAnnotation } from '../../../shared/types/topology';
import { useGroups, UseGroupsHookOptions } from './useGroups';
import { canBeGrouped } from './groupHelpers';

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

export function useAppGroups(options: UseAppGroupsOptions) {
  const { cyInstance, mode, isLocked, onLockedAction } = options;

  const hookOptions: UseGroupsHookOptions = {
    cy: cyInstance,
    mode,
    isLocked,
    onLockedAction
  };

  const groups = useGroups(hookOptions);
  const { loadGroupStyles } = groups;

  // Load group styles from initial data and extension messages
  useEffect(() => {
    const initialData = (window as unknown as { __INITIAL_DATA__?: InitialData }).__INITIAL_DATA__;
    if (initialData?.groupStyleAnnotations?.length) {
      loadGroupStyles(initialData.groupStyleAnnotations as GroupStyleAnnotation[]);
    }

    const handleMessage = (event: MessageEvent<TopologyDataMessage>) => {
      const message = event.data;
      if (message?.type === 'topology-data' && message.data?.groupStyleAnnotations) {
        loadGroupStyles(message.data.groupStyleAnnotations);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [loadGroupStyles]);

  // Handler for Add Group button - creates group with selected nodes and opens editor
  const handleAddGroup = useCallback(() => {
    if (!cyInstance) return;
    const selectedNodeIds = cyInstance
      .nodes(':selected')
      .filter(n => canBeGrouped(n as NodeSingular))
      .map(n => n.id());

    const groupId = groups.createGroup(selectedNodeIds.length > 0 ? selectedNodeIds : undefined);
    if (groupId) {
      groups.editGroup(groupId);
    }
  }, [cyInstance, groups]);

  return {
    groups,
    handleAddGroup
  };
}
