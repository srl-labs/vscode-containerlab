/**
 * LinkCreationContext - Context for link creation state
 * Used to share link creation state with node components for hover highlighting
 */
import type { ReactNode } from "react";
import React, { createContext, useContext, useMemo } from "react";

interface LinkCreationContextValue {
  /** The node ID where link creation started, null if not in link creation mode */
  linkSourceNode: string | null;
}

const LinkCreationContext = createContext<LinkCreationContextValue>({
  linkSourceNode: null
});

interface LinkCreationProviderProps {
  children: ReactNode;
  linkSourceNode: string | null;
}

/**
 * Provider for link creation state
 * IMPORTANT: Value is memoized to prevent unnecessary re-renders of all consumers
 */
export const LinkCreationProvider: React.FC<LinkCreationProviderProps> = ({
  children,
  linkSourceNode
}) => {
  // Memoize to prevent new object reference on every parent render
  const value = useMemo(() => {
    return { linkSourceNode };
  }, [linkSourceNode]);

  return <LinkCreationContext.Provider value={value}>{children}</LinkCreationContext.Provider>;
};

/**
 * Hook to access link creation state
 */
export const useLinkCreationContext = (): LinkCreationContextValue => {
  return useContext(LinkCreationContext);
};
