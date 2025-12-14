/**
 * Hook for updating Cytoscape elements when they change
 */
import React, { useEffect } from 'react';
import type { Core } from 'cytoscape';
import type { CyElement } from '../../../shared/types/messages';
import { updateCytoscapeElements } from '../../components/canvas/init';

/**
 * Hook for updating elements when they change
 */
export function useElementsUpdate(cyRef: React.RefObject<Core | null>, elements: CyElement[]): void {
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    if (!elements.length) {
      cy.elements().remove();
      return;
    }
    updateCytoscapeElements(cy, elements);
  }, [cyRef, elements]);
}
