/**
 * Handler functions for bulk link operations
 */
import type { Core as CyCore } from 'cytoscape';

import type { GraphChangeEntry } from '../../../hooks/graph/copyPasteUtils';
import type { CyElement } from '../../../../shared/types/messages';
import { createLink, beginBatch, endBatch, type LinkSaveData } from '../../../services';

import { computeCandidates, buildBulkEdges, buildUndoRedoEntries, type LinkCandidate } from './bulkLinkUtils';

type SetStatus = (status: string | null) => void;
type SetCandidates = (candidates: LinkCandidate[] | null) => void;

export async function sendBulkEdgesToExtension(edges: CyElement[]): Promise<void> {
  beginBatch();
  try {
    for (const edge of edges) {
      const data = edge.data as Record<string, unknown>;
      const linkData: LinkSaveData = {
        id: String(data.id || ''),
        source: String(data.source || ''),
        target: String(data.target || ''),
        sourceEndpoint: String(data.sourceEndpoint || ''),
        targetEndpoint: String(data.targetEndpoint || '')
      };
      await createLink(linkData);
    }
  } finally {
    await endBatch();
  }
}

export function computeAndValidateCandidates(
  cy: CyCore | null,
  sourcePattern: string,
  targetPattern: string,
  setStatus: SetStatus,
  setPendingCandidates: SetCandidates
): void {
  if (!cy) {
    setStatus('Topology not ready yet.');
    return;
  }
  if (!sourcePattern.trim() || !targetPattern.trim()) {
    setStatus('Enter both Source Pattern and Target Pattern.');
    return;
  }

  const candidates = computeCandidates(cy, sourcePattern.trim(), targetPattern.trim());
  if (candidates.length === 0) {
    setStatus('No new links would be created with the specified patterns.');
    return;
  }

  setPendingCandidates(candidates);
  setStatus(null);
}

interface ConfirmCreateParams {
  cy: CyCore | null;
  pendingCandidates: LinkCandidate[] | null;
  canApply: boolean;
  recordGraphChanges?: (before: GraphChangeEntry[], after: GraphChangeEntry[]) => void;
  setStatus: SetStatus;
  setPendingCandidates: SetCandidates;
  onClose: () => void;
}

export async function confirmAndCreateLinks({
  cy,
  pendingCandidates,
  canApply,
  recordGraphChanges,
  setStatus,
  setPendingCandidates,
  onClose
}: ConfirmCreateParams): Promise<void> {
  if (!cy || !pendingCandidates) return;
  if (!canApply) {
    setStatus('Unlock the lab to create links.');
    setPendingCandidates(null);
    return;
  }

  const edges = buildBulkEdges(cy, pendingCandidates);
  if (edges.length === 0) {
    setStatus('No new links to create.');
    setPendingCandidates(null);
    return;
  }

  const { before, after } = buildUndoRedoEntries(edges);
  await sendBulkEdgesToExtension(edges);
  recordGraphChanges?.(before, after);

  setPendingCandidates(null);
  setStatus(null);
  onClose();
}
