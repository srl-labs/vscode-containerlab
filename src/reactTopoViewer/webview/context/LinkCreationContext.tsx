/**
 * LinkCreationContext - Context for link creation state
 * Used to share link creation state with node components for hover highlighting
 */
import React, { createContext, useContext, ReactNode } from 'react';

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
 */
export const LinkCreationProvider: React.FC<LinkCreationProviderProps> = ({
  children,
  linkSourceNode
}) => {
  return (
    <LinkCreationContext.Provider value={{ linkSourceNode }}>
      {children}
    </LinkCreationContext.Provider>
  );
};

/**
 * Hook to access link creation state
 */
export const useLinkCreationContext = (): LinkCreationContextValue => {
  return useContext(LinkCreationContext);
};
