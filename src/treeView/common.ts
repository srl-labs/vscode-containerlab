import * as vscode from "vscode"

// LabPath interface
export interface LabPath {
    absolute: string,
    relative: string
}

// Enum to store types of container state icons.
export enum CtrStateIcons {
    RUNNING = "icons/running.svg",
    STOPPED = "icons/stopped.svg",
    PARTIAL = "icons/partial.svg",
    UNDEPLOYED = "icons/undeployed.svg"
}

// Enum to store interface state icons.
export enum IntfStateIcons {
    UP = "icons/ethernet-port-green.svg",
    DOWN = "icons/ethernet-port-red.svg",
    LIGHT = "icons/ethernet-port-light.svg",
    DARK = "icons/ethernet-port-dark.svg",
}

/**
 * Interface which stores relative and absolute lab path.
 */
export interface LabPath {
    absolute: string,
    relative: string
}

/**
 * A tree node for labs
 */
export class ClabLabTreeNode extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly labPath: LabPath,
        public readonly name?: string,
        public readonly owner?: string,
        public readonly containers?: ClabContainerTreeNode[],
        contextValue?: string,
    ) {
        super(label, collapsibleState);
        this.contextValue = contextValue;
        this.iconPath = vscode.ThemeIcon.File;
    }
}

/**
 * Tree node for containers (children of ClabLabTreeNode)
 */
export class ClabContainerTreeNode extends vscode.TreeItem {
    constructor(
        label: string,
        collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly name: string,
        public readonly name_short: string,  // Added short name from clab-node-name
        public readonly cID: string,
        public readonly state: string,
        public readonly kind: string,
        public readonly image: string,
        public readonly interfaces: ClabInterfaceTreeNode[],
        public readonly labPath: LabPath,
        public readonly v4Address?: string,
        public readonly v6Address?: string,
        public readonly nodeType?: string,   // Added node type from clab-node-type
        public readonly nodeGroup?: string,  // Added node group from clab-node-group
        public readonly status?: string,
        contextValue?: string,
    ) {
        super(label, collapsibleState);
        this.contextValue = contextValue;
    }

    // Get the IPv4 address without CIDR mask
    public get IPv4Address() {
        if (!(this.v4Address === "N/A")) {
            return this.v4Address?.split('/')[0];
        } else {
            return "";
        }
    }

    // Get the IPv6 address without CIDR mask
    public get IPv6Address() {
        if (!(this.v6Address === "N/A")) {
            return this.v6Address?.split('/')[0];
        } else {
            return "";
        }
    }
}

/**
 * Tree node to store information about a container interface.
 */
export class ClabInterfaceTreeNode extends vscode.TreeItem {
    constructor(
        label: string,
        collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly parentName: string, // name of the parent container/node
        public readonly cID: string,        // parent container ID
        public readonly name: string,       // the interface name itself
        public readonly type: string,       // the interface type (veth, dummy, etc.)
        public readonly alias: string,      // the interface name alias (ie ge-0/0/x -> ethX)
        public readonly mac: string,
        public readonly mtu: number,
        public readonly ifIndex: number,
        public readonly state: string,      // Added state tracking
        contextValue?: string,
    ) {
        super(label, collapsibleState);
        this.state = state;
        this.contextValue = contextValue;
    }
}