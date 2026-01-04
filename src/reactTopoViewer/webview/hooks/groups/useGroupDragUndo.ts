/**
 * Hook for tracking group drag operations with undo support.
 * Captures group + member node positions on drag start/end to create compound undo actions.
 * Supports hierarchical group movement - dragging a parent moves all descendants.
 */
import type React from 'react';
import { useCallback, useRef } from 'react';
import type { Core as CyCore, NodeSingular } from 'cytoscape';

import type { GroupStyleAnnotation, FreeTextAnnotation, FreeShapeAnnotation } from '../../../shared/types/topology';
import type { UndoRedoAction, UndoRedoActionGroupMove, NodePositionEntry } from '../state/useUndoRedo';
import { log } from '../../utils/logger';
import { saveNodePositions } from '../../services';

import type { UseGroupsReturn } from './groupTypes';
import { getDescendantGroups, getAllAnnotationsInHierarchy } from './hierarchyUtils';

interface UndoRedoApi {
  pushAction: (action: UndoRedoAction) => void;
  capturePositions: (nodeIds: string[]) => NodePositionEntry[];
}

interface DragStartState {
  groupId: string;
  groupBefore: GroupStyleAnnotation;
  nodesBefore: NodePositionEntry[];
  memberNodeIds: string[];
  // Hierarchical state
  descendantGroupsBefore: GroupStyleAnnotation[];
  descendantNodeIds: string[];
  textAnnotationsBefore: FreeTextAnnotation[];
  shapeAnnotationsBefore: FreeShapeAnnotation[];
}

export interface UseGroupDragUndoOptions {
  cyInstance: CyCore | null;
  groups: UseGroupsReturn;
  undoRedo: UndoRedoApi;
  isApplyingGroupUndoRedo: React.RefObject<boolean>;
  // Annotation state for hierarchical movement
  textAnnotations?: FreeTextAnnotation[];
  shapeAnnotations?: FreeShapeAnnotation[];
  onUpdateTextAnnotation?: (id: string, updates: Partial<FreeTextAnnotation>) => void;
  onUpdateShapeAnnotation?: (id: string, updates: Partial<FreeShapeAnnotation>) => void;
  /** Callback to sync committed positions into React state (prevents position drift on next reconcile) */
  onPositionsCommitted?: (positions: NodePositionEntry[]) => void;
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

/** Capture drag start state including full hierarchy */
function captureDragStartState(
  group: GroupStyleAnnotation,
  memberNodeIds: string[],
  capturePositions: (ids: string[]) => NodePositionEntry[],
  groupId: string,
  allGroups: GroupStyleAnnotation[],
  getGroupMembers: (id: string) => string[],
  textAnnotations: FreeTextAnnotation[],
  shapeAnnotations: FreeShapeAnnotation[]
): DragStartState {
  // Get all descendant groups
  const descendantGroups = getDescendantGroups(groupId, allGroups);

  // Collect all member node IDs from the entire hierarchy
  const allMemberNodeIds = new Set<string>(memberNodeIds);
  for (const descendant of descendantGroups) {
    const members = getGroupMembers(descendant.id);
    members.forEach(id => allMemberNodeIds.add(id));
  }
  const descendantNodeIds = Array.from(allMemberNodeIds).filter(id => !memberNodeIds.includes(id));

  // Get all annotations in the hierarchy
  const { texts, shapes } = getAllAnnotationsInHierarchy(
    groupId,
    allGroups,
    textAnnotations,
    shapeAnnotations
  );

  // Capture ALL node positions (direct members + descendants) for proper undo
  const allNodeIds = [...memberNodeIds, ...descendantNodeIds];

  return {
    groupId,
    groupBefore: cloneGroup(group),
    nodesBefore: capturePositions(allNodeIds),
    memberNodeIds,
    // Hierarchical state
    descendantGroupsBefore: descendantGroups.map(g => cloneGroup(g)),
    descendantNodeIds,
    textAnnotationsBefore: texts.map(t => ({ ...t, position: { ...t.position } })),
    shapeAnnotationsBefore: shapes.map(s => ({ ...s, position: { ...s.position }, endPosition: s.endPosition ? { ...s.endPosition } : undefined }))
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

/** Move descendant groups by delta */
function moveDescendantGroups(
  descendantIds: string[],
  delta: { dx: number; dy: number },
  updateGroupPosition: (id: string, pos: { x: number; y: number }) => void,
  groups: GroupStyleAnnotation[]
): void {
  descendantIds.forEach(groupId => {
    const group = groups.find(g => g.id === groupId);
    if (group) {
      const newPos = {
        x: group.position.x + delta.dx,
        y: group.position.y + delta.dy
      };
      updateGroupPosition(groupId, newPos);
    }
  });
}

/** Move annotations by delta */
function moveAnnotations(
  textAnnotations: FreeTextAnnotation[],
  shapeAnnotations: FreeShapeAnnotation[],
  textIds: string[],
  shapeIds: string[],
  delta: { dx: number; dy: number },
  onUpdateText?: (id: string, updates: Partial<FreeTextAnnotation>) => void,
  onUpdateShape?: (id: string, updates: Partial<FreeShapeAnnotation>) => void
): void {
  textIds.forEach(id => {
    const annotation = textAnnotations.find(t => t.id === id);
    if (annotation && onUpdateText) {
      onUpdateText(id, {
        position: {
          x: annotation.position.x + delta.dx,
          y: annotation.position.y + delta.dy
        }
      });
    }
  });

  shapeIds.forEach(id => {
    const annotation = shapeAnnotations.find(s => s.id === id);
    if (annotation && onUpdateShape) {
      const updates: Partial<FreeShapeAnnotation> = {
        position: {
          x: annotation.position.x + delta.dx,
          y: annotation.position.y + delta.dy
        }
      };
      // Also move endPosition for lines
      if (annotation.endPosition) {
        updates.endPosition = {
          x: annotation.endPosition.x + delta.dx,
          y: annotation.endPosition.y + delta.dy
        };
      }
      onUpdateShape(id, updates);
    }
  });
}

/** Create group move undo action with full hierarchical state */
function createGroupMoveAction(
  startState: DragStartState,
  finalPosition: { x: number; y: number },
  nodesAfter: NodePositionEntry[],
  descendantGroupsAfter: GroupStyleAnnotation[],
  textAnnotationsAfter: FreeTextAnnotation[],
  shapeAnnotationsAfter: FreeShapeAnnotation[]
): UndoRedoActionGroupMove {
  return {
    type: 'group-move',
    groupBefore: startState.groupBefore,
    groupAfter: { ...startState.groupBefore, position: { ...finalPosition } },
    nodesBefore: startState.nodesBefore,
    nodesAfter,
    // Hierarchical state for proper undo/redo
    descendantGroupsBefore: startState.descendantGroupsBefore,
    descendantGroupsAfter: descendantGroupsAfter.map(g => cloneGroup(g)),
    textAnnotationsBefore: startState.textAnnotationsBefore,
    textAnnotationsAfter: textAnnotationsAfter.map(t => ({ ...t, position: { ...t.position } })),
    shapeAnnotationsBefore: startState.shapeAnnotationsBefore,
    shapeAnnotationsAfter: shapeAnnotationsAfter.map(s => ({ ...s, position: { ...s.position }, endPosition: s.endPosition ? { ...s.endPosition } : undefined }))
  };
}

/** Save node positions via TopologyIO service and sync to React state */
function sendNodePositionsToExtension(
  positions: NodePositionEntry[],
  onPositionsCommitted?: (positions: NodePositionEntry[]) => void
): void {
  if (positions.length === 0) return;
  void saveNodePositions(positions);
  // Sync to React state to prevent position drift on next reconcile
  onPositionsCommitted?.(positions);
  log.info(`[GroupDragUndo] Saved ${positions.length} member node positions`);
}

/** Handle fallback drag end when start state is missing */
function handleFallbackDragEnd(
  groupId: string,
  finalPosition: { x: number; y: number },
  getGroupMembers: (id: string) => string[],
  capturePositions: (ids: string[]) => NodePositionEntry[],
  updateGroupPosition: (id: string, pos: { x: number; y: number }) => void,
  onPositionsCommitted?: (positions: NodePositionEntry[]) => void
): void {
  const memberIds = getGroupMembers(groupId);
  if (memberIds.length > 0) {
    sendNodePositionsToExtension(capturePositions(memberIds), onPositionsCommitted);
  }
  updateGroupPosition(groupId, finalPosition);
}

/** Process drag end and potentially push undo action */
function processDragEnd(
  startState: DragStartState,
  finalPosition: { x: number; y: number },
  nodesAfter: NodePositionEntry[],
  descendantGroupsAfter: GroupStyleAnnotation[],
  textAnnotationsAfter: FreeTextAnnotation[],
  shapeAnnotationsAfter: FreeShapeAnnotation[],
  pushAction: (action: UndoRedoAction) => void,
  groupId: string,
  onPositionsCommitted?: (positions: NodePositionEntry[]) => void
): void {
  const posChanged = hasPositionChanged(startState.groupBefore.position, finalPosition);
  const nodesChanged = hasNodesChanged(startState.nodesBefore, nodesAfter);

  if (posChanged || nodesChanged) {
    pushAction(createGroupMoveAction(
      startState,
      finalPosition,
      nodesAfter,
      descendantGroupsAfter,
      textAnnotationsAfter,
      shapeAnnotationsAfter
    ));
    // Persist node positions to annotations.json and sync to React state
    sendNodePositionsToExtension(nodesAfter, onPositionsCommitted);
    log.info(`[GroupDragUndo] Recorded group move for ${groupId} with ${nodesAfter.length} nodes`);
  }
}

export function useGroupDragUndo(options: UseGroupDragUndoOptions): UseGroupDragUndoReturn {
  const {
    cyInstance,
    groups,
    undoRedo,
    isApplyingGroupUndoRedo,
    textAnnotations = [],
    shapeAnnotations = [],
    onUpdateTextAnnotation,
    onUpdateShapeAnnotation,
    onPositionsCommitted
  } = options;
  const dragStartRef = useRef<DragStartState | null>(null);

  const onGroupDragStart = useCallback((groupId: string) => {
    if (!cyInstance || isApplyingGroupUndoRedo.current) return;
    const group = groups.groups.find(g => g.id === groupId);
    if (!group) return;
    const memberNodeIds = groups.getGroupMembers(groupId);

    // Capture full hierarchical state
    dragStartRef.current = captureDragStartState(
      group,
      memberNodeIds,
      undoRedo.capturePositions,
      groupId,
      groups.groups,
      groups.getGroupMembers,
      textAnnotations,
      shapeAnnotations
    );

    const descendantCount = dragStartRef.current.descendantGroupsBefore.length;
    const textCount = dragStartRef.current.textAnnotationsBefore.length;
    const shapeCount = dragStartRef.current.shapeAnnotationsBefore.length;
    log.info(
      `[GroupDragUndo] Drag started for group ${groupId} with ${memberNodeIds.length} members, ` +
      `${descendantCount} descendant groups, ${textCount} texts, ${shapeCount} shapes`
    );
  }, [cyInstance, groups, undoRedo, isApplyingGroupUndoRedo, textAnnotations, shapeAnnotations]);

  const onGroupDragEnd = useCallback((
    groupId: string,
    finalPosition: { x: number; y: number },
    _delta: { dx: number; dy: number }
  ) => {
    if (!cyInstance || isApplyingGroupUndoRedo.current) return;
    const startState = dragStartRef.current;
    if (!startState || startState.groupId !== groupId) {
      handleFallbackDragEnd(groupId, finalPosition, groups.getGroupMembers, undoRedo.capturePositions, groups.updateGroupPosition, onPositionsCommitted);
      return;
    }

    // Capture all node positions (including from descendants)
    const allNodeIds = [...startState.memberNodeIds, ...startState.descendantNodeIds];
    const nodesAfter = undoRedo.capturePositions(allNodeIds);

    // Capture current state of descendant groups (their positions have been updated during drag)
    const descendantGroupIds = startState.descendantGroupsBefore.map(g => g.id);
    const descendantGroupsAfter = groups.groups.filter(g => descendantGroupIds.includes(g.id));

    // Capture current state of annotations (their positions have been updated during drag)
    const textIds = startState.textAnnotationsBefore.map(t => t.id);
    const shapeIds = startState.shapeAnnotationsBefore.map(s => s.id);
    const textAnnotationsAfter = textAnnotations.filter(t => textIds.includes(t.id));
    const shapeAnnotationsAfter = shapeAnnotations.filter(s => shapeIds.includes(s.id));

    processDragEnd(
      startState,
      finalPosition,
      nodesAfter,
      descendantGroupsAfter,
      textAnnotationsAfter,
      shapeAnnotationsAfter,
      undoRedo.pushAction,
      groupId,
      onPositionsCommitted
    );
    groups.updateGroupPosition(groupId, finalPosition);
    dragStartRef.current = null;
  }, [cyInstance, groups, undoRedo, isApplyingGroupUndoRedo, textAnnotations, shapeAnnotations, onPositionsCommitted]);

  const onGroupDragMove = useCallback((groupId: string, delta: { dx: number; dy: number }) => {
    if (!cyInstance || (delta.dx === 0 && delta.dy === 0)) return;

    const startState = dragStartRef.current;
    if (!startState) {
      // Fallback: just move direct members
      moveMemberNodes(cyInstance, groups.getGroupMembers(groupId), delta);
      return;
    }

    // Move all member nodes (including descendants)
    const allNodeIds = [...startState.memberNodeIds, ...startState.descendantNodeIds];
    moveMemberNodes(cyInstance, allNodeIds, delta);

    // Move descendant groups
    if (startState.descendantGroupsBefore.length > 0) {
      moveDescendantGroups(
        startState.descendantGroupsBefore.map(g => g.id),
        delta,
        groups.updateGroupPosition,
        groups.groups
      );
    }

    // Move annotations in the hierarchy
    if (startState.textAnnotationsBefore.length > 0 || startState.shapeAnnotationsBefore.length > 0) {
      moveAnnotations(
        textAnnotations,
        shapeAnnotations,
        startState.textAnnotationsBefore.map(t => t.id),
        startState.shapeAnnotationsBefore.map(s => s.id),
        delta,
        onUpdateTextAnnotation,
        onUpdateShapeAnnotation
      );
    }
  }, [cyInstance, groups, textAnnotations, shapeAnnotations, onUpdateTextAnnotation, onUpdateShapeAnnotation]);

  return { onGroupDragStart, onGroupDragEnd, onGroupDragMove };
}
