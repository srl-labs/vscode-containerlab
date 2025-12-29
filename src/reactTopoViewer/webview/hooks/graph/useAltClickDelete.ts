/**
 * useAltClickDelete - Hook for deleting nodes/edges via Alt+Click
 */
import { useEffect } from 'react';
import type { Core, EventObject, NodeSingular, EdgeSingular } from 'cytoscape';

import { log } from '../../utils/logger';

interface AltClickDeleteOptions {
  mode: 'edit' | 'view';
  isLocked: boolean;
  onDeleteNode: (nodeId: string) => void;
  onDeleteEdge: (edgeId: string) => void;
}

/**
 * Hook that enables Alt+Click to delete nodes and edges
 * Only active in edit mode when not locked
 */
export function useAltClickDelete(
  cy: Core | null,
  options: AltClickDeleteOptions
): void {
  const { mode, isLocked, onDeleteNode, onDeleteEdge } = options;

  useEffect(() => {
    if (!cy) return;

    const handleTap = (evt: EventObject) => {
      // Only work in edit mode when not locked
      if (mode !== 'edit' || isLocked) return;

      const originalEvent = evt.originalEvent as MouseEvent;
      if (!originalEvent?.altKey) return;

      const target = evt.target as NodeSingular | EdgeSingular | Core;

      // Skip background clicks
      if (target === cy) return;

      // Skip annotation nodes (handled by their own layers)
      const element = target as NodeSingular | EdgeSingular;
      const role = element.data('topoViewerRole') as string | undefined;
      if (role === 'freeText' || role === 'freeShape' || role === 'group') return;

      if (element.isNode()) {
        log.info(`[AltClickDelete] Deleting node: ${element.id()}`);
        onDeleteNode(element.id());
      } else if (element.isEdge()) {
        log.info(`[AltClickDelete] Deleting edge: ${element.id()}`);
        onDeleteEdge(element.id());
      }
    };

    cy.on('tap', 'node, edge', handleTap);
    return () => { cy.off('tap', 'node, edge', handleTap); };
  }, [cy, mode, isLocked, onDeleteNode, onDeleteEdge]);
}
