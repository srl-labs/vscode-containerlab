/**
 * Helpers for converting graph edges into host persistence payloads.
 */
import type { LinkSaveData } from "../../shared/io/LinkPersistenceIO";
import type { TopoEdge, TopologyEdgeData } from "../../shared/types/graph";

export function toLinkSaveData(edge: TopoEdge): LinkSaveData {
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
