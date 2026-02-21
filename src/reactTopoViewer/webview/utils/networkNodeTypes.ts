/**
 * Shared helpers for network node classification.
 */
import { getRecordUnknown } from "../../shared/utilities/typeHelpers";

export const SPECIAL_NETWORK_TYPES = new Set([
  "host",
  "mgmt-net",
  "macvlan",
  "vxlan",
  "vxlan-stitch",
  "dummy",
]);

export const BRIDGE_NETWORK_TYPES = new Set(["bridge", "ovs-bridge"]);

export function getNetworkType(data: Record<string, unknown>): string | undefined {
  const kind = data.kind;
  if (typeof kind === "string") return kind;
  const nodeType = data.nodeType;
  if (typeof nodeType === "string") return nodeType;
  const extraData = getRecordUnknown(data.extraData);
  const extraKind = extraData?.kind;
  if (typeof extraKind === "string") return extraKind;
  return undefined;
}
