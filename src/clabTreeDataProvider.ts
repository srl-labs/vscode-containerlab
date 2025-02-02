import * as vscode from "vscode"
import * as utils from "./utils"
import { promisify } from "util";
import { exec, execSync } from "child_process";
import path = require("path");

const execAsync = promisify(exec);

// Enum to store types of icons.
enum StateIcons {
    RUNNING = "icons/running.svg",
    STOPPED = "icons/stopped.svg",
    PARTIAL = "icons/partial.svg",
    UNDEPLOYED = "icons/undeployed.svg"
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
    }
}

/**
 * Interface which stores relative and absolute lab path.
 */
export interface LabPath {
    absolute: string,
    relative: string
}

/**
 * Tree node for containers (children of ClabLabTreeNode)
 */
export class ClabContainerTreeNode extends vscode.TreeItem {
    constructor(
        label: string,
        collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly name: string,
        public readonly cID: string,
        public readonly state: string,
        public readonly kind: string,
        public readonly image: string,
        public readonly interfaces: ClabInterfaceTreeNode[],
        public readonly v4Address?: string,
        public readonly v6Address?: string,
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
 * Interface which stores fields we expect from
 * clab inspect data (in JSON format).
 */
interface ClabJSON {
    container_id: string,
    image: string,
    ipv4_address: string,
    ipv6_address: string,
    kind: string,
    lab_name: string,
    labPath: string,
    name: string,
    owner: string,
    state: string,
}

/**
 * Interface stores the fields we can expect from
 * parsed JSON output of 'ip --json link' (or 'ip link show') cmd.
 */
interface IPLinkJSON {
    flags: string[],
    group: string,
    ifindex: string,
    ifname: string,
    link_type: string,
    linkmode: string,
    mtu: number,
    operstate: string,
    qdisc: string,
    txqlen: number
}

/**
 * Tree node to store information about a container interface.
 */
export class ClabInterfaceTreeNode extends vscode.TreeItem {
    constructor(
        label: string,
        collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly nsName: string,
        public readonly cID: string,  // parent container ID
        public readonly name: string,
        public readonly index: number,
        public readonly mtu: number,
        contextValue?: string,
    ) {
        super(label, collapsibleState);
        this.contextValue = contextValue;
    }
}

export class ClabTreeDataProvider implements vscode.TreeDataProvider<ClabLabTreeNode | ClabContainerTreeNode> {
    private _onDidChangeTreeData = new vscode.EventEmitter<ClabLabTreeNode | ClabContainerTreeNode | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private context: vscode.ExtensionContext) { }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: ClabLabTreeNode | ClabContainerTreeNode): vscode.TreeItem {
        return element;
    }

    /**
     * Return tree children. If called with ClabLabTreeNode as args it will return the ClabLabTreeNode's
     * array of containers.
     */
    async getChildren(element?: ClabLabTreeNode | ClabContainerTreeNode | ClabInterfaceTreeNode): Promise<any> {
        // Discover labs to populate tree
        if (!element) { return this.discoverLabs(); }
        // Find containers belonging to a lab
        if (element instanceof ClabLabTreeNode) { return element.containers; }
        // For containers or interfaces we do not show further children
        if (element instanceof ClabContainerTreeNode) {
            return element.interfaces;
        }

        return [];
    }

    private async discoverLabs(): Promise<ClabLabTreeNode[]> {
        console.log("[discovery]:\tDiscovering labs");

        const localLabs = await this.discoverLocalLabs();     // Undeployed topologies
        const globalLabs = await this.discoverInspectLabs();  // Deployed labs from `clab inspect -a`

        if (!localLabs && !globalLabs) {
          console.error("[discovery]:\tNo labs found");
          return [
            new ClabLabTreeNode(
              "No labs found. Add a lab with the '+' icon.",
              vscode.TreeItemCollapsibleState.None,
              { absolute: "", relative: "" }
            )
          ];
        } else if (!globalLabs) {
          console.error("[discovery]:\tNo inspected labs found");
          return Object.values(localLabs!);
        } else if (!localLabs) {
          console.error("[discovery]:\tNo local labs found");
          return Object.values(globalLabs);
        }

        // Merge them into a single dictionary
        const labs: Record<string, ClabLabTreeNode> = { ...globalLabs };
        for (const labPath in localLabs) {
          if (!labs.hasOwnProperty(labPath)) {
            labs[labPath] = localLabs[labPath];
          }
        }

        // Convert the dict to an array and sort
        const sortedLabs = Object.values(labs).sort((a, b) => {
          if (a.contextValue === "containerlabLabDeployed" && b.contextValue === "containerlabLabUndeployed") {
            return -1;
          }
          if (a.contextValue === "containerlabLabUndeployed" && b.contextValue === "containerlabLabDeployed") {
            return 1;
          }
          return a.labPath.absolute.localeCompare(b.labPath.absolute);
        });

        console.log(`[discovery]:\tDiscovered ${sortedLabs.length} labs.`);
        return sortedLabs;
    }

    private async discoverLocalLabs(): Promise<Record<string, ClabLabTreeNode> | undefined> {
        console.log("[discovery]:\tDiscovering local labs...");

        const clabGlobPatterns = ["**/*.clab.yml", "**/*.clab.yaml"];
        const ignorePattern = "**/node_modules/**";

        let uris: vscode.Uri[] = [];
        for (const pattern of clabGlobPatterns) {
          const found = await vscode.workspace.findFiles(pattern, ignorePattern);
          uris.push(...found);
        }

        if (!uris.length) {
          return undefined;
        }

        const labs: Record<string, ClabLabTreeNode> = {};

        uris.forEach((uri) => {
          const normPath = utils.normalizeLabPath(uri.fsPath);
          if (!labs[normPath]) {
            const labNode = new ClabLabTreeNode(
              path.basename(uri.fsPath),
              vscode.TreeItemCollapsibleState.None,
              {
                relative: uri.fsPath,
                absolute: normPath
              },
              undefined,
              undefined,
              undefined,
              "containerlabLabUndeployed"
            );

            labNode.description = utils.getRelLabFolderPath(uri.fsPath);

            const icon = this.getResourceUri(StateIcons.UNDEPLOYED);
            labNode.iconPath = { light: icon, dark: icon };

            labs[normPath] = labNode;
          }
        });

        return labs;
    }

    public async discoverInspectLabs(): Promise<Record<string, ClabLabTreeNode> | undefined> {
        console.log("[discovery]:\tDiscovering labs via inspect...");

        const inspectData = await this.getInspectData();
        if (!inspectData) {
          return undefined;
        }

        const labs: Record<string, ClabLabTreeNode> = {};

        // The 'containers' array in the JSON contains data for each deployed container
        inspectData.containers.forEach((container: ClabJSON) => {
          const normPath = utils.normalizeLabPath(container.labPath);
          if (!labs[normPath]) {
            const label = `${container.lab_name} (${container.owner})`;

            const labPathObj: LabPath = {
              absolute: normPath,
              relative: utils.getRelLabFolderPath(container.labPath)
            };

            // Discover the containers for this lab
            const discoveredContainers: ClabContainerTreeNode[] =
              this.discoverContainers(inspectData, container.labPath);

            // Count how many are running
            let runningCount = 0;
            for (const c of discoveredContainers) {
              if (c.state === "running") {
                runningCount++;
              }
            }

            // Pick icon
            let icon: string;
            if (runningCount === 0) {
              icon = StateIcons.STOPPED;
            } else if (runningCount === discoveredContainers.length) {
              icon = StateIcons.RUNNING;
            } else {
              icon = StateIcons.PARTIAL;
            }

            const labNode = new ClabLabTreeNode(
              label,
              vscode.TreeItemCollapsibleState.Collapsed,
              labPathObj,
              container.lab_name,
              container.owner,
              discoveredContainers,
              "containerlabLabDeployed"
            );
            labNode.description = labPathObj.relative;

            const iconUri = this.getResourceUri(icon);
            labNode.iconPath = { light: iconUri, dark: iconUri };

            labs[normPath] = labNode;
          }
        });

        return labs;
    }

    private async getInspectData(): Promise<any> {
        const cmd = `${utils.getSudo()}containerlab inspect --all --format json`;

        let clabStdout;
        let clabStderr;
        try {
            const { stdout, stderr } = await execAsync(cmd);
            clabStdout = stdout;
            clabStderr = stderr;
        } catch (err) {
            throw new Error(`Could not run ${cmd}.\n${err}`);
        }

        if (clabStderr) {
          console.error(`[stderr]:\t${clabStderr}`.replace("\n", ""));
        }

        if (!clabStdout) {
          return undefined;
        }

        const inspectObject = JSON.parse(clabStdout);
        return inspectObject;
    }

    /**
     * Discover containers that belong to a specific lab path.
     */
    private discoverContainers(inspectData: any, labPath: string): ClabContainerTreeNode[] {
        console.log(`[discovery]:\tDiscovering containers for ${labPath}...`);

        // filter the data to only relevant containers
        const filtered = inspectData.containers.filter((container: ClabJSON) => container.labPath === labPath);

        let containers: ClabContainerTreeNode[] = [];

        filtered.forEach((container: ClabJSON) => {
            let tooltip = [
                `Container: ${container.name}`,
                `ID: ${container.container_id}`,
                `State: ${container.state}`,
                `Kind: ${container.kind}`,
                `Image: ${container.image}`
            ];

            if (!(container.ipv4_address === "N/A")) {
                const v4Addr = container.ipv4_address.split('/')[0];
                tooltip.push(`IPv4: ${v4Addr}`);
            }

            if (!(container.ipv6_address === "N/A")) {
                const v6Addr = container.ipv6_address.split('/')[0];
                tooltip.push(`IPv6: ${v6Addr}`);
            }

            let icon: string;
            if (container.state === "running") { icon = StateIcons.RUNNING; }
            else { icon = StateIcons.STOPPED; }

            // Gather container interfaces
            const interfaces: ClabInterfaceTreeNode[] = this.discoverContainerInterfaces(container.name, container.container_id)
              .sort((a, b) => a.name.localeCompare(b.name));

            const collapsible = interfaces.length > 0
              ? vscode.TreeItemCollapsibleState.Collapsed
              : vscode.TreeItemCollapsibleState.None;

            const node = new ClabContainerTreeNode(
              container.name,
              collapsible,
              container.name,
              container.container_id,
              container.state,
              container.kind,
              container.image,
              interfaces,
              container.ipv4_address,
              container.ipv6_address,
              "containerlabContainer"
            );

            node.description = utils.titleCase(container.state);
            node.tooltip = tooltip.join("\n");

            const iconPath = this.getResourceUri(icon);
            node.iconPath = { light: iconPath, dark: iconPath };

            containers.push(node);
        });

        return containers;
    }

    /**
     * Handle OrbStack (fallback to `docker exec`).
     */
    private discoverContainerInterfaces(name: string, cID: string): ClabInterfaceTreeNode[] {
      console.log(`[discovery]:\tDiscovering interfaces for container: ${name}`);

      // If we are on OrbStack, the netns approach may fail; fallback to docker exec
      let cmd: string;
      if (utils.isOrbstack()) {
          // On OrbStack, fallback to docker exec <container> ip link show --json
          cmd = `${utils.getSudo()}docker exec ${cID} ip --json link show`;
      } else {
          // Normal Linux approach
          cmd = `${utils.getSudo()}ip netns exec ${name} ip --json link show`;
      }

      let netnsStdout;
      try {
          const stdout = execSync(cmd);
          if (!stdout) {
              return [];
          }
          netnsStdout = stdout.toString();
      } catch (err) {
          console.error(
              `[discovery]:\tInterface detection failed for ${name} - possibly no netns or container is not running?`,
              err
          );
          return [];
      }

      let netnsObj: IPLinkJSON[];
      try {
          netnsObj = JSON.parse(netnsStdout);
      } catch (parseErr) {
          return [];
      }

      let interfaces: ClabInterfaceTreeNode[] = [];

      netnsObj.forEach((intf: IPLinkJSON) => {
          if (intf.operstate === "UNKNOWN") {
              // Skip 'lo' or transitional interfaces that report UNKNOWN
              return;
          }

          // Determine the proper icons based on the interface state.
          let context = "containerlabInterface";
          let iconLight: vscode.Uri;
          let iconDark: vscode.Uri;

          if (intf.operstate === "UP") {
              context = "containerlabInterfaceUp";
              iconLight = this.getResourceUri("icons/ethernet-port-green.svg");
              iconDark = this.getResourceUri("icons/ethernet-port-green.svg");
          } else if (intf.operstate === "DOWN") {
              context = "containerlabInterfaceDown";
              iconLight = this.getResourceUri("icons/ethernet-port-red.svg");
              iconDark = this.getResourceUri("icons/ethernet-port-red.svg");
          } else {
              iconLight = this.getResourceUri("icons/ethernet-port-light.svg");
              iconDark = this.getResourceUri("icons/ethernet-port-dark.svg");
          }

          const node = new ClabInterfaceTreeNode(
              intf.ifname,
              vscode.TreeItemCollapsibleState.None,
              name,
              cID,
              intf.ifname,
              parseInt(intf.ifindex),
              intf.mtu,
              context
          );
          node.tooltip = `Name: ${intf.ifname}\nIndex: ${intf.ifindex}\nMTU: ${intf.mtu}`;
          node.description = intf.operstate;
          node.iconPath = { light: iconLight, dark: iconDark };

          interfaces.push(node);
      });

      console.log(`[discovery]:\tDiscovered ${interfaces.length} interfaces for ${name}`);
      return interfaces;
    }


    /**
    * Convert the filepath of something in the ./resources dir
    * to an extension context Uri.
    */
    private getResourceUri(resource: string) {
        return vscode.Uri.file(this.context.asAbsolutePath(path.join("resources", resource)));
    }
}
