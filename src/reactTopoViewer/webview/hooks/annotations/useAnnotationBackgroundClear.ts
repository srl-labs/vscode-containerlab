/**
 * Hook to clear annotation selection when clicking on the canvas background
 */
import { useEffect, useCallback } from 'react';
import type { Core as CyCore, EventObject } from 'cytoscape';

import { log } from '../../utils/logger';

interface UseAnnotationBackgroundClearOptions {
  cy: CyCore | null;
  selectedAnnotationIds: Set<string>;
  onClearSelection: () => void;
}

/**
 * Hook that clears annotation selection when clicking on the canvas background
 */
export function useAnnotationBackgroundClear(options: UseAnnotationBackgroundClearOptions): void {
  const { cy, selectedAnnotationIds, onClearSelection } = options;

  const handleBackgroundTap = useCallback((event: EventObject) => {
    // Only handle clicks directly on the cytoscape canvas (not on nodes/edges)
    if (event.target !== cy) return;

    // Only clear if there are selected annotations
    if (selectedAnnotationIds.size > 0) {
      log.info('[AnnotationBackgroundClear] Clearing annotation selection on background tap');
      onClearSelection();
    }
  }, [cy, selectedAnnotationIds, onClearSelection]);

  useEffect(() => {
    if (!cy) return;

    cy.on('tap', handleBackgroundTap);

    return () => {
      cy.off('tap', handleBackgroundTap);
    };
  }, [cy, handleBackgroundTap]);
}
