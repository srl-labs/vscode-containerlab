/**
 * Undo/Redo Hook for Node Position History
 * Manages undo/redo stack for node drag operations
 *
 * [MIGRATION] Migrate to @xyflow/react - replace position capture/apply
 */
import React, { useReducer, useCallback, useMemo } from 'react';
import { CyElement } from '../../../shared/types/messages';
import { log } from '../../utils/logger';

// [MIGRATION] Replace with ReactFlow types from @xyflow/react
// import { ReactFlowInstance, Node } from '@xyflow/react';
type ReactFlowNode = { id: string; position: { x: number; y: number }; data: Record<string, unknown> };

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
}

export interface UndoRedoActionGraph {
  type: 'graph';
  /** Graph changes to apply on undo */
  before: GraphChange[];
  /** Graph changes to apply on redo */
  after: GraphChange[];
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
}

export type UndoRedoAction = UndoRedoActionMove | UndoRedoActionGraph | UndoRedoActionPropertyEdit | UndoRedoActionAnnotation;

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
 * Apply positions to graph nodes
 * [MIGRATION] Update to use ReactFlow's setNodes
 */
function applyPositionsToGraph(
  setNodes: ((updater: (nodes: ReactFlowNode[]) => ReactFlowNode[]) => void) | null,
  positions: NodePositionEntry[]
): void {
  if (!setNodes) return;
  setNodes(nodes =>
    nodes.map(node => {
      const posEntry = positions.find(p => p.id === node.id);
      if (posEntry) {
        return { ...node, position: posEntry.position };
      }
      return node;
    })
  );
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
 * Options for the useUndoRedo hook
 */
export interface UseUndoRedoOptions {
  /** [MIGRATION] Replace with ReactFlow's nodes and setNodes from useReactFlow() */
  nodes: ReactFlowNode[];
  /** Setter for updating nodes - from useReactFlow().setNodes */
  setNodes: ((updater: (nodes: ReactFlowNode[]) => ReactFlowNode[]) => void) | null;
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
  /** Record a node move (captures before/after positions) */
  recordMove: (nodeIds: string[], beforePositions: NodePositionEntry[]) => void;
  /** Clear all history */
  clearHistory: () => void;
  /** Capture current positions for specified nodes (use before drag starts) */
  capturePositions: (nodeIds: string[]) => NodePositionEntry[];
}

/** Helper hook for capturing node positions */
function useCapturePositions(nodes: ReactFlowNode[]) {
  return useCallback((nodeIds: string[]): NodePositionEntry[] => {
    return nodeIds
      .map(id => {
        const node = nodes.find(n => n.id === id);
        if (node) {
          // ReactFlow nodes have position as a property, not a function
          const pos = node.position;
          return { id, position: { x: Math.round(pos.x), y: Math.round(pos.y) } };
        }
        return { id, position: { x: 0, y: 0 } };
      })
      .filter(entry => entry.position.x !== 0 || entry.position.y !== 0);
  }, [nodes]);
}

/** Helper hook for push action */
function usePushAction(enabled: boolean, dispatch: React.Dispatch<UndoRedoReducerAction>) {
  return useCallback((action: UndoRedoAction) => {
    if (!enabled) return;
    dispatch({ type: 'PUSH', action });
    const count = action.type === 'move' ? action.after.length : action.after?.length ?? 0;
    log.info(`[UndoRedo] Pushed action: ${action.type} for ${count} item(s)`);
  }, [enabled, dispatch]);
}

/** Helper hook for undo operation */
function useUndoAction(
  canUndo: boolean,
  setNodes: ((updater: (nodes: ReactFlowNode[]) => ReactFlowNode[]) => void) | null,
  past: UndoRedoAction[],
  dispatch: React.Dispatch<UndoRedoReducerAction>,
  applyGraphChanges?: (changes: GraphChange[]) => void,
  applyPropertyEdit?: (action: UndoRedoActionPropertyEdit, isUndo: boolean) => void,
  applyAnnotationChange?: (action: UndoRedoActionAnnotation, isUndo: boolean) => void
) {
  return useCallback(() => {
    if (!canUndo) return;
    const lastAction = past[past.length - 1];
    if (lastAction.type === 'move') {
      log.info(`[UndoRedo] Undoing move for ${lastAction.before.length} node(s)`);
      applyPositionsToGraph(setNodes, lastAction.before);
      sendPositionsToExtension(lastAction.before);
    } else if (lastAction.type === 'graph') {
      log.info(`[UndoRedo] Undoing graph action with ${lastAction.before.length} change(s)`);
      applyGraphChanges?.(lastAction.before);
    } else if (lastAction.type === 'property-edit') {
      log.info(`[UndoRedo] Undoing property edit for ${lastAction.entityType} ${lastAction.entityId}`);
      applyPropertyEdit?.(lastAction, true);
    } else if (lastAction.type === 'annotation') {
      log.info(`[UndoRedo] Undoing ${lastAction.annotationType} annotation change`);
      applyAnnotationChange?.(lastAction, true);
    }
    dispatch({ type: 'UNDO' });
  }, [canUndo, setNodes, past, dispatch, applyGraphChanges, applyPropertyEdit, applyAnnotationChange]);
}

/** Helper hook for redo operation */
function useRedoAction(
  canRedo: boolean,
  setNodes: ((updater: (nodes: ReactFlowNode[]) => ReactFlowNode[]) => void) | null,
  future: UndoRedoAction[],
  dispatch: React.Dispatch<UndoRedoReducerAction>,
  applyGraphChanges?: (changes: GraphChange[]) => void,
  applyPropertyEdit?: (action: UndoRedoActionPropertyEdit, isUndo: boolean) => void,
  applyAnnotationChange?: (action: UndoRedoActionAnnotation, isUndo: boolean) => void
) {
  return useCallback(() => {
    if (!canRedo) return;
    const nextAction = future[0];
    if (nextAction.type === 'move') {
      log.info(`[UndoRedo] Redoing move for ${nextAction.after.length} node(s)`);
      applyPositionsToGraph(setNodes, nextAction.after);
      sendPositionsToExtension(nextAction.after);
    } else if (nextAction.type === 'graph') {
      log.info(`[UndoRedo] Redoing graph action with ${nextAction.after.length} change(s)`);
      applyGraphChanges?.(nextAction.after);
    } else if (nextAction.type === 'property-edit') {
      log.info(`[UndoRedo] Redoing property edit for ${nextAction.entityType} ${nextAction.entityId}`);
      applyPropertyEdit?.(nextAction, false);
    } else if (nextAction.type === 'annotation') {
      log.info(`[UndoRedo] Redoing ${nextAction.annotationType} annotation change`);
      applyAnnotationChange?.(nextAction, false);
    }
    dispatch({ type: 'REDO' });
  }, [canRedo, setNodes, future, dispatch, applyGraphChanges, applyPropertyEdit, applyAnnotationChange]);
}

/**
 * Hook for managing undo/redo functionality for node positions
 */
export function useUndoRedo({ nodes, setNodes, enabled = true, applyGraphChanges, applyPropertyEdit, applyAnnotationChange }: UseUndoRedoOptions): UseUndoRedoReturn {
  const [state, dispatch] = useReducer(undoRedoReducer, initialState);

  const canUndo = enabled && state.past.length > 0;
  const canRedo = enabled && state.future.length > 0;

  const capturePositions = useCapturePositions(nodes);
  const pushAction = usePushAction(enabled, dispatch);
  const undo = useUndoAction(canUndo, setNodes, state.past, dispatch, applyGraphChanges, applyPropertyEdit, applyAnnotationChange);
  const redo = useRedoAction(canRedo, setNodes, state.future, dispatch, applyGraphChanges, applyPropertyEdit, applyAnnotationChange);

  const recordMove = useCallback((nodeIds: string[], beforePositions: NodePositionEntry[]) => {
    if (!enabled || !setNodes) return;
    const afterPositions = capturePositions(nodeIds);
    const hasChanged = beforePositions.some(before => {
      const after = afterPositions.find(a => a.id === before.id);
      return after && (before.position.x !== after.position.x || before.position.y !== after.position.y);
    });
    if (hasChanged) {
      pushAction({ type: 'move', before: beforePositions, after: afterPositions });
    }
  }, [enabled, setNodes, capturePositions, pushAction]);

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
