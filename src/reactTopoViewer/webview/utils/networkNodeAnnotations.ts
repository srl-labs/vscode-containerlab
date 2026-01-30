import type { Node } from "@xyflow/react";

import type { NetworkNodeAnnotation } from "../../shared/types/topology";

import { SPECIAL_NETWORK_TYPES, getNetworkType } from "./networkNodeTypes";

const NETWORK_NODE_TYPE = "network-node";

function isNetworkNode(node: Node): boolean {
  return node.type === NETWORK_NODE_TYPE;
}

export function buildNetworkNodeAnnotations(nodes: Node[]): NetworkNodeAnnotation[] {
  const annotations: NetworkNodeAnnotation[] = [];

  for (const node of nodes) {
    if (!isNetworkNode(node)) continue;

    const data = (node.data ?? {}) as Record<string, unknown>;
    const type = getNetworkType(data);
    if (!type || !SPECIAL_NETWORK_TYPES.has(type)) continue;

    const label = (data.label as string) || (data.name as string) || node.id;
    const geoCoordinates = data.geoCoordinates as { lat: number; lng: number } | undefined;

    annotations.push({
      id: node.id,
      type: type as NetworkNodeAnnotation["type"],
      label,
      position: node.position,
      ...(geoCoordinates ? { geoCoordinates } : {}),
      ...(typeof data.group === "string" ? { group: data.group } : {}),
      ...(typeof data.level === "string" ? { level: data.level } : {})
    });
  }

  return annotations;
}
