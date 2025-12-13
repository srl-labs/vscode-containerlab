/**
 * Handler functions for bulk link operations
 */
// [MIGRATION] Replace with ReactFlow types from @xyflow/react
type CyCore = { zoom: () => number; pan: () => { x: number; y: number }; container: () => HTMLElement | null };
import { sendCommandToExtension } from '../../../utils/extensionMessaging';
import type { GraphChangeEntry } from '../../../hooks';
import { computeCandidates, buildBulkEdges, buildUndoRedoEntries, type LinkCandidate } from './bulkLinkUtils';
import type { CyElement } from '../../../../shared/types/messages';

type SetStatus = (status: string | null) => void;
type SetCandidates = (candidates: LinkCandidate[] | null) => void;

export function sendBulkEdgesToExtension(edges: CyElement[]): void {
  sendCommandToExtension('begin-graph-batch', {});
  try {
    for (const edge of edges) {
      const data = edge.data as Record<string, unknown>;
      sendCommandToExtension('create-link', {
        linkData: {
          id: String(data.id || ''),
          source: String(data.source || ''),
          target: String(data.target || ''),
          sourceEndpoint: String(data.sourceEndpoint || ''),
          targetEndpoint: String(data.targetEndpoint || '')
        }
      });
    }
  } finally {
    sendCommandToExtension('end-graph-batch', {});
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

export function confirmAndCreateLinks({
  cy,
  pendingCandidates,
  canApply,
  recordGraphChanges,
  setStatus,
  setPendingCandidates,
  onClose
}: ConfirmCreateParams): void {
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
  sendBulkEdgesToExtension(edges);
  recordGraphChanges?.(before, after);

  setPendingCandidates(null);
  setStatus(null);
  onClose();
}
