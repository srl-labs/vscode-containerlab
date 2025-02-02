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
 * parsed JSON output of 'ip --json link' cmd.
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
 * Tree node lass to store information about a container interface.
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
        super(label, collapsibleState)
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
     * 
     * @param element A ClabLabTreeNode or ClabContainerTreeNode of which you want the children for
     * @returns An array of ClabLabTreeNodes or ClabContainerTreeNodes
     */
    async getChildren(element?: ClabLabTreeNode | ClabContainerTreeNode | ClabInterfaceTreeNode): Promise<any> {
        // Discover labs to populate tree
        if (!element) { return this.discoverLabs(); }
        // Find containers belonging to a lab
        if (element instanceof ClabLabTreeNode) { return element.containers; }
        if(element instanceof ClabContainerTreeNode) { return element.interfaces; }

        // Container tree nodes have no children (yet).
        return [];
    }

    /**
     * Discovers all running labs on the system and all lab files in the local dir/subdirs and sort them.
     * 
     * @returns A sorted array of all discovered labs (both locally and running - sourced from clab inspect -a)
     */
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
        // We'll take all global labs first, then
        // only add local labs if they haven't been discovered by global
        const labs: Record<string, ClabLabTreeNode> = { ...globalLabs };
      
        for (const labPath in localLabs) {
          if (!labs.hasOwnProperty(labPath)) {
            labs[labPath] = localLabs[labPath];
          }
        }
      
        // Convert the dict to an array and sort:
        // - Deployed labs first
        // - Then compare by absolute path
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
      

    /**
     * Finds all labs in local subdirectories using glob patterns of:
     * - *.clab.yaml
     * - *.clab.yml
     * 
     * @returns A record. Aboslute labPath is the key, and value is a ClabLabTreeNode object.
     */
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
          // Use normalized path as the dictionary key:
          const normPath = utils.normalizeLabPath(uri.fsPath);
          if (!labs[normPath]) {
            // Create the undeployed lab node
            const labNode = new ClabLabTreeNode(
              path.basename(uri.fsPath),
              vscode.TreeItemCollapsibleState.None,
              {
                relative: uri.fsPath,
                absolute: normPath
              },
              /* name */ undefined,
              /* owner */ undefined,
              /* containers */ undefined,
              /* contextValue */ "containerlabLabUndeployed"
            );
      
            labNode.description = utils.getRelLabFolderPath(uri.fsPath);
      
            // Set undeployed icon
            const icon = this.getResourceUri(StateIcons.UNDEPLOYED);
            labNode.iconPath = { light: icon, dark: icon };
      
            labs[normPath] = labNode;
          }
        });
      
        return labs;
      }
      

    /**
     * Performs a clab inspect -a --format JSON, parses the JSON and returns the object.
     * 
     * @returns An object comprised of the parsed JSON from clab inspect
     */
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

        if (clabStderr) { console.error(`[stderr]:\t${clabStderr}`.replace("\n", "")); }

        // if no containers, then there should be no stdout
        if (!clabStdout) { return undefined; }

        const inspectObject = JSON.parse(clabStdout);


        return inspectObject;
    }

    /**
     * Discover labs from the clab inspect data - from getInspectData()
     * and populate the lab with it's children (containers).
     * 
     * @returns Record comprised of labPath as the key and ClabLabTreeNode as value.
     */
    public async discoverInspectLabs(): Promise<Record<string, ClabLabTreeNode> | undefined> {
        console.log("[discovery]:\tDiscovering labs via inspect...");
      
        const inspectData = await this.getInspectData();
        if (!inspectData) {
          return undefined;
        }
      
        const labs: Record<string, ClabLabTreeNode> = {};
      
        // The 'containers' array in the JSON contains data for each deployed container
        inspectData.containers.forEach((container: ClabJSON) => {
          // Normalize the labPath so that it matches the local discovery's key
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
      
            // Count how many containers are running vs total
            let runningCount = 0;
            for (const c of discoveredContainers) {
              if (c.state === "running") {
                runningCount++;
              }
            }
      
            // Pick a lab icon based on whether all, some, or none are running
            let icon: string;
            if (runningCount === 0) {
              icon = StateIcons.STOPPED;
            } else if (runningCount === discoveredContainers.length) {
              icon = StateIcons.RUNNING;
            } else {
              icon = StateIcons.PARTIAL;
            }
      
            // Create the deployed lab node
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
      
            // Set the icon path
            const iconUri = this.getResourceUri(icon);
            labNode.iconPath = { light: iconUri, dark: iconUri };
      
            labs[normPath] = labNode;
          }
        });
      
        return labs;
      }
      

    /**
     * Discovers containers that are related to a lab.
     * 
     * @param inspectData JSON object of data from 'clab inspect -a --format json'
     * @param labPath The absolute path to the lab topology file. Used to identify what lab a container belongs to.
     * @returns An array of ClabContainerTreeNodes.
     */
    private discoverContainers(inspectData: any, labPath: string): ClabContainerTreeNode[] {
        console.log(`[discovery]:\tDiscovering containers for ${labPath}...`);

        // filter the data to only relevant containers
        const filtered = inspectData.containers.filter((container: ClabJSON) => container.labPath === labPath);

        let containers: ClabContainerTreeNode[] = [];

        filtered.map(
            (container: ClabJSON) => {

                let tooltip = [
                    `Container: ${container.name}`,
                    `ID: ${container.container_id}`,
                    `State: ${container.state}`,
                    `Kind: ${container.kind}`,
                    `Image: ${container.image}`
                ]

                if (!(container.ipv4_address === "N/A")) {
                    const v4Addr = container.ipv4_address.split('/')[0];
                    tooltip.push(`IPv4: ${v4Addr}`);
                }

                if (!(container.ipv6_address === "N/A")) {
                    const v6Addr = container.ipv6_address.split('/')[0];
                    tooltip.push(`IPv6: ${v6Addr}`);
                }

                let icon: string;
                // for some reason switch statement isn't working correctly here.
                if (container.state === "running") { icon = StateIcons.RUNNING; }
                else { icon = StateIcons.STOPPED; }

                // Get and sort the container interfaces.
                const interfaces: ClabInterfaceTreeNode[] = this.discoverContainerInterfaces(container.name, container.container_id).sort(
                    (a, b) => {
                        return a.name.localeCompare(b.name);
                    }
                );

                // if no interfaces, the node doesn't need to be expandable.
                const collapsible = interfaces.length > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None;

                // create the node
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
                )
                node.description = utils.titleCase(container.state);
                node.tooltip = tooltip.join("\n");
                // convert to a extension resource Uri
                const iconPath = this.getResourceUri(icon)
                node.iconPath = { light: iconPath, dark: iconPath };

                containers.push(node);
            }
        )

        return containers;
    }

    /**
     * Gets all interfaces belonging to a container by pulling JSON formatted 'ip link' data
     * in the netns of the container.
     * 
     * @param name The name/hostname of the container, which happens to be the nentns identifier.
     * @returns An array of ClabInterfaceTreeNodes.
     */
    private discoverContainerInterfaces(name: string, cID: string): ClabInterfaceTreeNode[] {
        console.log(`[discovery]:\tDiscovering interfaces for ${name}`);

        const cmd = `${utils.getSudo()} ip netns exec ${name} ip --json link show`;

        let netnsStdout;
        try {
            const stdout = execSync(cmd);
            if (!stdout) { return []; }

            netnsStdout = stdout.toString();

        } catch (err) {
            return [];
        }

        // parsed JSON obj
        const netnsObj = JSON.parse(netnsStdout);
        // console.log(netnsObj);

        let interfaces: ClabInterfaceTreeNode[] = [];

        netnsObj.map(
            (intf: IPLinkJSON) => {
                if(intf.operstate === "UNKNOWN") { return; }

                let color: vscode.ThemeColor = new vscode.ThemeColor("icon.foreground");

                let context = "containerlabInterface";

                if(intf.operstate === "UP") { 
                    color = new vscode.ThemeColor("charts.green"); 
                    context = "containerlabInterfaceUp"; 
                }
                else { color = new vscode.ThemeColor("charts.red"); }

                const node = new ClabInterfaceTreeNode(
                    intf.ifname,
                    vscode.TreeItemCollapsibleState.None,
                    name,
                    cID,
                    intf.ifname,
                    parseInt(intf.ifindex),
                    intf.mtu,
                    context
                )
                node.tooltip = `Name: ${intf.ifname}\nIndex: ${intf.ifindex}\nMTU: ${intf.mtu}`;
                node.description = intf.operstate;

                node.iconPath = new vscode.ThemeIcon("plug", color);

                interfaces.push(node);
            }
        )

        console.log(`[discovery]:\tDiscovered ${interfaces.length} interfaces for ${name}`);

        return interfaces;
    }

    /**
    * Convert the filepath of something in the ./resources dir
    * to an extension context Uri.
    *  
    * @param resource The relative path of something in the resources dir. For example: an icon would be icons/icon.svg
    * @returns A vscode.Uri of the path to the file in extension context.
    */
    private getResourceUri(resource: string) {
        return vscode.Uri.file(this.context.asAbsolutePath(path.join("resources", resource)));
    }

}