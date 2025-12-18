/**
 * Hook for updating Cytoscape elements when they change
 * Uses useLayoutEffect to ensure Cytoscape is updated before other effects read from it
 */
import React, { useLayoutEffect, useRef } from 'react';
import type { Core } from 'cytoscape';
import type { CyElement } from '../../../shared/types/messages';
import { updateCytoscapeElements } from '../../components/canvas/init';

/**
 * Check if the React state update is just an addition of elements already in Cytoscape
 * In this case, we can skip the full reset since Cytoscape already has the correct state
 */
function canSkipUpdate(cy: Core, elements: CyElement[]): boolean {
  const cyIds = new Set(cy.elements().map(el => el.id()));
  const reactIds = new Set(elements.map(el => el.data?.id).filter(Boolean) as string[]);

  // Check if Cytoscape has exactly the same or more elements than React state
  // This happens when we add a node directly to Cytoscape and then dispatch to React
  if (cyIds.size >= reactIds.size) {
    // All React element IDs must exist in Cytoscape
    for (const id of reactIds) {
      if (!cyIds.has(id)) {
        return false; // React has an element that Cytoscape doesn't - need to add it
      }
    }
    // All Cytoscape elements must exist in React (or be about to be removed)
    for (const id of cyIds) {
      if (!reactIds.has(id)) {
        return false; // Cytoscape has extra element that React doesn't - need to sync
      }
    }
    // IDs match - Cytoscape is already in sync, skip update to preserve positions
    return true;
  }
  return false;
}

/**
 * Hook for updating elements when they change
 * Uses useLayoutEffect to ensure updates complete before other effects (like useSelectionData) read data
 *
 * IMPORTANT: This hook detects when React state changes are already reflected in Cytoscape
 * (e.g., when we add a node via cy.add() and then dispatch ADD_NODE). In such cases,
 * we skip the full reset to preserve node positions and avoid visual jumps.
 */
export function useElementsUpdate(cyRef: React.RefObject<Core | null>, elements: CyElement[]): void {
  const isInitializedRef = useRef(false);

  useLayoutEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    if (!elements.length) {
      cy.elements().remove();
      isInitializedRef.current = false;
      return;
    }

    // Skip update if Cytoscape already has all the elements (e.g., after direct cy.add())
    // This preserves positions when adding nodes via UI
    if (isInitializedRef.current && canSkipUpdate(cy, elements)) {
      return;
    }

    updateCytoscapeElements(cy, elements);
    isInitializedRef.current = true;
  }, [cyRef, elements]);
}
