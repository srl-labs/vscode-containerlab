/**
 * Handler functions for bulk link operations
 * Uses React Flow nodes/edges arrays for graph queries.
 */
import type { TopoNode, TopoEdge } from "../../../../shared/types/graph";
import type { SnapshotCapture } from "../../../hooks/state/useUndoRedo";

import { computeCandidates, buildBulkEdges, type LinkCandidate } from "./bulkLinkUtils";

type SetStatus = (status: string | null) => void;
type SetCandidates = (candidates: LinkCandidate[] | null) => void;

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
  addEdge?: (edge: TopoEdge) => void;
  captureSnapshot?: (options: { edgeIds: string[] }) => SnapshotCapture;
  commitChange?: (before: SnapshotCapture, description: string) => void;
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
  captureSnapshot,
  commitChange,
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

  const edgeIds = builtEdges.map((edge) => edge.id);
  const snapshot = captureSnapshot ? captureSnapshot({ edgeIds }) : null;
  if (addEdge) {
    builtEdges.forEach((edge) => addEdge(edge));
  }
  if (snapshot && commitChange) {
    commitChange(snapshot, `Add ${builtEdges.length} link${builtEdges.length === 1 ? "" : "s"}`);
  }

  setPendingCandidates(null);
  setStatus(null);
  onClose();
}
