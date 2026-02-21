/**
 * Shared helpers for network node classification.
 */
export const SPECIAL_NETWORK_TYPES = new Set([
  "host",
  "mgmt-net",
  "macvlan",
  "vxlan",
  "vxlan-stitch",
  "dummy",
]);

export const BRIDGE_NETWORK_TYPES = new Set(["bridge", "ovs-bridge"]);

function toRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const record: Record<string, unknown> = {};
  for (const [key, entryValue] of Object.entries(value)) {
    record[key] = entryValue;
  }
  return record;
}

export function getNetworkType(data: Record<string, unknown>): string | undefined {
  const kind = data.kind;
  if (typeof kind === "string") return kind;
  const nodeType = data.nodeType;
  if (typeof nodeType === "string") return nodeType;
  const extraData = toRecord(data.extraData);
  const extraKind = extraData?.kind;
  if (typeof extraKind === "string") return extraKind;
  return undefined;
}
