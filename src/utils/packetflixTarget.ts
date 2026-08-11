import type { ClabInterfaceTreeNode } from "../treeView/common";

const VETH_STITCH_INTERFACE_PREFIX = "clab-s-";
const FALLBACK_NETNS_ID = 4026532270;

export interface PacketflixTarget {
  netns?: number;
  name?: string;
  type?: string;
  prefix?: string;
  "network-interfaces": string[];
}

export function isHostCaptureInterface(node: ClabInterfaceTreeNode): boolean {
  return node.name.startsWith(VETH_STITCH_INTERFACE_PREFIX);
}

export function captureScopeKey(node: ClabInterfaceTreeNode): string {
  return `${node.parentName}:${isHostCaptureInterface(node) ? "host" : "container"}`;
}

export function buildPacketflixTarget(
  nodes: ClabInterfaceTreeNode[],
  hostNetns?: number
): PacketflixTarget {
  const base = nodes[0];
  const interfaceNames = nodes.map((node) => node.name);

  if (isHostCaptureInterface(base)) {
    if (hostNetns === undefined) {
      throw new Error("host network namespace is required for a veth-stitch capture");
    }
    return {
      netns: hostNetns,
      "network-interfaces": interfaceNames
    };
  }

  if (nodes.length === 1) {
    return {
      name: base.parentName,
      type: "docker",
      "network-interfaces": interfaceNames
    };
  }

  const baseWithNetns = base as ClabInterfaceTreeNode & { netns?: number };
  return {
    netns: baseWithNetns.netns ?? FALLBACK_NETNS_ID,
    name: base.parentName,
    type: "docker",
    prefix: "",
    "network-interfaces": interfaceNames
  };
}
