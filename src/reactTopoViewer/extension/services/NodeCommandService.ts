/**
 * Node command service for React TopoViewer.
 * Handles SSH, shell attach, and log commands for container nodes.
 */

import * as vscode from "vscode";

import type {
  ClabContainerTreeNode,
  ClabInterfaceTreeNode,
  ClabLabTreeNode
} from "../../../treeView/common";
import { runningLabsProvider } from "../../../globals";
import type { EndpointResult } from "../../shared/types/endpoint";

import { log } from "./logger";

/**
 * Type guard to check if a value is a valid ClabLabTreeNode.
 */
function isClabLabTreeNode(value: unknown): value is ClabLabTreeNode {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    "labPath" in obj &&
    typeof obj.labPath === "object" &&
    obj.labPath !== null &&
    "absolute" in obj.labPath
  );
}

/**
 * Creates a default container node object when no matching container is found.
 */
function createDefaultContainerNode(nodeName: string): ClabContainerTreeNode {
  return {
    label: nodeName,
    name: nodeName,
    name_short: nodeName,
    cID: nodeName,
    state: "",
    kind: "",
    image: "",
    interfaces: [],
    labPath: { absolute: "", relative: "" },
    IPv4Address: "",
    IPv6Address: ""
  } as ClabContainerTreeNode;
}

/**
 * Creates an interface object for capture command execution.
 */
function createInterfaceObject(
  nodeName: string,
  interfaceName: string,
  alias?: string
): ClabInterfaceTreeNode {
  return {
    label: interfaceName,
    parentName: nodeName,
    cID: nodeName,
    name: interfaceName,
    type: "",
    alias: alias || "",
    mac: "",
    mtu: 0,
    ifIndex: 0,
    state: ""
  } as ClabInterfaceTreeNode;
}

/**
 * Service for handling node and interface command operations.
 * Executes VS Code commands for SSH, shell attach, and logs.
 */
export class NodeCommandService {
  /**
   * Gets a container node by name from the running labs.
   */
  async getContainerNode(
    nodeName: string,
    yamlFilePath: string
  ): Promise<ClabContainerTreeNode | undefined> {
    const labsData = await runningLabsProvider?.discoverInspectLabs();
    if (!labsData || !yamlFilePath) {
      return undefined;
    }

    // Only search in the current lab
    const currentLab = Object.values(labsData).find((lab) => {
      if (!isClabLabTreeNode(lab)) {
        return false;
      }
      return lab.labPath.absolute === yamlFilePath;
    });

    if (!currentLab || !isClabLabTreeNode(currentLab)) {
      return undefined;
    }

    const containers: ClabContainerTreeNode[] = currentLab.containers ?? [];
    const directMatch = containers.find(
      (c: ClabContainerTreeNode) =>
        c.name === nodeName || c.name_short === nodeName || (c.label as string) === nodeName
    );
    if (directMatch) {
      return directMatch;
    }

    // Check for distributed SROS container
    return this.resolveDistributedSrosContainer(containers, nodeName);
  }

  /**
   * Resolves distributed SROS containers by finding the appropriate component.
   */
  private resolveDistributedSrosContainer(
    containers: ClabContainerTreeNode[],
    nodeName: string
  ): ClabContainerTreeNode | undefined {
    const normalizedTarget = nodeName.toLowerCase();
    const candidates = containers
      .filter((container) => container.kind === "nokia_srsim")
      .map((container) => ({ container, info: this.extractSrosComponentInfo(container) }))
      .filter(
        (
          entry
        ): entry is { container: ClabContainerTreeNode; info: { base: string; slot: string } } => {
          return !!entry.info && entry.info.base.toLowerCase() === normalizedTarget;
        }
      );

    if (!candidates.length) {
      return undefined;
    }

    candidates.sort((a, b) => {
      const slotOrder = this.srosSlotPriority(a.info.slot) - this.srosSlotPriority(b.info.slot);
      if (slotOrder !== 0) {
        return slotOrder;
      }
      return a.info.slot.localeCompare(b.info.slot, undefined, { sensitivity: "base" });
    });

    return candidates[0].container;
  }

  /**
   * Extracts SROS component info from container name.
   */
  private extractSrosComponentInfo(
    container: ClabContainerTreeNode
  ): { base: string; slot: string } | undefined {
    const rawLabel = (container.name_short || container.name || "").trim();
    if (!rawLabel) {
      return undefined;
    }

    const lastDash = rawLabel.lastIndexOf("-");
    if (lastDash === -1) {
      return undefined;
    }

    const base = rawLabel.slice(0, lastDash);
    const slot = rawLabel.slice(lastDash + 1);
    if (!base || !slot) {
      return undefined;
    }

    return { base, slot };
  }

  /**
   * Returns priority for SROS slot ordering (A=0, B=1, other=2).
   */
  private srosSlotPriority(slot: string): number {
    const normalized = slot.toLowerCase();
    if (normalized === "a") {
      return 0;
    }
    if (normalized === "b") {
      return 1;
    }
    return 2;
  }

  /**
   * Handles node-related endpoint commands (SSH, shell, logs).
   */
  async handleNodeEndpoint(
    endpointName: string,
    nodeName: string,
    yamlFilePath: string
  ): Promise<EndpointResult> {
    let result: unknown = null;
    let error: string | null = null;

    switch (endpointName) {
      case "clab-node-connect-ssh": {
        try {
          const containerNode =
            (await this.getContainerNode(nodeName, yamlFilePath)) ??
            createDefaultContainerNode(nodeName);
          await vscode.commands.executeCommand("containerlab.node.ssh", containerNode);
          result = `SSH connection executed for ${nodeName}`;
        } catch (innerError) {
          error = `Error executing SSH connection: ${innerError}`;
          log.error(`Error executing SSH connection: ${JSON.stringify(innerError, null, 2)}`);
        }
        break;
      }

      case "clab-node-attach-shell": {
        try {
          const node =
            (await this.getContainerNode(nodeName, yamlFilePath)) ??
            createDefaultContainerNode(nodeName);
          await vscode.commands.executeCommand("containerlab.node.attachShell", node);
          result = `Attach shell executed for ${nodeName}`;
        } catch (innerError) {
          error = `Error executing attach shell: ${innerError}`;
          log.error(`Error executing attach shell: ${JSON.stringify(innerError, null, 2)}`);
        }
        break;
      }

      case "clab-node-view-logs": {
        try {
          const node = createDefaultContainerNode(nodeName);
          await vscode.commands.executeCommand("containerlab.node.showLogs", node);
          result = `Show logs executed for ${nodeName}`;
        } catch (innerError) {
          error = `Error executing show logs: ${innerError}`;
          log.error(`Error executing show logs: ${JSON.stringify(innerError, null, 2)}`);
        }
        break;
      }

      default: {
        error = `Unknown endpoint "${endpointName}".`;
        log.error(error);
      }
    }

    return { result, error };
  }

  /**
   * Resolves the actual interface name from a logical name using the running labs data.
   */
  async resolveInterfaceName(
    nodeName: string,
    interfaceName: string,
    yamlFilePath: string
  ): Promise<string> {
    if (!runningLabsProvider) return interfaceName;
    const treeData = await runningLabsProvider.discoverInspectLabs();
    if (!treeData) return interfaceName;

    const currentLab = Object.values(treeData).find((lab) => {
      if (!isClabLabTreeNode(lab)) {
        return false;
      }
      return lab.labPath.absolute === yamlFilePath;
    });

    if (!currentLab || !isClabLabTreeNode(currentLab)) {
      return interfaceName;
    }

    const container = currentLab.containers?.find(
      (c) => c.name === nodeName || c.name_short === nodeName || (c.label as string) === nodeName
    );
    const intf = container?.interfaces?.find(
      (i) => i.name === interfaceName || i.alias === interfaceName
    );
    if (intf) return intf.name;

    return interfaceName;
  }

  /**
   * Handles interface-related endpoint commands (capture).
   */
  async handleInterfaceEndpoint(
    endpointName: string,
    payloadObj: { nodeName: string; interfaceName: string },
    yamlFilePath: string
  ): Promise<EndpointResult> {
    if (endpointName === "clab-interface-capture") {
      try {
        const { nodeName, interfaceName } = payloadObj;
        const actualInterfaceName = await this.resolveInterfaceName(
          nodeName,
          interfaceName,
          yamlFilePath
        );
        const iface = createInterfaceObject(
          nodeName,
          actualInterfaceName,
          interfaceName !== actualInterfaceName ? interfaceName : ""
        );
        await vscode.commands.executeCommand("containerlab.interface.capture", iface);
        return { result: `Capture executed for ${nodeName}/${actualInterfaceName}`, error: null };
      } catch (innerError) {
        const errorMsg = `Error executing capture: ${innerError}`;
        log.error(`Error executing capture: ${JSON.stringify(innerError, null, 2)}`);
        return { result: null, error: errorMsg };
      }
    }

    const errorMsg = `Unknown interface endpoint "${endpointName}".`;
    log.error(errorMsg);
    return { result: null, error: errorMsg };
  }
}

// Export a singleton instance
export const nodeCommandService = new NodeCommandService();
