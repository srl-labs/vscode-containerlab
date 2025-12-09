/**
 * Undo/Redo Hook for Node Position History
 * Manages undo/redo stack for node drag operations
 */
import React, { useReducer, useCallback, useMemo } from 'react';
import { Core } from 'cytoscape';
import { log } from '../utils/logger';

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
export interface UndoRedoAction {
  type: 'move';
  /** Positions before the action (for undo) */
  before: NodePositionEntry[];
  /** Positions after the action (for redo) */
  after: NodePositionEntry[];
}

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
 * Options for the useUndoRedo hook
 */
export interface UseUndoRedoOptions {
  /** Cytoscape instance */
  cy: Core | null;
  /** Whether undo/redo is enabled (typically only in edit mode) */
  enabled?: boolean;
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
    log.info(`[UndoRedo] Pushed action: ${action.type} for ${action.after.length} node(s)`);
  }, [enabled, dispatch]);
}

/** Helper hook for undo operation */
function useUndoAction(
  canUndo: boolean,
  cy: Core | null,
  past: UndoRedoAction[],
  dispatch: React.Dispatch<UndoRedoReducerAction>
) {
  return useCallback(() => {
    if (!canUndo || !cy) return;
    const lastAction = past[past.length - 1];
    log.info(`[UndoRedo] Undoing ${lastAction.type} for ${lastAction.before.length} node(s)`);
    applyPositionsToGraph(cy, lastAction.before);
    sendPositionsToExtension(lastAction.before);
    dispatch({ type: 'UNDO' });
  }, [canUndo, cy, past, dispatch]);
}

/** Helper hook for redo operation */
function useRedoAction(
  canRedo: boolean,
  cy: Core | null,
  future: UndoRedoAction[],
  dispatch: React.Dispatch<UndoRedoReducerAction>
) {
  return useCallback(() => {
    if (!canRedo || !cy) return;
    const nextAction = future[0];
    log.info(`[UndoRedo] Redoing ${nextAction.type} for ${nextAction.after.length} node(s)`);
    applyPositionsToGraph(cy, nextAction.after);
    sendPositionsToExtension(nextAction.after);
    dispatch({ type: 'REDO' });
  }, [canRedo, cy, future, dispatch]);
}

/**
 * Hook for managing undo/redo functionality for node positions
 */
export function useUndoRedo({ cy, enabled = true }: UseUndoRedoOptions): UseUndoRedoReturn {
  const [state, dispatch] = useReducer(undoRedoReducer, initialState);

  const canUndo = enabled && state.past.length > 0;
  const canRedo = enabled && state.future.length > 0;

  const capturePositions = useCapturePositions(cy);
  const pushAction = usePushAction(enabled, dispatch);
  const undo = useUndoAction(canUndo, cy, state.past, dispatch);
  const redo = useRedoAction(canRedo, cy, state.future, dispatch);

  const recordMove = useCallback((nodeIds: string[], beforePositions: NodePositionEntry[]) => {
    if (!enabled || !cy) return;
    const afterPositions = capturePositions(nodeIds);
    const hasChanged = beforePositions.some(before => {
      const after = afterPositions.find(a => a.id === before.id);
      return after && (before.position.x !== after.position.x || before.position.y !== after.position.y);
    });
    if (hasChanged) {
      pushAction({ type: 'move', before: beforePositions, after: afterPositions });
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
