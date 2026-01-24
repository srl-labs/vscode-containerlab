/**
 * UndoRedoContext - Centralized undo/redo management with handler registration
 *
 * Provides undo/redo functionality that can be shared across components.
 * Handlers are registered via refs to avoid circular dependencies.
 */
import React, { createContext, useContext, useRef, useCallback, useMemo } from "react";

import {
  useUndoRedo,
  type UseUndoRedoReturn,
  type UndoRedoActionAnnotation,
  type UndoRedoActionPropertyEdit,
  type UndoRedoActionGroupMove,
  type GraphChange,
  type MembershipEntry,
  type NodePositionEntry
} from "../hooks/state/useUndoRedo";

/** Handler types for undo/redo callbacks */
export type ApplyGraphChangesHandler = (changes: GraphChange[]) => void;
export type ApplyPropertyEditHandler = (
  action: UndoRedoActionPropertyEdit,
  isUndo: boolean
) => void;
export type ApplyAnnotationChangeHandler = (
  action: UndoRedoActionAnnotation,
  isUndo: boolean
) => void;
export type ApplyGroupMoveChangeHandler = (
  action: UndoRedoActionGroupMove,
  isUndo: boolean
) => void;
export type ApplyMembershipChangeHandler = (memberships: MembershipEntry[]) => void;
export type ApplyPositionChangeHandler = (positions: NodePositionEntry[]) => void;
export type CapturePositionsHandler = (nodeIds: string[]) => NodePositionEntry[];

/** Context value shape */
interface UndoRedoContextValue {
  /** Core undo/redo functionality */
  undoRedo: UseUndoRedoReturn;
  /** Register a graph changes handler */
  registerGraphHandler: (handler: ApplyGraphChangesHandler) => void;
  /** Register a property edit handler */
  registerPropertyEditHandler: (handler: ApplyPropertyEditHandler) => void;
  /** Register an annotation change handler */
  registerAnnotationHandler: (handler: ApplyAnnotationChangeHandler) => void;
  /** Register a group move handler */
  registerGroupMoveHandler: (handler: ApplyGroupMoveChangeHandler) => void;
  /** Register a membership change handler */
  registerMembershipHandler: (handler: ApplyMembershipChangeHandler) => void;
  /** Register a position change handler */
  registerPositionHandler: (handler: ApplyPositionChangeHandler) => void;
  /** Register a capture positions handler */
  registerCapturePositionsHandler: (handler: CapturePositionsHandler) => void;
}

const UndoRedoContext = createContext<UndoRedoContextValue | null>(null);

/** Props for UndoRedoProvider */
interface UndoRedoProviderProps {
  enabled: boolean;
  children: React.ReactNode;
}

/** Provider component for undo/redo context */
export const UndoRedoProvider: React.FC<UndoRedoProviderProps> = ({ enabled, children }) => {
  // Refs to hold the registered handlers
  const graphHandlerRef = useRef<ApplyGraphChangesHandler | undefined>(undefined);
  const propertyEditHandlerRef = useRef<ApplyPropertyEditHandler | undefined>(undefined);
  const annotationHandlerRef = useRef<ApplyAnnotationChangeHandler | undefined>(undefined);
  const groupMoveHandlerRef = useRef<ApplyGroupMoveChangeHandler | undefined>(undefined);
  const membershipHandlerRef = useRef<ApplyMembershipChangeHandler | undefined>(undefined);
  const positionHandlerRef = useRef<ApplyPositionChangeHandler | undefined>(undefined);
  const capturePositionsHandlerRef = useRef<CapturePositionsHandler | undefined>(undefined);

  // Stable callbacks that delegate to the refs
  const applyGraphChanges = useCallback((changes: GraphChange[]) => {
    graphHandlerRef.current?.(changes);
  }, []);

  const applyPropertyEdit = useCallback((action: UndoRedoActionPropertyEdit, isUndo: boolean) => {
    propertyEditHandlerRef.current?.(action, isUndo);
  }, []);

  const applyAnnotationChange = useCallback((action: UndoRedoActionAnnotation, isUndo: boolean) => {
    annotationHandlerRef.current?.(action, isUndo);
  }, []);

  const applyGroupMoveChange = useCallback((action: UndoRedoActionGroupMove, isUndo: boolean) => {
    groupMoveHandlerRef.current?.(action, isUndo);
  }, []);

  const applyMembershipChange = useCallback((memberships: MembershipEntry[]) => {
    membershipHandlerRef.current?.(memberships);
  }, []);

  const applyPositionChange = useCallback((positions: NodePositionEntry[]) => {
    positionHandlerRef.current?.(positions);
  }, []);

  const capturePositions = useCallback((nodeIds: string[]): NodePositionEntry[] => {
    return capturePositionsHandlerRef.current?.(nodeIds) ?? [];
  }, []);

  // Create the undo/redo hook with our delegating callbacks
  const undoRedo = useUndoRedo({
    enabled,
    applyGraphChanges,
    applyPropertyEdit,
    applyAnnotationChange,
    applyGroupMoveChange,
    applyMembershipChange,
    applyPositionChange,
    capturePositions
  });

  // Registration functions
  const registerGraphHandler = useCallback((handler: ApplyGraphChangesHandler) => {
    graphHandlerRef.current = handler;
  }, []);

  const registerPropertyEditHandler = useCallback((handler: ApplyPropertyEditHandler) => {
    propertyEditHandlerRef.current = handler;
  }, []);

  const registerAnnotationHandler = useCallback((handler: ApplyAnnotationChangeHandler) => {
    annotationHandlerRef.current = handler;
  }, []);

  const registerGroupMoveHandler = useCallback((handler: ApplyGroupMoveChangeHandler) => {
    groupMoveHandlerRef.current = handler;
  }, []);

  const registerMembershipHandler = useCallback((handler: ApplyMembershipChangeHandler) => {
    membershipHandlerRef.current = handler;
  }, []);

  const registerPositionHandler = useCallback((handler: ApplyPositionChangeHandler) => {
    positionHandlerRef.current = handler;
  }, []);

  const registerCapturePositionsHandler = useCallback((handler: CapturePositionsHandler) => {
    capturePositionsHandlerRef.current = handler;
  }, []);

  const value = useMemo<UndoRedoContextValue>(
    () => ({
      undoRedo,
      registerGraphHandler,
      registerPropertyEditHandler,
      registerAnnotationHandler,
      registerGroupMoveHandler,
      registerMembershipHandler,
      registerPositionHandler,
      registerCapturePositionsHandler
    }),
    [
      undoRedo,
      registerGraphHandler,
      registerPropertyEditHandler,
      registerAnnotationHandler,
      registerGroupMoveHandler,
      registerMembershipHandler,
      registerPositionHandler,
      registerCapturePositionsHandler
    ]
  );

  return <UndoRedoContext.Provider value={value}>{children}</UndoRedoContext.Provider>;
};

/** Hook to access undo/redo context */
export function useUndoRedoContext(): UndoRedoContextValue {
  const context = useContext(UndoRedoContext);
  if (!context) {
    throw new Error("useUndoRedoContext must be used within an UndoRedoProvider");
  }
  return context;
}

/** Hook to just get the undoRedo object (convenience) */
export function useUndoRedoActions(): UseUndoRedoReturn {
  return useUndoRedoContext().undoRedo;
}
