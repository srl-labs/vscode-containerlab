/**
 * Handler functions for bulk link operations
 * Uses React Flow nodes/edges arrays for graph queries.
 */
import type { TopoNode, TopoEdge } from "../../../../shared/types/graph";
import { executeTopologyCommand } from "../../../services";
import { toLinkSaveData } from "../../../services/linkSaveData";

import { buildBulkEdges, computeCandidates, type LinkCandidate } from "./bulkLinkUtils";

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
  setStatus,
  setPendingCandidates,
  onClose,
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

  if (addEdge) {
    builtEdges.forEach((edge) => addEdge(edge));
  }

  const commands = builtEdges.map((edge) => ({
    command: "addLink" as const,
    payload: toLinkSaveData(edge),
  }));

  if (commands.length > 0) {
    await executeTopologyCommand({ command: "batch", payload: { commands } });
  }

  setPendingCandidates(null);
  setStatus(null);
  onClose();
}
