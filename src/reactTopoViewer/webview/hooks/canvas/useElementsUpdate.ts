/**
 * Hook for updating Cytoscape elements when they change
 * Uses useLayoutEffect to ensure Cytoscape is updated before other effects read from it
 */
import React, { useLayoutEffect } from 'react';
import type { Core } from 'cytoscape';
import type { CyElement } from '../../../shared/types/messages';
import { updateCytoscapeElements } from '../../components/canvas/init';

/**
 * Hook for updating elements when they change
 * Uses useLayoutEffect to ensure updates complete before other effects (like useSelectionData) read data
 */
export function useElementsUpdate(cyRef: React.RefObject<Core | null>, elements: CyElement[]): void {
  useLayoutEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    if (!elements.length) {
      cy.elements().remove();
      return;
    }
    updateCytoscapeElements(cy, elements);
  }, [cyRef, elements]);
}
