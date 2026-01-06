/**
 * Adapter that wraps VS Code tree data to implement ContainerDataProvider.
 * This allows the shared parser to access container data without VS Code dependencies.
 */

import type { ClabLabTreeNode, ClabContainerTreeNode, ClabInterfaceTreeNode } from '../../../treeView/common';
import type { ContainerDataProvider, ContainerInfo, InterfaceInfo } from '../../shared/parsing/types';

/**
 * Adapts VS Code tree nodes to the ContainerDataProvider interface.
 */
export class ContainerDataAdapter implements ContainerDataProvider {
  private readonly labMap: Map<string, ClabLabTreeNode>;

  constructor(clabTreeData: Record<string, ClabLabTreeNode> | undefined) {
    this.labMap = new Map();
    if (clabTreeData) {
      for (const [labName, labNode] of Object.entries(clabTreeData)) {
        this.labMap.set(labName, labNode);
      }
    }
  }

  /**
   * Finds a container tree node by name within a lab.
   */
  private findContainerNode(containerName: string, labName: string): ClabContainerTreeNode | undefined {
    const labNode = this.labMap.get(labName);
    if (!labNode?.containers) return undefined;

    return labNode.containers.find(
      (c) => c.name === containerName || c.name_short === containerName
    );
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
  findInterface(containerName: string, ifaceName: string, labName: string): InterfaceInfo | undefined {
    const container = this.findContainerNode(containerName, labName);
    if (!container?.interfaces) return undefined;

    const iface = container.interfaces.find(
      (i) => i.name === ifaceName || i.alias === ifaceName
    );

    return iface ? this.toInterfaceInfo(iface) : undefined;
  }

  /**
   * Gets all containers in a lab.
   */
  getContainersForLab(labName: string): ContainerInfo[] {
    const labNode = this.labMap.get(labName);
    if (!labNode?.containers) return [];

    return labNode.containers.map((c) => this.toContainerInfo(c));
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
    const label = typeof container.label === 'string'
      ? container.label
      : (container.label as { label: string } | undefined)?.label ?? container.name;

    return {
      name: container.name,
      name_short: container.name_short,
      state: container.state,
      kind: container.kind,
      image: container.image,
      // Use the getter methods that remove CIDR mask, default to empty string
      IPv4Address: container.IPv4Address ?? '',
      IPv6Address: container.IPv6Address ?? '',
      nodeType: container.nodeType,
      nodeGroup: container.nodeGroup,
      interfaces: container.interfaces?.map((i) => this.toInterfaceInfo(i)) ?? [],
      label,
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
      stats: iface.stats ? {
        rxBps: iface.stats.rxBps,
        txBps: iface.stats.txBps,
        rxPps: iface.stats.rxPps,
        txPps: iface.stats.txPps,
        rxBytes: iface.stats.rxBytes,
        txBytes: iface.stats.txBytes,
        rxPackets: iface.stats.rxPackets,
        txPackets: iface.stats.txPackets,
        statsIntervalSeconds: iface.stats.statsIntervalSeconds,
      } : undefined,
    };
  }
}
