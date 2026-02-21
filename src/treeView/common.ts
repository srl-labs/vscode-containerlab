import * as vscode from "vscode";

import type { ClabInterfaceStats } from "../types/containerlab";
import type { NetemState } from "../reactTopoViewer/shared/parsing/types";

// LabPath interface
export interface LabPath {
  absolute: string;
  relative: string;
}

/** Strip CIDR mask from an IP address, returning empty string for "N/A". */
function stripCidr(addr: string | undefined): string {
  if (addr === undefined || addr.length === 0 || addr === "N/A") {
    return "";
  }
  return addr.split("/")[0];
}

// Enum to store types of container state icons.
export const CtrStateIcons = {
  RUNNING: "icons/running.svg",
  STOPPED: "icons/stopped.svg",
  PARTIAL: "icons/partial.svg",
  UNDEPLOYED: "icons/undeployed.svg",
} as const;

// Enum to store interface state icons.
export const IntfStateIcons = {
  UP: "icons/ethernet-port-green.svg",
  DOWN: "icons/ethernet-port-red.svg",
  LIGHT: "icons/ethernet-port-light.svg",
  DARK: "icons/ethernet-port-dark.svg",
} as const;

/**
 * A tree node for labs
 */
export class ClabLabTreeNode extends vscode.TreeItem {
  public readonly labPath: LabPath;
  public readonly name?: string;
  public readonly owner?: string;
  public containers?: (ClabContainerTreeNode | ClabContainerGroupTreeNode)[];
  public favorite: boolean;
  public sshxLink?: string;
  public sshxNode?: ClabSshxLinkTreeNode;
  public gottyLink?: string;
  public gottyNode?: ClabGottyLinkTreeNode;

  constructor(
    public override label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    labPath: LabPath,
    name?: string,
    owner?: string,
    containers?: (ClabContainerTreeNode | ClabContainerGroupTreeNode)[],
    contextValue?: string,
    favorite: boolean = false,
    sshxLink?: string,
    gottyLink?: string
  ) {
    super(label, collapsibleState);
    this.labPath = labPath;
    this.name = name;
    this.owner = owner;
    this.containers = containers;
    this.contextValue = contextValue;
    this.favorite = favorite;
    this.sshxLink = sshxLink;
    this.gottyLink = gottyLink;
    this.iconPath = favorite
      ? new vscode.ThemeIcon("star-full", new vscode.ThemeColor("charts.yellow"))
      : vscode.ThemeIcon.File;

    // Set stable ID to help VS Code track this item across refreshes
    this.id = `lab:${labPath.absolute}`;
  }
}

export class ClabFolderTreeNode extends vscode.TreeItem {
  public readonly fullPath: string;
  constructor(label: string, fullPath: string) {
    super(label, vscode.TreeItemCollapsibleState.Collapsed);
    this.fullPath = fullPath;
    this.contextValue = "containerlabFolder";
    this.iconPath = vscode.ThemeIcon.Folder;
    this.id = `folder:${fullPath}`;
  }
}

/**
 * Tree node for containers (children of ClabLabTreeNode)
 */
export class ClabContainerTreeNode extends vscode.TreeItem {
  public readonly name: string;
  public readonly name_short: string; // Added short name from clab-node-name
  public cID: string;
  public state: string;
  public kind: string;
  public image: string;
  public interfaces: ClabInterfaceTreeNode[];
  public readonly labPath: LabPath;
  public v4Address?: string;
  public v6Address?: string;
  public nodeType?: string; // Added node type from clab-node-type
  public nodeGroup?: string; // Added node group from clab-node-group
  public rootNodeName?: string; // clab-root-node-name — set if this is a sub-container
  public status?: string;

  // eslint-disable-next-line max-params -- TreeItem subclass with many optional properties
  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    name: string,
    name_short: string,
    cID: string,
    state: string,
    kind: string,
    image: string,
    interfaces: ClabInterfaceTreeNode[],
    labPath: LabPath,
    v4Address?: string,
    v6Address?: string,
    nodeType?: string, // Added node type from clab-node-type
    nodeGroup?: string, // Added node group from clab-node-group
    status?: string,
    contextValue?: string
  ) {
    super(label, collapsibleState);
    this.name = name;
    this.name_short = name_short;
    this.cID = cID;
    this.state = state;
    this.kind = kind;
    this.image = image;
    this.interfaces = interfaces;
    this.labPath = labPath;
    this.v4Address = v4Address;
    this.v6Address = v6Address;
    this.nodeType = nodeType;
    this.nodeGroup = nodeGroup;
    this.status = status;
    this.contextValue = contextValue;

    // Set stable ID to help VS Code track this item across refreshes
    this.id = `container:${labPath.absolute}:${name}`;
  }

  public get IPv4Address() {
    return stripCidr(this.v4Address);
  }

  public get IPv6Address() {
    return stripCidr(this.v6Address);
  }
}

/**
 * Virtual group tree node for root nodes that have sub-containers (e.g., Nokia SRSIM).
 * Root nodes do not have their own container — they are virtual parents.
 * Inherits IP details and identity from the primary (0th) sub-container.
 */
export class ClabContainerGroupTreeNode extends vscode.TreeItem {
  public readonly rootNodeName: string;
  public readonly labPath: LabPath;
  public children: ClabContainerTreeNode[];

  // Properties inherited from the primary (0th) sub-container
  public name: string = "";
  public name_short: string = "";
  public cID: string = "";
  public state: string = "";
  public kind: string = "";
  public image: string = "";
  public v4Address?: string;
  public v6Address?: string;
  public nodeType?: string;
  public nodeGroup?: string;
  public status?: string;

  constructor(rootNodeName: string, labPath: LabPath, children: ClabContainerTreeNode[]) {
    super(rootNodeName, vscode.TreeItemCollapsibleState.Collapsed);
    this.rootNodeName = rootNodeName;
    this.labPath = labPath;
    this.children = children;
    this.contextValue = "containerlabContainerGroup";
    this.iconPath = new vscode.ThemeIcon("symbol-class");
    this.id = `containerGroup:${labPath.absolute}:${rootNodeName}`;
  }

  public get IPv4Address() {
    return stripCidr(this.v4Address);
  }

  public get IPv6Address() {
    return stripCidr(this.v6Address);
  }
}

/**
 * Tree node to store information about a container interface.
 */
export class ClabInterfaceTreeNode extends vscode.TreeItem {
  public readonly parentName: string; // name of the parent container/node
  public cID: string; // parent container ID
  public readonly name: string; // the interface name itself
  public type: string; // the interface type (veth, dummy, etc.)
  public alias: string; // the interface name alias (ie ge-0/0/x -> ethX)
  public mac: string;
  public mtu: number;
  public readonly ifIndex: number;
  public state: string; // Added state tracking
  public stats?: ClabInterfaceStats;
  public netemState?: NetemState;

  // eslint-disable-next-line max-params -- TreeItem subclass with many interface properties
  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    parentName: string,
    cID: string,
    name: string,
    type: string,
    alias: string,
    mac: string,
    mtu: number,
    ifIndex: number,
    state: string,
    contextValue?: string,
    stats?: ClabInterfaceStats,
    netemState?: NetemState
  ) {
    super(label, collapsibleState);
    this.parentName = parentName;
    this.cID = cID;
    this.name = name;
    this.type = type;
    this.alias = alias;
    this.mac = mac;
    this.mtu = mtu;
    this.ifIndex = ifIndex;
    this.state = state;
    this.contextValue = contextValue;
    this.stats = stats;
    this.netemState = netemState;

    // Set stable ID to help VS Code track this item across refreshes
    this.id = `interface:${cID}:${name}`;
  }
}

export class ClabSshxLinkTreeNode extends vscode.TreeItem {
  public readonly labName: string;
  public readonly link: string;
  constructor(labName: string, link: string) {
    super("Shared Terminal", vscode.TreeItemCollapsibleState.None);
    this.labName = labName;
    this.link = link;
    this.contextValue = "containerlabSSHXLink";
    this.tooltip = link;
    this.iconPath = new vscode.ThemeIcon("link-external");
  }
}

export class ClabGottyLinkTreeNode extends vscode.TreeItem {
  public readonly labName: string;
  public readonly link: string;
  constructor(labName: string, link: string) {
    super("Web Terminal", vscode.TreeItemCollapsibleState.None);
    this.labName = labName;
    this.link = link;
    this.contextValue = "containerlabGottyLink";
    this.tooltip = link;
    this.iconPath = new vscode.ThemeIcon("browser");
  }
}

/** -------------
 * Interfaces
 * -------------*/

/**
 * Interface for detailed container info from `containerlab inspect --all --details`
 */
/**
 * Interface for detailed container info from `containerlab inspect --all --details`
 */
export interface ClabDetailedJSON {
  Names: string[];
  ID: string;
  ShortID: string;
  Image: string;
  State: string;
  Status: string;
  StartedAt?: number;
  Labels: {
    "clab-node-kind": string;
    "clab-node-lab-dir": string;
    "clab-node-longname": string;
    "clab-node-name": string;
    "clab-owner": string;
    "clab-topo-file": string;
    [key: string]: string | undefined;
    "clab-node-type"?: string;
    "clab-node-group"?: string;
    containerlab?: string; // lab name
  };
  NetworkSettings: {
    IPv4addr?: string;
    IPv4pLen?: number;
    IPv4Gw?: string;
    IPv6addr?: string;
    IPv6pLen?: number;
    IPv6Gw?: string;
  };
  Mounts: Array<{
    Source: string;
    Destination: string;
  }>;
  Ports: Array<{ port: string | number; protocol: string }>;
  Pid?: number;
  NetworkName?: string; // management network name (>=0.68.0)
}

/**
 * Interface which stores fields from simple clab inspect format
 * (used for backward compatibility and as a standard format)
 */
export interface ClabJSON {
  container_id: string;
  image: string;
  ipv4_address: string;
  ipv6_address: string;
  kind: string;
  lab_name: string;
  labPath: string; // Path as provided by containerlab (might be relative)
  absLabPath?: string; // Absolute path (present in newer versions >= 0.68.0)
  name: string; // Always use the long name if CLAB PREFIX Provided (e.g., clab-labname-node)
  name_short?: string; // Short name without lab prefix
  owner: string;
  state: string;
  status?: string; // Also add the optional status field
  node_type?: string; // Node type (e.g. ixrd3, srlinux, etc.)
  node_group?: string; // Node group
  root_node_name?: string; // Root node short name (for sub-containers)
  network_name?: string; // Management network name
  startedAt?: number;
}

/**
 * Flatten a mixed list of container and group nodes into only ClabContainerTreeNode entries.
 */
export function flattenContainers(
  nodes: (ClabContainerTreeNode | ClabContainerGroupTreeNode)[] | undefined
): ClabContainerTreeNode[] {
  if (!nodes) return [];
  const result: ClabContainerTreeNode[] = [];
  for (const node of nodes) {
    if (node instanceof ClabContainerGroupTreeNode) {
      result.push(...node.children);
    } else {
      result.push(node);
    }
  }
  return result;
}
