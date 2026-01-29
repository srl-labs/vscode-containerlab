/**
 * Helpers for converting graph edges into host persistence payloads.
 */
import type { LinkSaveData } from "../../shared/io/LinkPersistenceIO";
import type { TopoEdge, TopologyEdgeData } from "../../shared/types/graph";

export function toLinkSaveData(edge: TopoEdge): LinkSaveData {
  const data = edge.data as TopologyEdgeData | undefined;
  const extra = data?.extraData as Record<string, unknown> | undefined;
  const yamlSource = extra?.yamlSourceNodeId;
  const yamlTarget = extra?.yamlTargetNodeId;
  return {
    id: edge.id,
    source: typeof yamlSource === "string" && yamlSource.length > 0 ? yamlSource : edge.source,
    target: typeof yamlTarget === "string" && yamlTarget.length > 0 ? yamlTarget : edge.target,
    sourceEndpoint: data?.sourceEndpoint,
    targetEndpoint: data?.targetEndpoint,
    ...(data?.extraData ? { extraData: data.extraData } : {})
  };
}
