/**
 * EdgeRenderConfigContext - Controls edge label rendering behavior without
 * forcing edges to subscribe to unrelated state updates.
 */
import React, { createContext, useContext, useMemo } from "react";

export type EdgeLabelMode = "show-all" | "on-select" | "hide";

interface EdgeRenderConfig {
  labelMode: EdgeLabelMode;
  suppressLabels: boolean;
  suppressHitArea: boolean;
}

const EdgeRenderConfigContext = createContext<EdgeRenderConfig>({
  labelMode: "show-all",
  suppressLabels: false,
  suppressHitArea: false
});

/**
 * Provider for edge render configuration.
 * IMPORTANT: Value is memoized to prevent unnecessary re-renders of all consumers
 */
export const EdgeRenderConfigProvider: React.FC<{
  value: EdgeRenderConfig;
  children: React.ReactNode;
}> = ({ value, children }) => {
  // Memoize based on individual properties to ensure stable reference
  const memoizedValue = useMemo(
    () => ({
      labelMode: value.labelMode,
      suppressLabels: value.suppressLabels,
      suppressHitArea: value.suppressHitArea
    }),
    [value.labelMode, value.suppressLabels, value.suppressHitArea]
  );

  return (
    <EdgeRenderConfigContext.Provider value={memoizedValue}>
      {children}
    </EdgeRenderConfigContext.Provider>
  );
};

export const useEdgeRenderConfig = (): EdgeRenderConfig => {
  return useContext(EdgeRenderConfigContext);
};
