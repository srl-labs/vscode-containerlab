/**
 * Handler functions for bulk link operations
 * Uses React Flow nodes/edges arrays for graph queries.
 */
import type { GraphChange } from "../../../hooks/state/useUndoRedo";
import type { CyElement } from "../../../../shared/types/messages";
import type { TopoNode, TopoEdge } from "../../../../shared/types/graph";
import { createLink, beginBatch, endBatch, type LinkSaveData } from "../../../services";

import {
  computeCandidates,
  buildBulkEdges,
  buildUndoRedoEntries,
  type LinkCandidate
} from "./bulkLinkUtils";

type SetStatus = (status: string | null) => void;
type SetCandidates = (candidates: LinkCandidate[] | null) => void;

export async function sendBulkEdgesToExtension(edges: CyElement[]): Promise<void> {
  beginBatch();
  try {
    for (const edge of edges) {
      const data = edge.data as Record<string, unknown>;
      const linkData: LinkSaveData = {
        id: String(data.id || ""),
        source: String(data.source || ""),
        target: String(data.target || ""),
        sourceEndpoint: String(data.sourceEndpoint || ""),
        targetEndpoint: String(data.targetEndpoint || "")
      };
      await createLink(linkData);
    }
  } finally {
    await endBatch();
  }
}

export function computeAndValidateCandidates(
  nodes: TopoNode[],
  edges: TopoEdge[],
  sourcePattern: string,
  targetPattern: string,
  setStatus: SetStatus,
  setPendingCandidates: SetCandidates
): void {
  if (nodes.length === 0) {
    setStatus("Topology not ready yet.");
    return;
  }
  if (!sourcePattern.trim() || !targetPattern.trim()) {
    setStatus("Enter both Source Pattern and Target Pattern.");
    return;
  }

  const candidates = computeCandidates(nodes, edges, sourcePattern.trim(), targetPattern.trim());
  if (candidates.length === 0) {
    setStatus("No new links would be created with the specified patterns.");
    return;
  }

  setPendingCandidates(candidates);
  setStatus(null);
}

interface ConfirmCreateParams {
  nodes: TopoNode[];
  edges: TopoEdge[];
  pendingCandidates: LinkCandidate[] | null;
  canApply: boolean;
  addEdge?: (edge: CyElement) => void;
  recordGraphChanges?: (before: GraphChange[], after: GraphChange[]) => void;
  setStatus: SetStatus;
  setPendingCandidates: SetCandidates;
  onClose: () => void;
}

export async function confirmAndCreateLinks({
  nodes,
  edges,
  pendingCandidates,
  canApply,
  addEdge,
  recordGraphChanges,
  setStatus,
  setPendingCandidates,
  onClose
}: ConfirmCreateParams): Promise<void> {
  if (nodes.length === 0 || !pendingCandidates) return;
  if (!canApply) {
    setStatus("Unlock the lab to create links.");
    setPendingCandidates(null);
    return;
  }

  const builtEdges = buildBulkEdges(nodes, edges, pendingCandidates);
  if (builtEdges.length === 0) {
    setStatus("No new links to create.");
    setPendingCandidates(null);
    return;
  }

  const { before, after } = buildUndoRedoEntries(builtEdges);
  if (addEdge) {
    builtEdges.forEach((edge) => addEdge(edge));
  }
  await sendBulkEdgesToExtension(builtEdges);
  recordGraphChanges?.(before, after);

  setPendingCandidates(null);
  setStatus(null);
  onClose();
}
