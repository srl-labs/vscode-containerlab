/**
 * Undo/Redo Hook for Node Position History
 * Manages undo/redo stack for node drag operations
 */
import React, { useReducer, useCallback, useMemo } from 'react';
import { Core } from 'cytoscape';
import { CyElement } from '../../../shared/types/messages';
import { log } from '../../utils/logger';

/**
 * VS Code API interface for posting messages
 */
declare const vscode: {
  postMessage: (msg: unknown) => void;
};

/**
 * Represents a node position entry
 */
export interface NodePositionEntry {
  id: string;
  position: { x: number; y: number };
}

/**
 * Represents a node's group membership
 */
export interface MembershipEntry {
  nodeId: string;
  groupId: string | null;
}

/**
 * Represents a single undo/redo action
 */
type GraphEntity = 'node' | 'edge';
type GraphChangeKind = 'add' | 'delete' | 'update';

export interface GraphChange {
  entity: GraphEntity;
  kind: GraphChangeKind;
  before?: CyElement;
  after?: CyElement;
}

export interface UndoRedoActionMove {
  type: 'move';
  /** Positions before the action (for undo) */
  before: NodePositionEntry[];
  /** Positions after the action (for redo) */
  after: NodePositionEntry[];
  /** Group membership before the move (optional, for undo) */
  membershipBefore?: MembershipEntry[];
  /** Group membership after the move (optional, for redo) */
  membershipAfter?: MembershipEntry[];
  [key: string]: unknown;
}

export interface UndoRedoActionGraph {
  type: 'graph';
  /** Graph changes to apply on undo */
  before: GraphChange[];
  /** Graph changes to apply on redo */
  after: GraphChange[];
  [key: string]: unknown;
}

/**
 * Represents a property edit action (for node/link editor changes)
 */
export interface UndoRedoActionPropertyEdit {
  type: 'property-edit';
  /** Entity type being edited */
  entityType: 'node' | 'link';
  /** Node/Edge ID (original ID before any rename) */
  entityId: string;
  /** Editor data before the change */
  before: Record<string, unknown>;
  /** Editor data after the change */
  after: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Represents an annotation action (for free text/shapes/groups)
 */
export interface UndoRedoActionAnnotation {
  type: 'annotation';
  /** Annotation type being modified */
  annotationType: 'freeText' | 'freeShape' | 'group';
  /** Annotation state before the change (null = didn't exist) */
  before: Record<string, unknown> | null;
  /** Annotation state after the change (null = deleted) */
  after: Record<string, unknown> | null;
  [key: string]: unknown;
}

/**
 * Represents a compound group move action (group + member nodes move together)
 */
export interface UndoRedoActionGroupMove {
  type: 'group-move';
  /** Group state before the move */
  groupBefore: Record<string, unknown>;
  /** Group state after the move */
  groupAfter: Record<string, unknown>;
  /** Node positions before the move */
  nodesBefore: NodePositionEntry[];
  /** Node positions after the move */
  nodesAfter: NodePositionEntry[];
  /** Descendant group states before the move (for hierarchical groups) */
  descendantGroupsBefore?: Record<string, unknown>[];
  /** Descendant group states after the move (for hierarchical groups) */
  descendantGroupsAfter?: Record<string, unknown>[];
  /** Text annotations before the move */
  textAnnotationsBefore?: Record<string, unknown>[];
  /** Text annotations after the move */
  textAnnotationsAfter?: Record<string, unknown>[];
  /** Shape annotations before the move */
  shapeAnnotationsBefore?: Record<string, unknown>[];
  /** Shape annotations after the move */
  shapeAnnotationsAfter?: Record<string, unknown>[];
  [key: string]: unknown;
}

export type UndoRedoAction = UndoRedoActionMove | UndoRedoActionGraph | UndoRedoActionPropertyEdit | UndoRedoActionAnnotation | UndoRedoActionGroupMove;

/**
 * State shape for the undo/redo system
 */
interface UndoRedoState {
  past: UndoRedoAction[];
  future: UndoRedoAction[];
}

/**
 * Actions for the undo/redo reducer
 */
type UndoRedoReducerAction =
  | { type: 'PUSH'; action: UndoRedoAction }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'CLEAR' };

const MAX_HISTORY_SIZE = 50;
const ACTION_TYPE_GROUP_MOVE = 'group-move';

const initialState: UndoRedoState = {
  past: [],
  future: []
};

/**
 * Reducer for undo/redo state management
 */
function undoRedoReducer(state: UndoRedoState, reducerAction: UndoRedoReducerAction): UndoRedoState {
  switch (reducerAction.type) {
    case 'PUSH': {
      const newPast = [...state.past, reducerAction.action];
      // Limit history size
      if (newPast.length > MAX_HISTORY_SIZE) {
        newPast.shift();
      }
      return {
        past: newPast,
        future: [] // Clear future on new action
      };
    }
    case 'UNDO': {
      if (state.past.length === 0) return state;
      const lastAction = state.past[state.past.length - 1];
      return {
        past: state.past.slice(0, -1),
        future: [lastAction, ...state.future]
      };
    }
    case 'REDO': {
      if (state.future.length === 0) return state;
      const nextAction = state.future[0];
      return {
        past: [...state.past, nextAction],
        future: state.future.slice(1)
      };
    }
    case 'CLEAR':
      return initialState;
    default:
      return state;
  }
}

/**
 * Apply positions to Cytoscape nodes
 */
function applyPositionsToGraph(cy: Core, positions: NodePositionEntry[]): void {
  cy.batch(() => {
    for (const entry of positions) {
      const node = cy.getElementById(entry.id);
      if (node.length > 0 && node.isNode()) {
        node.position(entry.position);
      }
    }
  });
}

/**
 * Send positions to extension for persistence
 */
function sendPositionsToExtension(positions: NodePositionEntry[]): void {
  if (typeof vscode === 'undefined') {
    log.warn('[UndoRedo] VS Code API not available');
    return;
  }

  vscode.postMessage({
    command: 'save-node-positions',
    positions: positions
  });

  log.info(`[UndoRedo] Sent ${positions.length} node positions to extension`);
}

/**
 * Send membership changes to extension for persistence
 */
function sendMembershipToExtension(memberships: MembershipEntry[]): void {
  if (typeof vscode === 'undefined') {
    log.warn('[UndoRedo] VS Code API not available');
    return;
  }

  for (const entry of memberships) {
    // Parse groupId to get name and level (groupId format: "name:level")
    let group: string | null = null;
    let level: string | null = null;
    if (entry.groupId) {
      const parts = entry.groupId.split(':');
      group = parts[0];
      level = parts[1] ?? '1';
    }
    vscode.postMessage({
      command: 'save-node-group-membership',
      nodeId: entry.nodeId,
      group,
      level
    });
  }

  log.info(`[UndoRedo] Sent ${memberships.length} membership changes to extension`);
}

/**
 * Options for the useUndoRedo hook
 */
export interface UseUndoRedoOptions {
  /** Cytoscape instance */
  cy: Core | null;
  /** Whether undo/redo is enabled (typically only in edit mode) */
  enabled?: boolean;
  /** Apply graph changes for non-position actions (create/delete/update) */
  applyGraphChanges?: (changes: GraphChange[]) => void;
  /** Apply property edit for undo/redo of editor changes.
   * @param action The full action containing before/after states
   * @param isUndo True if this is an undo operation, false for redo
   */
  applyPropertyEdit?: (action: UndoRedoActionPropertyEdit, isUndo: boolean) => void;
  /** Apply annotation change for undo/redo
   * @param action The full action containing before/after states
   * @param isUndo True if this is an undo operation, false for redo
   */
  applyAnnotationChange?: (action: UndoRedoActionAnnotation, isUndo: boolean) => void;
  /** Apply group move action for undo/redo (group + nodes moved together)
   * @param action The full action containing group and node states
   * @param isUndo True if this is an undo operation, false for redo
   */
  applyGroupMoveChange?: (action: UndoRedoActionGroupMove, isUndo: boolean) => void;
  /** Apply membership changes for undo/redo (updates in-memory membership)
   * @param memberships The membership entries to apply
   */
  applyMembershipChange?: (memberships: MembershipEntry[]) => void;
}

/**
 * Return type for the useUndoRedo hook
 */
export interface UseUndoRedoReturn {
  /** Whether undo is available */
  canUndo: boolean;
  /** Whether redo is available */
  canRedo: boolean;
  /** Number of actions in undo stack */
  undoCount: number;
  /** Number of actions in redo stack */
  redoCount: number;
  /** Perform undo operation */
  undo: () => void;
  /** Perform redo operation */
  redo: () => void;
  /** Push a new action to history */
  pushAction: (action: UndoRedoAction) => void;
  /** Record a node move (captures before/after positions and optional membership) */
  recordMove: (nodeIds: string[], beforePositions: NodePositionEntry[], membershipBefore?: MembershipEntry[], membershipAfter?: MembershipEntry[]) => void;
  /** Clear all history */
  clearHistory: () => void;
  /** Capture current positions for specified nodes (use before drag starts) */
  capturePositions: (nodeIds: string[]) => NodePositionEntry[];
}

/** Helper hook for capturing node positions */
function useCapturePositions(cy: Core | null) {
  return useCallback((nodeIds: string[]): NodePositionEntry[] => {
    if (!cy) return [];
    return nodeIds
      .map(id => {
        const node = cy.getElementById(id);
        if (node.length > 0 && node.isNode()) {
          const pos = node.position();
          return { id, position: { x: Math.round(pos.x), y: Math.round(pos.y) } };
        }
        return { id, position: { x: 0, y: 0 } };
      })
      .filter(entry => entry.position.x !== 0 || entry.position.y !== 0);
  }, [cy]);
}

/** Helper hook for push action */
function usePushAction(enabled: boolean, dispatch: React.Dispatch<UndoRedoReducerAction>) {
  return useCallback((action: UndoRedoAction) => {
    if (!enabled) return;
    dispatch({ type: 'PUSH', action });
    let count = 0;
    if (action.type === 'move') {
      count = action.after.length;
    } else if (action.type === ACTION_TYPE_GROUP_MOVE) {
      count = action.nodesAfter.length + 1; // nodes + group
    } else if (action.type === 'graph' && Array.isArray(action.after)) {
      count = action.after.length;
    } else {
      count = 1;
    }
    log.info(`[UndoRedo] Pushed action: ${action.type} for ${count} item(s)`);
  }, [enabled, dispatch]);
}

/** Helper hook for undo operation */
function useUndoAction(
  canUndo: boolean,
  cy: Core | null,
  past: UndoRedoAction[],
  dispatch: React.Dispatch<UndoRedoReducerAction>,
  applyGraphChanges?: (changes: GraphChange[]) => void,
  applyPropertyEdit?: (action: UndoRedoActionPropertyEdit, isUndo: boolean) => void,
  applyAnnotationChange?: (action: UndoRedoActionAnnotation, isUndo: boolean) => void,
  applyGroupMoveChange?: (action: UndoRedoActionGroupMove, isUndo: boolean) => void,
  applyMembershipChange?: (memberships: MembershipEntry[]) => void
) {
  return useCallback(() => {
    if (!canUndo || !cy) return;
    const lastAction = past[past.length - 1];
    if (lastAction.type === 'move') {
      log.info(`[UndoRedo] Undoing move for ${lastAction.before.length} node(s)`);
      applyPositionsToGraph(cy, lastAction.before);
      sendPositionsToExtension(lastAction.before);
      // Restore membership if present
      if (lastAction.membershipBefore && lastAction.membershipBefore.length > 0) {
        applyMembershipChange?.(lastAction.membershipBefore);
        sendMembershipToExtension(lastAction.membershipBefore);
      }
    } else if (lastAction.type === 'graph') {
      log.info(`[UndoRedo] Undoing graph action with ${lastAction.before.length} change(s)`);
      applyGraphChanges?.(lastAction.before);
    } else if (lastAction.type === 'property-edit') {
      log.info(`[UndoRedo] Undoing property edit for ${lastAction.entityType} ${lastAction.entityId}`);
      applyPropertyEdit?.(lastAction, true);
    } else if (lastAction.type === 'annotation') {
      log.info(`[UndoRedo] Undoing ${lastAction.annotationType} annotation change`);
      applyAnnotationChange?.(lastAction, true);
    } else if (lastAction.type === ACTION_TYPE_GROUP_MOVE) {
      log.info(`[UndoRedo] Undoing group move with ${lastAction.nodesBefore.length} node(s)`);
      applyGroupMoveChange?.(lastAction, true);
      // Also restore node positions
      applyPositionsToGraph(cy, lastAction.nodesBefore);
      sendPositionsToExtension(lastAction.nodesBefore);
    }
    dispatch({ type: 'UNDO' });
  }, [canUndo, cy, past, dispatch, applyGraphChanges, applyPropertyEdit, applyAnnotationChange, applyGroupMoveChange, applyMembershipChange]);
}

/** Helper hook for redo operation */
function useRedoAction(
  canRedo: boolean,
  cy: Core | null,
  future: UndoRedoAction[],
  dispatch: React.Dispatch<UndoRedoReducerAction>,
  applyGraphChanges?: (changes: GraphChange[]) => void,
  applyPropertyEdit?: (action: UndoRedoActionPropertyEdit, isUndo: boolean) => void,
  applyAnnotationChange?: (action: UndoRedoActionAnnotation, isUndo: boolean) => void,
  applyGroupMoveChange?: (action: UndoRedoActionGroupMove, isUndo: boolean) => void,
  applyMembershipChange?: (memberships: MembershipEntry[]) => void
) {
  return useCallback(() => {
    if (!canRedo || !cy) return;
    const nextAction = future[0];
    if (nextAction.type === 'move') {
      log.info(`[UndoRedo] Redoing move for ${nextAction.after.length} node(s)`);
      applyPositionsToGraph(cy, nextAction.after);
      sendPositionsToExtension(nextAction.after);
      // Restore membership if present
      if (nextAction.membershipAfter && nextAction.membershipAfter.length > 0) {
        applyMembershipChange?.(nextAction.membershipAfter);
        sendMembershipToExtension(nextAction.membershipAfter);
      }
    } else if (nextAction.type === 'graph') {
      log.info(`[UndoRedo] Redoing graph action with ${nextAction.after.length} change(s)`);
      applyGraphChanges?.(nextAction.after);
    } else if (nextAction.type === 'property-edit') {
      log.info(`[UndoRedo] Redoing property edit for ${nextAction.entityType} ${nextAction.entityId}`);
      applyPropertyEdit?.(nextAction, false);
    } else if (nextAction.type === 'annotation') {
      log.info(`[UndoRedo] Redoing ${nextAction.annotationType} annotation change`);
      applyAnnotationChange?.(nextAction, false);
    } else if (nextAction.type === ACTION_TYPE_GROUP_MOVE) {
      log.info(`[UndoRedo] Redoing group move with ${nextAction.nodesAfter.length} node(s)`);
      applyGroupMoveChange?.(nextAction, false);
      // Also restore node positions
      applyPositionsToGraph(cy, nextAction.nodesAfter);
      sendPositionsToExtension(nextAction.nodesAfter);
    }
    dispatch({ type: 'REDO' });
  }, [canRedo, cy, future, dispatch, applyGraphChanges, applyPropertyEdit, applyAnnotationChange, applyGroupMoveChange, applyMembershipChange]);
}

/**
 * Hook for managing undo/redo functionality for node positions
 */
export function useUndoRedo({ cy, enabled = true, applyGraphChanges, applyPropertyEdit, applyAnnotationChange, applyGroupMoveChange, applyMembershipChange }: UseUndoRedoOptions): UseUndoRedoReturn {
  const [state, dispatch] = useReducer(undoRedoReducer, initialState);

  const canUndo = enabled && state.past.length > 0;
  const canRedo = enabled && state.future.length > 0;

  const capturePositions = useCapturePositions(cy);
  const pushAction = usePushAction(enabled, dispatch);
  const undo = useUndoAction(canUndo, cy, state.past, dispatch, applyGraphChanges, applyPropertyEdit, applyAnnotationChange, applyGroupMoveChange, applyMembershipChange);
  const redo = useRedoAction(canRedo, cy, state.future, dispatch, applyGraphChanges, applyPropertyEdit, applyAnnotationChange, applyGroupMoveChange, applyMembershipChange);

  const recordMove = useCallback((nodeIds: string[], beforePositions: NodePositionEntry[], membershipBefore?: MembershipEntry[], membershipAfter?: MembershipEntry[]) => {
    if (!enabled || !cy) return;
    const afterPositions = capturePositions(nodeIds);
    const hasChanged = beforePositions.some(before => {
      const after = afterPositions.find(a => a.id === before.id);
      return after && (before.position.x !== after.position.x || before.position.y !== after.position.y);
    });
    if (hasChanged) {
      pushAction({ type: 'move', before: beforePositions, after: afterPositions, membershipBefore, membershipAfter });
    }
  }, [enabled, cy, capturePositions, pushAction]);

  const clearHistory = useCallback(() => {
    dispatch({ type: 'CLEAR' });
    log.info('[UndoRedo] History cleared');
  }, []);

  return useMemo(() => ({
    canUndo,
    canRedo,
    undoCount: state.past.length,
    redoCount: state.future.length,
    undo,
    redo,
    pushAction,
    recordMove,
    clearHistory,
    capturePositions
  }), [canUndo, canRedo, state.past.length, state.future.length, undo, redo, pushAction, recordMove, clearHistory, capturePositions]);
}
