/**
 * Hook to manage link label visibility based on linkLabelMode
 *
 * NOTE: This hook was originally designed for Cytoscape. In the ReactFlow-based
 * implementation, link label visibility is handled directly by the edge components
 * based on the linkLabelMode context value. This hook is now a stub that maintains
 * the same interface for compatibility.
 */
import { useEffect, useRef } from "react";

import type { CyCompatCore } from "../useCytoCompatInstance";
import type { LinkLabelMode } from "../../context/TopoViewerContext";

/**
 * Hook for managing link label visibility based on the selected mode.
 *
 * In the ReactFlow implementation, link label visibility is controlled by the
 * edge components directly using the linkLabelMode from context, so this hook
 * is a no-op stub that maintains API compatibility.
 *
 * @param cyCompat - The Cytoscape compatibility instance (or null)
 * @param linkLabelMode - The current link label visibility mode
 */
export function useLinkLabelVisibility(
  cyCompat: CyCompatCore | null,
  linkLabelMode: LinkLabelMode
): void {
  const previousModeRef = useRef<LinkLabelMode | null>(null);

  useEffect(() => {
    // In ReactFlow, link label visibility is handled by the edge components directly.
    // This hook is kept for API compatibility but does not perform any operations.
    // The cyCompat instance is intentionally unused.
    void cyCompat;

    // Track mode changes for potential future use
    if (previousModeRef.current !== linkLabelMode) {
      previousModeRef.current = linkLabelMode;
    }
  }, [cyCompat, linkLabelMode]);
}
