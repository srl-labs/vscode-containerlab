/**
 * Adapter that wraps VS Code tree data to implement ContainerDataProvider.
 * This allows the shared parser to access container data without VS Code dependencies.
 */

import {
  type ClabLabTreeNode,
  type ClabContainerTreeNode,
  type ClabInterfaceTreeNode,
  flattenContainers
} from "../../../treeView/common";
import { mapSrosInterfaceName } from "../../shared/parsing/DistributedSrosMapper";
import type {
  ContainerDataProvider,
  ContainerInfo,
  InterfaceInfo
} from "../../shared/parsing/types";

import { sortContainersByInterfacePriority } from "./TreeUtils";

/**
 * Adapts VS Code tree nodes to the ContainerDataProvider interface.
 */
export class ContainerDataAdapter implements ContainerDataProvider {
  /** Map from lab name to lab node (for quick lookup by name) */
  private readonly labByName: Map<string, ClabLabTreeNode>;
  /** Map from file path to lab node (original keys from discoverInspectLabs) */
  private readonly labByPath: Map<string, ClabLabTreeNode>;

  constructor(clabTreeData: Record<string, ClabLabTreeNode> | undefined) {
    this.labByName = new Map();
    this.labByPath = new Map();
    if (clabTreeData) {
      for (const [pathKey, labNode] of Object.entries(clabTreeData)) {
        // Store by path (the original key)
        this.labByPath.set(pathKey, labNode);
        // Also store by lab name for easier lookup
        if (labNode.name) {
          this.labByName.set(labNode.name, labNode);
        }
      }
    }
  }

  /**
   * Finds a lab node by name, trying name map first then falling back to path map.
   */
  private findLabNode(labName: string): ClabLabTreeNode | undefined {
    // Try direct lookup by lab name first
    const byName = this.labByName.get(labName);
    if (byName) return byName;

    // Fall back to searching all labs by their name property
    for (const labNode of this.labByPath.values()) {
      if (labNode.name === labName) {
        return labNode;
      }
    }
    return undefined;
  }

  /**
   * Finds a container tree node by name within a lab.
   */
  private findContainerNode(
    containerName: string,
    labName: string
  ): ClabContainerTreeNode | undefined {
    const labNode = this.findLabNode(labName);
    if (!labNode?.containers) return undefined;

    return flattenContainers(labNode.containers).find(
      (c) => c.name === containerName || c.name_short === containerName
    );
  }

  private normalizeName(value: string | undefined): string {
    return (value ?? "").trim().toLowerCase();
  }

  private extractDistributedBaseFromName(value: string | undefined): string | undefined {
    const trimmed = (value ?? "").trim();
    if (!trimmed) {
      return undefined;
    }
    const idx = trimmed.lastIndexOf("-");
    if (idx <= 0 || idx >= trimmed.length - 1) {
      return undefined;
    }
    return trimmed.slice(0, idx);
  }

  private containerMatchesDistributedNode(
    container: ClabContainerTreeNode,
    normalizedBase: string
  ): boolean {
    if (container.kind !== "nokia_srsim" || !normalizedBase) {
      return false;
    }

    const root = this.normalizeName(container.rootNodeName);
    if (root && root === normalizedBase) {
      return true;
    }

    const shortName = this.normalizeName(container.name_short);
    if (shortName.startsWith(`${normalizedBase}-`)) {
      return true;
    }

    const shortBase = this.normalizeName(this.extractDistributedBaseFromName(container.name_short));
    if (shortBase && shortBase === normalizedBase) {
      return true;
    }

    const label =
      typeof container.label === "string"
        ? this.normalizeName(container.label)
        : this.normalizeName((container.label as { label?: string } | undefined)?.label);
    if (label.startsWith(`${normalizedBase}-`)) {
      return true;
    }

    const labelBase = this.normalizeName(
      this.extractDistributedBaseFromName(typeof container.label === "string" ? container.label : "")
    );
    if (labelBase && labelBase === normalizedBase) {
      return true;
    }

    return false;
  }

  private findDistributedContainerNodes(
    baseNodeName: string,
    labName: string
  ): ClabContainerTreeNode[] {
    const labNode = this.findLabNode(labName);
    if (!labNode?.containers) {
      return [];
    }

    const normalizedBase = this.normalizeName(baseNodeName);
    if (!normalizedBase) {
      return [];
    }

    const candidates = flattenContainers(labNode.containers).filter((container) =>
      this.containerMatchesDistributedNode(container, normalizedBase)
    );

    return sortContainersByInterfacePriority(candidates);
  }

  private getSrosInterfaceCandidates(ifaceName: string): Set<string> {
    const candidates = new Set<string>();
    const normalized = ifaceName.trim();
    if (normalized) {
      candidates.add(normalized);
    }

    const mapped = mapSrosInterfaceName(normalized);
    if (mapped) {
      candidates.add(mapped);
    }

    return candidates;
  }

  private findMatchingInterface(
    container: ClabContainerTreeNode,
    ifaceName: string
  ): ClabInterfaceTreeNode | undefined {
    const candidates = this.getSrosInterfaceCandidates(ifaceName);
    if (candidates.size === 0) {
      return undefined;
    }

    return container.interfaces.find((iface) => {
      const label =
        typeof iface.label === "string"
          ? iface.label
          : (iface.label as { label?: string } | undefined)?.label ?? "";
      return (
        candidates.has(iface.name) ||
        candidates.has(iface.alias) ||
        (label ? candidates.has(label) : false)
      );
    });
  }

  /**
   * Finds a container by name within a lab.
   */
  findContainer(containerName: string, labName: string): ContainerInfo | undefined {
    const container = this.findContainerNode(containerName, labName);
    return container ? this.toContainerInfo(container) : undefined;
  }

  /**
   * Finds an interface by name within a container.
   */
  findInterface(
    containerName: string,
    ifaceName: string,
    labName: string
  ): InterfaceInfo | undefined {
    const container = this.findContainerNode(containerName, labName);
    if (!container?.interfaces) return undefined;

    const iface = container.interfaces.find((i) => i.name === ifaceName || i.alias === ifaceName);

    return iface ? this.toInterfaceInfo(iface) : undefined;
  }

  findDistributedSrosInterface(params: {
    baseNodeName: string;
    ifaceName: string;
    fullPrefix: string;
    labName: string;
    components: unknown[];
  }): { containerName: string; ifaceData?: InterfaceInfo } | undefined {
    const candidates = this.findDistributedContainerNodes(params.baseNodeName, params.labName);
    for (const container of candidates) {
      const iface = this.findMatchingInterface(container, params.ifaceName);
      if (iface) {
        return {
          containerName: container.name,
          ifaceData: this.toInterfaceInfo(iface)
        };
      }
    }
    return undefined;
  }

  findDistributedSrosContainer(params: {
    baseNodeName: string;
    fullPrefix: string;
    labName: string;
    components: unknown[];
  }): ContainerInfo | undefined {
    const candidates = this.findDistributedContainerNodes(params.baseNodeName, params.labName);
    const preferred = candidates[0];
    return preferred ? this.toContainerInfo(preferred) : undefined;
  }

  /**
   * Gets all containers in a lab.
   */
  getContainersForLab(labName: string): ContainerInfo[] {
    const labNode = this.findLabNode(labName);
    if (!labNode?.containers) return [];

    return flattenContainers(labNode.containers).map((c) => this.toContainerInfo(c));
  }

  /**
   * Gets all interfaces for a container.
   */
  getInterfacesForContainer(containerName: string, labName: string): InterfaceInfo[] {
    const container = this.findContainerNode(containerName, labName);
    if (!container?.interfaces) return [];

    return container.interfaces.map((i) => this.toInterfaceInfo(i));
  }

  /**
   * Converts a ClabContainerTreeNode to ContainerInfo.
   */
  private toContainerInfo(container: ClabContainerTreeNode): ContainerInfo {
    // Extract label text - it may be a TreeItemLabel object or string
    const label =
      typeof container.label === "string"
        ? container.label
        : ((container.label as { label: string } | undefined)?.label ?? container.name);

    return {
      name: container.name,
      name_short: container.name_short,
      rootNodeName: container.rootNodeName,
      state: container.state,
      kind: container.kind,
      image: container.image,
      // Use the getter methods that remove CIDR mask, default to empty string
      IPv4Address: container.IPv4Address ?? "",
      IPv6Address: container.IPv6Address ?? "",
      nodeType: container.nodeType,
      nodeGroup: container.nodeGroup,
      interfaces: container.interfaces?.map((i) => this.toInterfaceInfo(i)) ?? [],
      label
    };
  }

  /**
   * Converts a ClabInterfaceTreeNode to InterfaceInfo.
   */
  private toInterfaceInfo(iface: ClabInterfaceTreeNode): InterfaceInfo {
    return {
      name: iface.name,
      alias: iface.alias,
      type: iface.type,
      mac: iface.mac,
      mtu: iface.mtu,
      ifIndex: iface.ifIndex,
      state: iface.state,
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
}
