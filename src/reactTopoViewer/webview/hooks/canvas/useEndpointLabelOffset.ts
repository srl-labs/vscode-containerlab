/**
 * Apply source/target endpoint label offsets to edges.
 * Per-link overrides take precedence over the global setting.
 *
 * NOTE: This hook was originally designed for Cytoscape. In the ReactFlow-based
 * implementation, edge label styling is handled directly by the edge components.
 * This hook is now a stub that maintains the same interface for compatibility.
 */
import { useEffect } from "react";

import type { CyCompatCore } from "../useCytoCompatInstance";
import type { EdgeAnnotation } from "../../../shared/types/topology";

export type EndpointLabelOffsetConfig = {
  globalEnabled: boolean;
  globalOffset: number;
  edgeAnnotations?: EdgeAnnotation[];
};

/**
 * Hook for applying endpoint label offsets to edges.
 *
 * In the ReactFlow implementation, edge label styling is handled by the edge components
 * themselves, so this hook is a no-op stub that maintains API compatibility.
 *
 * @param cyCompat - The Cytoscape compatibility instance (or null)
 * @param config - Configuration for endpoint label offsets
 */
export function useEndpointLabelOffset(
  cyCompat: CyCompatCore | null,
  config: EndpointLabelOffsetConfig
): void {
  useEffect(() => {
    // In ReactFlow, edge label offsets are handled by the edge components directly.
    // This hook is kept for API compatibility but does not perform any operations.
    // The cyCompat instance and config are intentionally unused.
    void cyCompat;
    void config;
  }, [cyCompat, config.globalEnabled, config.globalOffset, config.edgeAnnotations]);
}
