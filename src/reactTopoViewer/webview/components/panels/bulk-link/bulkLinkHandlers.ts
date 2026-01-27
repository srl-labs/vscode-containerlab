/**
 * Handler functions for bulk link operations
 * Uses React Flow nodes/edges arrays for graph queries.
 */
import type { TopoNode, TopoEdge, TopologyEdgeData } from "../../../../shared/types/graph";
import type { LinkSaveData } from "../../../../shared/io/LinkPersistenceIO";

import { computeCandidates, buildBulkEdges, type LinkCandidate } from "./bulkLinkUtils";
import { executeTopologyCommands } from "../../../services";

type SetStatus = (status: string | null) => void;
type SetCandidates = (candidates: LinkCandidate[] | null) => void;

function toLinkSaveData(edge: TopoEdge): LinkSaveData {
  const data = edge.data as TopologyEdgeData | undefined;
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceEndpoint: data?.sourceEndpoint,
    targetEndpoint: data?.targetEndpoint,
    ...(data?.extraData ? { extraData: data.extraData } : {})
  };
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

  if (addEdge) {
    builtEdges.forEach((edge) => addEdge(edge));
  }

  const commands = builtEdges.map((edge) => ({
    command: "addLink" as const,
    payload: toLinkSaveData(edge)
  }));

  await executeTopologyCommands(commands);

  setPendingCandidates(null);
  setStatus(null);
  onClose();
}
