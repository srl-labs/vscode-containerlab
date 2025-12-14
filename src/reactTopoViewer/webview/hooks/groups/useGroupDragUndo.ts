/**
 * Hook for tracking group drag operations with undo support.
 * Captures group + member node positions on drag start/end to create compound undo actions.
 */
import React, { useCallback, useRef } from 'react';
import type { Core as CyCore, NodeSingular } from 'cytoscape';
import type { GroupStyleAnnotation } from '../../../shared/types/topology';
import type { UndoRedoAction, UndoRedoActionGroupMove, NodePositionEntry } from '../state/useUndoRedo';
import type { UseGroupsReturn } from './groupTypes';
import { log } from '../../utils/logger';
import { sendCommandToExtension } from '../../utils/extensionMessaging';

interface UndoRedoApi {
  pushAction: (action: UndoRedoAction) => void;
  capturePositions: (nodeIds: string[]) => NodePositionEntry[];
}

interface DragStartState {
  groupId: string;
  groupBefore: GroupStyleAnnotation;
  nodesBefore: NodePositionEntry[];
  memberNodeIds: string[];
}

export interface UseGroupDragUndoOptions {
  cyInstance: CyCore | null;
  groups: UseGroupsReturn;
  undoRedo: UndoRedoApi;
  isApplyingGroupUndoRedo: React.RefObject<boolean>;
}

export interface UseGroupDragUndoReturn {
  /** Call when group drag starts to capture initial state */
  onGroupDragStart: (groupId: string) => void;
  /** Call when group drag ends to record undo action (returns position handler) */
  onGroupDragEnd: (
    groupId: string,
    finalPosition: { x: number; y: number },
    delta: { dx: number; dy: number }
  ) => void;
  /** Handler for real-time node movement during drag */
  onGroupDragMove: (groupId: string, delta: { dx: number; dy: number }) => void;
}

function cloneGroup(group: GroupStyleAnnotation): GroupStyleAnnotation {
  return { ...group, position: { ...group.position } };
}

/** Check if group position changed */
function hasPositionChanged(
  before: { x: number; y: number },
  after: { x: number; y: number }
): boolean {
  return before.x !== after.x || before.y !== after.y;
}

/** Check if any node positions changed */
function hasNodesChanged(
  nodesBefore: NodePositionEntry[],
  nodesAfter: NodePositionEntry[]
): boolean {
  return nodesBefore.some(before => {
    const after = nodesAfter.find(a => a.id === before.id);
    return after && hasPositionChanged(before.position, after.position);
  });
}

/** Capture drag start state */
function captureDragStartState(
  group: GroupStyleAnnotation,
  memberNodeIds: string[],
  capturePositions: (ids: string[]) => NodePositionEntry[],
  groupId: string
): DragStartState {
  return {
    groupId,
    groupBefore: cloneGroup(group),
    nodesBefore: capturePositions(memberNodeIds),
    memberNodeIds
  };
}

/** Move member nodes by delta */
function moveMemberNodes(
  cyInstance: CyCore,
  memberIds: string[],
  delta: { dx: number; dy: number }
): void {
  memberIds.forEach(nodeId => {
    const node = cyInstance.getElementById(nodeId) as NodeSingular;
    if (node.length > 0) {
      const currentPos = node.position();
      node.position({ x: currentPos.x + delta.dx, y: currentPos.y + delta.dy });
    }
  });
}

/** Create group move undo action */
function createGroupMoveAction(
  startState: DragStartState,
  finalPosition: { x: number; y: number },
  nodesAfter: NodePositionEntry[]
): UndoRedoActionGroupMove {
  return {
    type: 'group-move',
    groupBefore: startState.groupBefore,
    groupAfter: { ...startState.groupBefore, position: { ...finalPosition } },
    nodesBefore: startState.nodesBefore,
    nodesAfter
  };
}

/** Send node positions to extension for persistence */
function sendNodePositionsToExtension(positions: NodePositionEntry[]): void {
  if (positions.length === 0) return;
  sendCommandToExtension('save-node-positions', { positions });
  log.info(`[GroupDragUndo] Sent ${positions.length} member node positions to extension`);
}

/** Handle fallback drag end when start state is missing */
function handleFallbackDragEnd(
  groupId: string,
  finalPosition: { x: number; y: number },
  getGroupMembers: (id: string) => string[],
  capturePositions: (ids: string[]) => NodePositionEntry[],
  updateGroupPosition: (id: string, pos: { x: number; y: number }) => void
): void {
  const memberIds = getGroupMembers(groupId);
  if (memberIds.length > 0) {
    sendNodePositionsToExtension(capturePositions(memberIds));
  }
  updateGroupPosition(groupId, finalPosition);
}

/** Process drag end and potentially push undo action */
function processDragEnd(
  startState: DragStartState,
  finalPosition: { x: number; y: number },
  nodesAfter: NodePositionEntry[],
  pushAction: (action: UndoRedoAction) => void,
  groupId: string
): void {
  const posChanged = hasPositionChanged(startState.groupBefore.position, finalPosition);
  const nodesChanged = hasNodesChanged(startState.nodesBefore, nodesAfter);

  if (posChanged || nodesChanged) {
    pushAction(createGroupMoveAction(startState, finalPosition, nodesAfter));
    // Persist node positions to annotations.json
    sendNodePositionsToExtension(nodesAfter);
    log.info(`[GroupDragUndo] Recorded group move for ${groupId} with ${nodesAfter.length} nodes`);
  }
}

export function useGroupDragUndo(options: UseGroupDragUndoOptions): UseGroupDragUndoReturn {
  const { cyInstance, groups, undoRedo, isApplyingGroupUndoRedo } = options;
  const dragStartRef = useRef<DragStartState | null>(null);

  const onGroupDragStart = useCallback((groupId: string) => {
    if (!cyInstance || isApplyingGroupUndoRedo.current) return;
    const group = groups.groups.find(g => g.id === groupId);
    if (!group) return;
    const memberNodeIds = groups.getGroupMembers(groupId);
    dragStartRef.current = captureDragStartState(group, memberNodeIds, undoRedo.capturePositions, groupId);
    log.info(`[GroupDragUndo] Drag started for group ${groupId} with ${memberNodeIds.length} members`);
  }, [cyInstance, groups, undoRedo, isApplyingGroupUndoRedo]);

  const onGroupDragEnd = useCallback((
    groupId: string,
    finalPosition: { x: number; y: number },
    _delta: { dx: number; dy: number }
  ) => {
    if (!cyInstance || isApplyingGroupUndoRedo.current) return;
    const startState = dragStartRef.current;
    if (!startState || startState.groupId !== groupId) {
      handleFallbackDragEnd(groupId, finalPosition, groups.getGroupMembers, undoRedo.capturePositions, groups.updateGroupPosition);
      return;
    }
    const nodesAfter = undoRedo.capturePositions(startState.memberNodeIds);
    processDragEnd(startState, finalPosition, nodesAfter, undoRedo.pushAction, groupId);
    groups.updateGroupPosition(groupId, finalPosition);
    dragStartRef.current = null;
  }, [cyInstance, groups, undoRedo, isApplyingGroupUndoRedo]);

  const onGroupDragMove = useCallback((groupId: string, delta: { dx: number; dy: number }) => {
    if (!cyInstance || (delta.dx === 0 && delta.dy === 0)) return;
    moveMemberNodes(cyInstance, groups.getGroupMembers(groupId), delta);
  }, [cyInstance, groups]);

  return { onGroupDragStart, onGroupDragEnd, onGroupDragMove };
}
