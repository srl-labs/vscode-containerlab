/**
 * UndoRedoContext - Centralized undo/redo management with handler registration
 *
 * Provides undo/redo functionality that can be shared across components.
 * Handlers are registered via refs to avoid circular dependencies.
 */
import React, { createContext, useContext, useRef, useCallback, useMemo } from "react";
import type { Core as CyCore } from "cytoscape";

import {
  useUndoRedo,
  type UseUndoRedoReturn,
  type UndoRedoActionAnnotation,
  type UndoRedoActionPropertyEdit,
  type UndoRedoActionGroupMove,
  type GraphChange,
  type MembershipEntry
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
}

const UndoRedoContext = createContext<UndoRedoContextValue | null>(null);

/** Props for UndoRedoProvider */
interface UndoRedoProviderProps {
  cy: CyCore | null;
  enabled: boolean;
  children: React.ReactNode;
}

/** Provider component for undo/redo context */
export const UndoRedoProvider: React.FC<UndoRedoProviderProps> = ({ cy, enabled, children }) => {
  // Refs to hold the registered handlers
  const graphHandlerRef = useRef<ApplyGraphChangesHandler | undefined>(undefined);
  const propertyEditHandlerRef = useRef<ApplyPropertyEditHandler | undefined>(undefined);
  const annotationHandlerRef = useRef<ApplyAnnotationChangeHandler | undefined>(undefined);
  const groupMoveHandlerRef = useRef<ApplyGroupMoveChangeHandler | undefined>(undefined);
  const membershipHandlerRef = useRef<ApplyMembershipChangeHandler | undefined>(undefined);

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

  // Create the undo/redo hook with our delegating callbacks
  const undoRedo = useUndoRedo({
    cy,
    enabled,
    applyGraphChanges,
    applyPropertyEdit,
    applyAnnotationChange,
    applyGroupMoveChange,
    applyMembershipChange
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

  const value = useMemo<UndoRedoContextValue>(
    () => ({
      undoRedo,
      registerGraphHandler,
      registerPropertyEditHandler,
      registerAnnotationHandler,
      registerGroupMoveHandler,
      registerMembershipHandler
    }),
    [
      undoRedo,
      registerGraphHandler,
      registerPropertyEditHandler,
      registerAnnotationHandler,
      registerGroupMoveHandler,
      registerMembershipHandler
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
