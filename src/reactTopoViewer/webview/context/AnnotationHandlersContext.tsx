/**
 * Context for annotation handlers in React Flow
 * Allows annotation nodes to access handlers for resize, position updates, etc.
 */
import React, { createContext, useContext } from "react";

import type { AnnotationHandlers } from "../components/react-flow-canvas/types";

const AnnotationHandlersContext = createContext<AnnotationHandlers | null>(null);

interface AnnotationHandlersProviderProps {
  handlers: AnnotationHandlers | undefined;
  children: React.ReactNode;
}

export const AnnotationHandlersProvider: React.FC<AnnotationHandlersProviderProps> = ({
  handlers,
  children
}) => {
  return (
    <AnnotationHandlersContext.Provider value={handlers ?? null}>
      {children}
    </AnnotationHandlersContext.Provider>
  );
};

/**
 * Hook to access annotation handlers from context
 */
export function useAnnotationHandlers(): AnnotationHandlers | null {
  return useContext(AnnotationHandlersContext);
}
