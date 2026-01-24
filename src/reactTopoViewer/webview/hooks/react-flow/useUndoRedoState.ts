/**
 * Core Undo/Redo State Hook
 * Manages the undo/redo stack with a reducer pattern
 */
import type React from 'react';
import { useCallback, useMemo, useRef, useReducer } from 'react';

import type { UndoRedoAction, NodePositionEntry } from '../state/useUndoRedo';
import { log } from '../../utils/logger';

const MAX_HISTORY_SIZE = 50;

/** Undo/Redo stack state */
interface UndoRedoState {
  past: UndoRedoAction[];
  future: UndoRedoAction[];
}

type UndoRedoReducerAction =
  | { type: 'PUSH'; action: UndoRedoAction }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'CLEAR' };

function undoRedoReducer(state: UndoRedoState, reducerAction: UndoRedoReducerAction): UndoRedoState {
  switch (reducerAction.type) {
    case 'PUSH': {
      const newPast = [...state.past, reducerAction.action];
      if (newPast.length > MAX_HISTORY_SIZE) newPast.shift();
      return { past: newPast, future: [] };
    }
    case 'UNDO': {
      if (state.past.length === 0) return state;
      return { past: state.past.slice(0, -1), future: [state.past[state.past.length - 1], ...state.future] };
    }
    case 'REDO': {
      if (state.future.length === 0) return state;
      return { past: [...state.past, state.future[0]], future: state.future.slice(1) };
    }
    case 'CLEAR':
      return { past: [], future: [] };
    default:
      return state;
  }
}

export interface UseUndoRedoStateOptions {
  isEnabled: boolean;
  onApplyAction: (action: UndoRedoAction, isUndo: boolean) => void;
}

export interface UseUndoRedoStateReturn {
  canUndo: boolean;
  canRedo: boolean;
  undoCount: number;
  redoCount: number;
  undo: () => void;
  redo: () => void;
  pushAction: (action: UndoRedoAction) => void;
  recordMove: (before: NodePositionEntry[], after: NodePositionEntry[]) => void;
  clearHistory: () => void;
  isApplyingRef: React.RefObject<boolean>;
}

/** Check if positions have changed */
function hasPositionChanges(before: NodePositionEntry[], after: NodePositionEntry[]): boolean {
  return before.some((b, i) => {
    const a = after[i];
    if (!a || !b.position || !a.position) return false;
    return b.position.x !== a.position.x || b.position.y !== a.position.y;
  });
}

/** Create the undo/redo callbacks */
function createUndoRedoCallbacks(
  isEnabled: boolean,
  state: UndoRedoState,
  dispatch: React.Dispatch<UndoRedoReducerAction>,
  onApplyAction: (action: UndoRedoAction, isUndo: boolean) => void,
  isApplyingRef: React.RefObject<boolean>
) {
  const canUndo = isEnabled && state.past.length > 0;
  const canRedo = isEnabled && state.future.length > 0;

  return {
    canUndo, canRedo,
    pushAction: (action: UndoRedoAction) => {
      if (!isEnabled || isApplyingRef.current) return;
      dispatch({ type: 'PUSH', action });
      log.info(`[UndoRedo] Pushed action: ${action.type}`);
    },
    undo: () => {
      if (!canUndo) return;
      const lastAction = state.past[state.past.length - 1];
      log.info(`[UndoRedo] Undoing action: ${lastAction.type}`);
      onApplyAction(lastAction, true);
      dispatch({ type: 'UNDO' });
    },
    redo: () => {
      if (!canRedo) return;
      const nextAction = state.future[0];
      log.info(`[UndoRedo] Redoing action: ${nextAction.type}`);
      onApplyAction(nextAction, false);
      dispatch({ type: 'REDO' });
    },
    clearHistory: () => {
      dispatch({ type: 'CLEAR' });
      log.info('[UndoRedo] History cleared');
    }
  };
}

/**
 * Core undo/redo state management hook
 */
export function useUndoRedoState(options: UseUndoRedoStateOptions): UseUndoRedoStateReturn {
  const { isEnabled, onApplyAction } = options;
  const [state, dispatch] = useReducer(undoRedoReducer, { past: [], future: [] });
  const isApplyingRef = useRef(false);

  const callbacks = useMemo(
    () => createUndoRedoCallbacks(isEnabled, state, dispatch, onApplyAction, isApplyingRef),
    [isEnabled, state, onApplyAction]
  );

  const recordMove = useCallback((before: NodePositionEntry[], after: NodePositionEntry[]) => {
    if (!isEnabled || isApplyingRef.current) return;
    if (hasPositionChanges(before, after)) callbacks.pushAction({ type: 'move', before, after });
  }, [isEnabled, callbacks]);

  return useMemo(() => ({
    ...callbacks,
    undoCount: state.past.length,
    redoCount: state.future.length,
    recordMove, isApplyingRef
  }), [callbacks, state.past.length, state.future.length, recordMove]);
}
