import type { ClabLabTreeNode } from "../../../treeView/common";
import { flattenContainers } from "../../../treeView/common";
import type { HostRuntimeContainer, HostRuntimeInterface } from "@srl-labs/clab-ui/host";

function treeItemLabelText(label: unknown): string | undefined {
  if (typeof label === "string") {
    return label;
  }
  if (label !== null && typeof label === "object" && "label" in label) {
    const value = (label as { label?: unknown }).label;
    return typeof value === "string" ? value : undefined;
  }
  return undefined;
}

function toRuntimeInterface(iface: {
  label?: unknown;
  name: string;
  alias: string;
  mac: string;
  mtu: number;
  state: string;
  type: string;
  ifIndex?: number;
  stats?: {
    rxBps?: number;
    txBps?: number;
    rxPps?: number;
    txPps?: number;
    rxBytes?: number;
    txBytes?: number;
    rxPackets?: number;
    txPackets?: number;
    statsIntervalSeconds?: number;
  };
  netemState?: {
    delay?: string;
    jitter?: string;
    loss?: string;
    rate?: string;
    corruption?: string;
  };
}): HostRuntimeInterface {
  return {
    name: iface.name,
    alias: iface.alias,
    label: treeItemLabelText(iface.label),
    mac: iface.mac,
    mtu: iface.mtu,
    state: iface.state,
    type: iface.type,
    ifIndex: iface.ifIndex,
    stats: iface.stats
      ? {
          rxBps: iface.stats.rxBps,
          txBps: iface.stats.txBps,
          rxPps: iface.stats.rxPps,
          txPps: iface.stats.txPps,
          rxBytes: iface.stats.rxBytes,
          txBytes: iface.stats.txBytes,
          rxPackets: iface.stats.rxPackets,
          txPackets: iface.stats.txPackets,
          statsIntervalSeconds: iface.stats.statsIntervalSeconds
        }
      : undefined,
    netemState: iface.netemState
      ? {
          delay: iface.netemState.delay,
          jitter: iface.netemState.jitter,
          loss: iface.netemState.loss,
          rate: iface.netemState.rate,
          corruption: iface.netemState.corruption
        }
      : undefined
  };
}

export function labsToRuntimeContainers(
  labs: Record<string, ClabLabTreeNode> | undefined
): HostRuntimeContainer[] {
  if (!labs) {
    return [];
  }

  const containers: HostRuntimeContainer[] = [];
  for (const lab of Object.values(labs)) {
    const labName = lab.name ?? "";
    for (const container of flattenContainers(lab.containers)) {
      containers.push({
        name: container.name,
        nodeName: container.rootNodeName ?? container.name_short,
        labName,
        state: container.state,
        kind: container.kind,
        image: container.image,
        ipv4Address: container.IPv4Address,
        ipv6Address: container.IPv6Address,
        interfaces: container.interfaces
          .map((iface) => toRuntimeInterface(iface))
          .sort((left, right) => left.name.localeCompare(right.name))
      });
    }
  }

  return containers.sort((left, right) => left.name.localeCompare(right.name));
}
