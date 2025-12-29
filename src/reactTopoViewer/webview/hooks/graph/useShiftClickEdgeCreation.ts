/**
 * useShiftClickEdgeCreation - Hook for starting edge creation via Shift+Click on node
 */
import { useEffect } from 'react';
import type { Core, EventObject, NodeSingular } from 'cytoscape';

import { log } from '../../utils/logger';

interface ShiftClickEdgeCreationOptions {
  mode: 'edit' | 'view';
  isLocked: boolean;
  startEdgeCreation: (nodeId: string) => void;
}

/**
 * Hook that enables Shift+Click on a node to start edge/link creation
 * Only active in edit mode when not locked
 */
export function useShiftClickEdgeCreation(
  cy: Core | null,
  options: ShiftClickEdgeCreationOptions
): void {
  const { mode, isLocked, startEdgeCreation } = options;

  useEffect(() => {
    if (!cy) return;

    const handleTap = (evt: EventObject) => {
      // Only work in edit mode when not locked
      if (mode !== 'edit' || isLocked) return;

      const originalEvent = evt.originalEvent as MouseEvent;
      if (!originalEvent?.shiftKey) return;

      const target = evt.target as NodeSingular | Core;

      // Skip background clicks (handled by node creation)
      if (target === cy) return;

      const node = target as NodeSingular;

      // Skip annotation nodes
      const role = node.data('topoViewerRole') as string | undefined;
      if (role === 'freeText' || role === 'freeShape' || role === 'group') return;

      log.info(`[ShiftClickEdgeCreation] Starting edge creation from node: ${node.id()}`);
      startEdgeCreation(node.id());
    };

    cy.on('tap', 'node', handleTap);
    return () => { cy.off('tap', 'node', handleTap); };
  }, [cy, mode, isLocked, startEdgeCreation]);
}
