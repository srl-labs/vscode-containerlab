/**
 * Undo/Redo Hook for Node Position History
 * Manages undo/redo stack for node drag operations
 */
import React, { useReducer, useCallback, useMemo } from 'react';
import type { Core } from 'cytoscape';

import type { CyElement } from '../../../shared/types/messages';
import { log } from '../../utils/logger';
import { saveNodePositions, getAnnotationsIO, getTopologyIO, isServicesInitialized } from '../../services';
import { applyMembershipUpdates } from '../shared/membershipHelpers';

/**
 * Represents a node position entry.
 * In GeoMap mode, only geoCoordinates should be updated (position stays unchanged).
 * In preset mode, only position should be updated.
 */
export interface NodePositionEntry {
  id: string;
  /** Position for preset mode. Optional when only updating geo coordinates. */
  position?: { x: number; y: number };
  /** Geo coordinates for GeoMap mode */
  geoCoordinates?: { lat: number; lng: number };
}

/** NodePositionEntry with a guaranteed position (not geo-only) */
export type NodePositionEntryWithPosition = NodePositionEntry & { position: { x: number; y: number } };

/** Filter NodePositionEntry[] to only entries with defined position (excludes geo-only entries) */
export function filterEntriesWithPosition(positions: NodePositionEntry[]): NodePositionEntryWithPosition[] {
  return positions.filter((p): p is NodePositionEntryWithPosition => p.position !== undefined);
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

/** Type of annotation (freeText, freeShape, or group) */
export type AnnotationType = 'freeText' | 'freeShape' | 'group';

export interface RelatedAnnotationChange {
  annotationType: AnnotationType;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

/**
 * Represents an annotation action (for free text/shapes/groups)
 */
export interface UndoRedoActionAnnotation {
  type: 'annotation';
  /** Annotation type being modified */
  annotationType: AnnotationType;
  /** Annotation state before the change (null = didn't exist) */
  before: Record<string, unknown> | null;
  /** Annotation state after the change (null = deleted) */
  after: Record<string, unknown> | null;
  /** Optional node membership changes associated with the annotation */
  membershipBefore?: MembershipEntry[];
  membershipAfter?: MembershipEntry[];
  /** Optional related annotation changes (e.g., group membership promotions) */
  relatedAnnotations?: RelatedAnnotationChange[];
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

/** Entry for annotation changes in compound actions */
export interface CompoundAnnotationEntry {
  annotationType: string;
  state: Record<string, unknown> | null;
}

/**
 * Represents a compound action that batches multiple operations together.
 * Used for paste operations that create multiple nodes, edges, and groups.
 */
export interface UndoRedoActionCompound {
  type: 'compound';
  /** Graph changes (nodes and edges) */
  graphBefore: GraphChange[];
  graphAfter: GraphChange[];
  /** Annotation changes (groups, text, shapes) */
  annotationsBefore: CompoundAnnotationEntry[];
  annotationsAfter: CompoundAnnotationEntry[];
  [key: string]: unknown;
}

export type UndoRedoAction = UndoRedoActionMove | UndoRedoActionGraph | UndoRedoActionPropertyEdit | UndoRedoActionAnnotation | UndoRedoActionGroupMove | UndoRedoActionCompound;

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
  | { type: 'CLEAR' }
  | { type: 'PUSH_BATCH'; actions: UndoRedoAction[] };

const MAX_HISTORY_SIZE = 50;
const ACTION_TYPE_GROUP_MOVE = 'group-move';

const initialState: UndoRedoState = {
  past: [],
  future: []
};

/**
 * Combine multiple actions into a single composite action.
 * Handles both graph actions (nodes/edges) and annotation actions (groups).
 */
function combineActions(actions: UndoRedoAction[]): UndoRedoAction {
  const graphBefore: GraphChange[] = [];
  const graphAfter: GraphChange[] = [];
  const annotationsBefore: CompoundAnnotationEntry[] = [];
  const annotationsAfter: CompoundAnnotationEntry[] = [];

  for (const action of actions) {
    if (action.type === 'graph') {
      graphBefore.push(...action.before);
      graphAfter.push(...action.after);
    } else if (action.type === 'annotation') {
      annotationsBefore.push({
        annotationType: action.annotationType,
        state: action.before as Record<string, unknown> | null
      });
      annotationsAfter.push({
        annotationType: action.annotationType,
        state: action.after as Record<string, unknown> | null
      });
    }
  }

  // If we only have graph actions, return a simple graph action
  const hasAnnotations = annotationsBefore.length > 0 || annotationsAfter.length > 0;
  if (!hasAnnotations && graphBefore.length > 0) {
    return { type: 'graph', before: graphBefore, after: graphAfter };
  }

  // If we only have annotation actions, return a simple annotation action (for single annotation)
  if (graphBefore.length === 0 && annotationsBefore.length === 1) {
    return {
      type: 'annotation',
      annotationType: annotationsBefore[0].annotationType as AnnotationType,
      before: annotationsBefore[0].state,
      after: annotationsAfter[0].state
    };
  }

  // Mixed or multiple annotation actions - return compound action
  return { type: 'compound', graphBefore, graphAfter, annotationsBefore, annotationsAfter };
}

/** Helper to apply annotation changes in a compound action */
function applyCompoundAnnotations(
  action: UndoRedoActionCompound,
  applyAnnotationChange: ((action: UndoRedoActionAnnotation, isUndo: boolean) => void) | undefined,
  isUndo: boolean
): void {
  for (let i = 0; i < action.annotationsAfter.length; i++) {
    const afterAnn = action.annotationsAfter[i];
    const beforeAnn = action.annotationsBefore[i];
    const syntheticAction: UndoRedoActionAnnotation = {
      type: 'annotation',
      annotationType: afterAnn.annotationType as AnnotationType,
      before: beforeAnn?.state ?? null,
      after: afterAnn.state
    };
    applyAnnotationChange?.(syntheticAction, isUndo);
  }
}

/** Helper to apply compound action undo */
function applyCompoundUndo(
  action: UndoRedoActionCompound,
  applyGraphChanges: ((changes: GraphChange[]) => void) | undefined,
  applyAnnotationChange: ((action: UndoRedoActionAnnotation, isUndo: boolean) => void) | undefined
): void {
  const graphCount = action.graphBefore.length;
  const annotationCount = action.annotationsAfter.length;
  log.info(`[UndoRedo] Undoing compound action with ${graphCount} graph change(s) and ${annotationCount} annotation(s)`);

  // For paste operations: groups are created FIRST, then nodes with group membership.
  // For undo: delete nodes FIRST, then delete groups.
  if (graphCount > 0) {
    applyGraphChanges?.(action.graphBefore);
  }
  applyCompoundAnnotations(action, applyAnnotationChange, true);
}

/** Helper to apply compound action redo */
function applyCompoundRedo(
  action: UndoRedoActionCompound,
  applyGraphChanges: ((changes: GraphChange[]) => void) | undefined,
  applyAnnotationChange: ((action: UndoRedoActionAnnotation, isUndo: boolean) => void) | undefined
): void {
  const graphCount = action.graphAfter.length;
  const annotationCount = action.annotationsAfter.length;
  log.info(`[UndoRedo] Redoing compound action with ${graphCount} graph change(s) and ${annotationCount} annotation(s)`);

  // For paste operations: groups should be created FIRST, then nodes with group membership.
  applyCompoundAnnotations(action, applyAnnotationChange, false);
  if (graphCount > 0) {
    applyGraphChanges?.(action.graphAfter);
  }
}

/** Helper to undo a move action */
function applyMoveUndo(
  action: UndoRedoActionMove,
  cy: Core,
  applyMembershipChange: ((memberships: MembershipEntry[]) => void) | undefined
): void {
  log.info(`[UndoRedo] Undoing move for ${action.before.length} node(s)`);
  applyPositionsToGraph(cy, action.before);
  sendPositionsToExtension(action.before);
  if (action.membershipBefore && action.membershipBefore.length > 0) {
    applyMembershipChange?.(action.membershipBefore);
    sendMembershipToExtension(action.membershipBefore);
  }
}

/** Helper to redo a move action */
function applyMoveRedo(
  action: UndoRedoActionMove,
  cy: Core,
  applyMembershipChange: ((memberships: MembershipEntry[]) => void) | undefined
): void {
  log.info(`[UndoRedo] Redoing move for ${action.after.length} node(s)`);
  applyPositionsToGraph(cy, action.after);
  sendPositionsToExtension(action.after);
  if (action.membershipAfter && action.membershipAfter.length > 0) {
    applyMembershipChange?.(action.membershipAfter);
    sendMembershipToExtension(action.membershipAfter);
  }
}

/** Helper to undo a group-move action */
function applyGroupMoveUndo(
  action: UndoRedoActionGroupMove,
  cy: Core,
  applyGroupMoveChange: ((action: UndoRedoActionGroupMove, isUndo: boolean) => void) | undefined
): void {
  log.info(`[UndoRedo] Undoing group move with ${action.nodesBefore.length} node(s)`);
  applyGroupMoveChange?.(action, true);
  applyPositionsToGraph(cy, action.nodesBefore);
  sendPositionsToExtension(action.nodesBefore);
}

/** Helper to redo a group-move action */
function applyGroupMoveRedo(
  action: UndoRedoActionGroupMove,
  cy: Core,
  applyGroupMoveChange: ((action: UndoRedoActionGroupMove, isUndo: boolean) => void) | undefined
): void {
  log.info(`[UndoRedo] Redoing group move with ${action.nodesAfter.length} node(s)`);
  applyGroupMoveChange?.(action, false);
  applyPositionsToGraph(cy, action.nodesAfter);
  sendPositionsToExtension(action.nodesAfter);
}

function applyGraphAction(
  action: UndoRedoActionGraph,
  isUndo: boolean,
  applyGraphChanges: ((changes: GraphChange[]) => void) | undefined
): void {
  const changes = isUndo ? action.before : action.after;
  const operation = isUndo ? 'Undoing' : 'Redoing';
  log.info(`[UndoRedo] ${operation} graph action with ${changes.length} change(s)`);
  applyGraphChanges?.(changes);
}

function applyPropertyEditAction(
  action: UndoRedoActionPropertyEdit,
  isUndo: boolean,
  applyPropertyEdit: ((action: UndoRedoActionPropertyEdit, isUndo: boolean) => void) | undefined
): void {
  const operation = isUndo ? 'Undoing' : 'Redoing';
  log.info(`[UndoRedo] ${operation} property edit for ${action.entityType} ${action.entityId}`);
  applyPropertyEdit?.(action, isUndo);
}

function applyAnnotationAction(
  action: UndoRedoActionAnnotation,
  isUndo: boolean,
  applyAnnotationChange: ((action: UndoRedoActionAnnotation, isUndo: boolean) => void) | undefined,
  applyMembershipChange: ((memberships: MembershipEntry[]) => void) | undefined
): void {
  const operation = isUndo ? 'Undoing' : 'Redoing';
  log.info(`[UndoRedo] ${operation} ${action.annotationType} annotation change`);

  applyAnnotationChange?.(action, isUndo);

  if (action.relatedAnnotations && action.relatedAnnotations.length > 0 && applyAnnotationChange) {
    action.relatedAnnotations.forEach(change => {
      applyAnnotationChange(
        {
          type: 'annotation',
          annotationType: change.annotationType,
          before: change.before,
          after: change.after
        },
        isUndo
      );
    });
  }

  const membership = isUndo ? action.membershipBefore : action.membershipAfter;
  if (membership && membership.length > 0) {
    applyMembershipChange?.(membership);
    sendMembershipToExtension(membership);
  }
}

function applyMoveAction(
  action: UndoRedoActionMove,
  isUndo: boolean,
  cy: Core,
  applyMembershipChange: ((memberships: MembershipEntry[]) => void) | undefined
): void {
  if (isUndo) {
    applyMoveUndo(action, cy, applyMembershipChange);
    return;
  }
  applyMoveRedo(action, cy, applyMembershipChange);
}

function applyGroupMoveAction(
  action: UndoRedoActionGroupMove,
  isUndo: boolean,
  cy: Core,
  applyGroupMoveChange: ((action: UndoRedoActionGroupMove, isUndo: boolean) => void) | undefined
): void {
  if (isUndo) {
    applyGroupMoveUndo(action, cy, applyGroupMoveChange);
    return;
  }
  applyGroupMoveRedo(action, cy, applyGroupMoveChange);
}

function applyCompoundAction(
  action: UndoRedoActionCompound,
  isUndo: boolean,
  applyGraphChanges: ((changes: GraphChange[]) => void) | undefined,
  applyAnnotationChange: ((action: UndoRedoActionAnnotation, isUndo: boolean) => void) | undefined
): void {
  if (isUndo) {
    applyCompoundUndo(action, applyGraphChanges, applyAnnotationChange);
    return;
  }
  applyCompoundRedo(action, applyGraphChanges, applyAnnotationChange);
}

/**
 * Helper to add action to past with size limit
 */
function addToPastWithLimit(past: UndoRedoAction[], action: UndoRedoAction): UndoRedoAction[] {
  const newPast = [...past, action];
  if (newPast.length > MAX_HISTORY_SIZE) {
    newPast.shift();
  }
  return newPast;
}

/**
 * Handle PUSH_BATCH reducer action
 */
function handlePushBatch(state: UndoRedoState, actions: UndoRedoAction[]): UndoRedoState {
  if (actions.length === 0) return state;
  if (actions.length === 1) {
    return { past: addToPastWithLimit(state.past, actions[0]), future: [] };
  }
  const combinedAction = combineActions(actions);
  return { past: addToPastWithLimit(state.past, combinedAction), future: [] };
}

/**
 * Reducer for undo/redo state management
 */
function undoRedoReducer(state: UndoRedoState, reducerAction: UndoRedoReducerAction): UndoRedoState {
  switch (reducerAction.type) {
    case 'PUSH':
      return { past: addToPastWithLimit(state.past, reducerAction.action), future: [] };
    case 'PUSH_BATCH':
      return handlePushBatch(state, reducerAction.actions);
    case 'UNDO': {
      if (state.past.length === 0) return state;
      const lastAction = state.past[state.past.length - 1];
      return { past: state.past.slice(0, -1), future: [lastAction, ...state.future] };
    }
    case 'REDO': {
      if (state.future.length === 0) return state;
      const nextAction = state.future[0];
      return { past: [...state.past, nextAction], future: state.future.slice(1) };
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
      if (node.length > 0 && node.isNode() && entry.position) {
        node.position(entry.position);
      }
    }
  });
}

/**
 * Save positions via TopologyIO service
 */
function sendPositionsToExtension(positions: NodePositionEntry[]): void {
  void saveNodePositions(positions);
  log.info(`[UndoRedo] Saved ${positions.length} node positions`);
}

/**
 * Save membership changes via AnnotationsIO service
 */
function sendMembershipToExtension(memberships: MembershipEntry[]): void {
  if (!isServicesInitialized()) {
    log.warn('[UndoRedo] Services not initialized for membership save');
    return;
  }

  const annotationsIO = getAnnotationsIO();
  const topologyIO = getTopologyIO();

  const yamlPath = topologyIO.getYamlFilePath();
  if (!yamlPath) {
    log.warn('[UndoRedo] No YAML path for membership save');
    return;
  }

  // Batch all membership updates in a single annotations modification
  annotationsIO.modifyAnnotations(yamlPath, annotations => {
    applyMembershipUpdates(annotations, memberships);
    return annotations;
  }).catch(err => {
    log.error(`[UndoRedo] Failed to save membership: ${err}`);
  });

  log.info(`[UndoRedo] Saved ${memberships.length} membership changes`);
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
  /** Begin a batch operation - actions will be collected and combined into a single undo entry */
  beginBatch: () => void;
  /** End a batch operation - commits all collected actions as a single undo entry */
  endBatch: () => void;
  /** Whether currently in batch mode */
  isInBatch: () => boolean;
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

/** Helper hook for push action with batch support */
function usePushAction(
  enabled: boolean,
  dispatch: React.Dispatch<UndoRedoReducerAction>,
  batchActionsRef: React.RefObject<UndoRedoAction[]>,
  isBatchingRef: React.RefObject<boolean>
) {
  return useCallback((action: UndoRedoAction) => {
    if (!enabled) return;

    // If in batch mode, collect actions instead of pushing immediately
    if (isBatchingRef.current) {
      batchActionsRef.current.push(action);
      log.info(`[UndoRedo] Collected action in batch: ${action.type}`);
      return;
    }

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
  }, [enabled, dispatch, batchActionsRef, isBatchingRef]);
}

/** Helper to apply an action (shared by undo and redo) */
function applyAction(
  action: UndoRedoAction,
  cy: Core,
  isUndo: boolean,
  applyGraphChanges?: (changes: GraphChange[]) => void,
  applyPropertyEdit?: (action: UndoRedoActionPropertyEdit, isUndo: boolean) => void,
  applyAnnotationChange?: (action: UndoRedoActionAnnotation, isUndo: boolean) => void,
  applyGroupMoveChange?: (action: UndoRedoActionGroupMove, isUndo: boolean) => void,
  applyMembershipChange?: (memberships: MembershipEntry[]) => void
): void {
  switch (action.type) {
    case 'move':
      applyMoveAction(action, isUndo, cy, applyMembershipChange);
      break;
    case 'graph':
      applyGraphAction(action, isUndo, applyGraphChanges);
      break;
    case 'property-edit':
      applyPropertyEditAction(action, isUndo, applyPropertyEdit);
      break;
    case 'annotation':
      applyAnnotationAction(action, isUndo, applyAnnotationChange, applyMembershipChange);
      break;
    case ACTION_TYPE_GROUP_MOVE:
      applyGroupMoveAction(action, isUndo, cy, applyGroupMoveChange);
      break;
    case 'compound':
      applyCompoundAction(action, isUndo, applyGraphChanges, applyAnnotationChange);
      break;
  }
}

/** Options for undo/redo action application */
interface UndoRedoActionOptions {
  applyGraphChanges?: (changes: GraphChange[]) => void;
  applyPropertyEdit?: (action: UndoRedoActionPropertyEdit, isUndo: boolean) => void;
  applyAnnotationChange?: (action: UndoRedoActionAnnotation, isUndo: boolean) => void;
  applyGroupMoveChange?: (action: UndoRedoActionGroupMove, isUndo: boolean) => void;
  applyMembershipChange?: (memberships: MembershipEntry[]) => void;
}

/** Helper hook for undo/redo operations */
function useUndoRedoAction(
  canExecute: boolean,
  cy: Core | null,
  stack: UndoRedoAction[],
  getAction: (stack: UndoRedoAction[]) => UndoRedoAction,
  isUndo: boolean,
  dispatchType: 'UNDO' | 'REDO',
  dispatch: React.Dispatch<UndoRedoReducerAction>,
  options: UndoRedoActionOptions
) {
  const { applyGraphChanges, applyPropertyEdit, applyAnnotationChange, applyGroupMoveChange, applyMembershipChange } = options;
  return useCallback(() => {
    if (!canExecute || !cy) return;
    const action = getAction(stack);
    applyAction(action, cy, isUndo, applyGraphChanges, applyPropertyEdit, applyAnnotationChange, applyGroupMoveChange, applyMembershipChange);
    dispatch({ type: dispatchType });
  }, [canExecute, cy, stack, getAction, isUndo, dispatchType, dispatch, applyGraphChanges, applyPropertyEdit, applyAnnotationChange, applyGroupMoveChange, applyMembershipChange]);
}

/** Helper hook for undo operation */
function useUndoAction(
  canUndo: boolean,
  cy: Core | null,
  past: UndoRedoAction[],
  dispatch: React.Dispatch<UndoRedoReducerAction>,
  options: UndoRedoActionOptions
) {
  return useUndoRedoAction(
    canUndo,
    cy,
    past,
    (stack) => stack[stack.length - 1],
    true,
    'UNDO',
    dispatch,
    options
  );
}

/** Helper hook for redo operation */
function useRedoAction(
  canRedo: boolean,
  cy: Core | null,
  future: UndoRedoAction[],
  dispatch: React.Dispatch<UndoRedoReducerAction>,
  options: UndoRedoActionOptions
) {
  return useUndoRedoAction(
    canRedo,
    cy,
    future,
    (stack) => stack[0],
    false,
    'REDO',
    dispatch,
    options
  );
}

/**
 * Hook for managing undo/redo functionality for node positions
 */
export function useUndoRedo({ cy, enabled = true, applyGraphChanges, applyPropertyEdit, applyAnnotationChange, applyGroupMoveChange, applyMembershipChange }: UseUndoRedoOptions): UseUndoRedoReturn {
  const [state, dispatch] = useReducer(undoRedoReducer, initialState);

  // Batch mode refs - using refs to avoid re-renders during batch collection
  const isBatchingRef = React.useRef(false);
  const batchActionsRef = React.useRef<UndoRedoAction[]>([]);

  const canUndo = enabled && state.past.length > 0;
  const canRedo = enabled && state.future.length > 0;

  const capturePositions = useCapturePositions(cy);
  const pushAction = usePushAction(enabled, dispatch, batchActionsRef, isBatchingRef);

  const actionOptions: UndoRedoActionOptions = {
    applyGraphChanges,
    applyPropertyEdit,
    applyAnnotationChange,
    applyGroupMoveChange,
    applyMembershipChange
  };

  const undo = useUndoAction(canUndo, cy, state.past, dispatch, actionOptions);
  const redo = useRedoAction(canRedo, cy, state.future, dispatch, actionOptions);

  const recordMove = useCallback((nodeIds: string[], beforePositions: NodePositionEntry[], membershipBefore?: MembershipEntry[], membershipAfter?: MembershipEntry[]) => {
    if (!enabled || !cy) return;
    const afterPositions = capturePositions(nodeIds);
    const hasChanged = beforePositions.some(before => {
      const after = afterPositions.find(a => a.id === before.id);
      return after && before.position && after.position && (before.position.x !== after.position.x || before.position.y !== after.position.y);
    });
    if (hasChanged) {
      pushAction({ type: 'move', before: beforePositions, after: afterPositions, membershipBefore, membershipAfter });
    }
  }, [enabled, cy, capturePositions, pushAction]);

  const clearHistory = useCallback(() => {
    dispatch({ type: 'CLEAR' });
    log.info('[UndoRedo] History cleared');
  }, []);

  // Begin batch mode - actions will be collected until endBatch is called
  const beginBatch = useCallback(() => {
    if (isBatchingRef.current) {
      log.warn('[UndoRedo] Already in batch mode');
      return;
    }
    isBatchingRef.current = true;
    batchActionsRef.current = [];
    log.info('[UndoRedo] Started batch mode');
  }, []);

  // End batch mode - commit all collected actions as a single undo entry
  const endBatch = useCallback(() => {
    if (!isBatchingRef.current) {
      log.warn('[UndoRedo] Not in batch mode');
      return;
    }
    isBatchingRef.current = false;
    const actions = batchActionsRef.current;
    batchActionsRef.current = [];

    if (actions.length > 0) {
      dispatch({ type: 'PUSH_BATCH', actions });
      log.info(`[UndoRedo] Committed batch with ${actions.length} action(s)`);
    } else {
      log.info('[UndoRedo] Batch ended with no actions');
    }
  }, []);

  // Check if currently in batch mode
  const isInBatch = useCallback(() => isBatchingRef.current, []);

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
    capturePositions,
    beginBatch,
    endBatch,
    isInBatch
  }), [canUndo, canRedo, state.past.length, state.future.length, undo, redo, pushAction, recordMove, clearHistory, capturePositions, beginBatch, endBatch, isInBatch]);
}
