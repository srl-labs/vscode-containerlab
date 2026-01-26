/**
 * NodeRenderConfigContext - Controls node rendering detail level.
 */
import React, { createContext, useContext, useMemo } from "react";

interface NodeRenderConfig {
  suppressLabels: boolean;
}

const NodeRenderConfigContext = createContext<NodeRenderConfig>({
  suppressLabels: false
});

/**
 * Provider for node render configuration.
 * IMPORTANT: Value is memoized to prevent unnecessary re-renders of all consumers
 */
export const NodeRenderConfigProvider: React.FC<{
  value: NodeRenderConfig;
  children: React.ReactNode;
}> = ({ value, children }) => {
  // Memoize based on individual properties to ensure stable reference
  const memoizedValue = useMemo(() => {
    return { suppressLabels: value.suppressLabels };
  }, [value.suppressLabels]);

  return (
    <NodeRenderConfigContext.Provider value={memoizedValue}>
      {children}
    </NodeRenderConfigContext.Provider>
  );
};

export const useNodeRenderConfig = (): NodeRenderConfig => {
  return useContext(NodeRenderConfigContext);
};
