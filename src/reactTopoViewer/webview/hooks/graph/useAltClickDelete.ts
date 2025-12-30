/**
 * useAltClickDelete - Hook for deleting nodes/edges via Alt+Click
 */
import { useEffect } from 'react';
import type { Core, EventObject, NodeSingular, EdgeSingular } from 'cytoscape';

import { log } from '../../utils/logger';

import { getModifierTapTarget } from './graphClickHelpers';

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
      const element = getModifierTapTarget<NodeSingular | EdgeSingular>(evt, cy, {
        mode,
        isLocked,
        modifier: 'alt'
      });
      if (!element) return;

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
