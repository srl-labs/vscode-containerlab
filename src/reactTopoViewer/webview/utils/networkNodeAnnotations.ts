import type { Node } from "@xyflow/react";

import type { NetworkNodeAnnotation } from "../../shared/types/topology";
import { getRecordUnknown, getString } from "../../shared/utilities/typeHelpers";

import { SPECIAL_NETWORK_TYPES, getNetworkType } from "./networkNodeTypes";

const NETWORK_NODE_TYPE = "network-node";

function isNetworkNode(node: Node): boolean {
  return node.type === NETWORK_NODE_TYPE;
}

function toGeoCoordinates(value: unknown): { lat: number; lng: number } | undefined {
  const record = getRecordUnknown(value);
  if (record === undefined) return undefined;
  const lat = record.lat;
  const lng = record.lng;
  if (typeof lat !== "number" || !Number.isFinite(lat)) return undefined;
  if (typeof lng !== "number" || !Number.isFinite(lng)) return undefined;
  return { lat, lng };
}

function isNetworkAnnotationType(value: string): value is NetworkNodeAnnotation["type"] {
  return (
    value === "host" ||
    value === "mgmt-net" ||
    value === "macvlan" ||
    value === "vxlan" ||
    value === "vxlan-stitch" ||
    value === "dummy" ||
    value === "bridge" ||
    value === "ovs-bridge"
  );
}

export function buildNetworkNodeAnnotations(nodes: Node[]): NetworkNodeAnnotation[] {
  const annotations: NetworkNodeAnnotation[] = [];

  for (const node of nodes) {
    if (!isNetworkNode(node)) continue;

    const data = getRecordUnknown(node.data);
    if (data === undefined) continue;

    const type = getNetworkType(data);
    if (type === undefined || !SPECIAL_NETWORK_TYPES.has(type) || !isNetworkAnnotationType(type)) {
      continue;
    }

    const labelFromData = getString(data.label);
    const labelFromName = getString(data.name);
    let label = node.id;
    if (labelFromData !== undefined && labelFromData.length > 0) {
      label = labelFromData;
    } else if (labelFromName !== undefined && labelFromName.length > 0) {
      label = labelFromName;
    }
    const geoCoordinates = toGeoCoordinates(data.geoCoordinates);

    annotations.push({
      id: node.id,
      type,
      label,
      position: node.position,
      ...(geoCoordinates !== undefined ? { geoCoordinates } : {}),
      ...(typeof data.group === "string" ? { group: data.group } : {}),
      ...(typeof data.level === "string" ? { level: data.level } : {}),
    });
  }

  return annotations;
}
