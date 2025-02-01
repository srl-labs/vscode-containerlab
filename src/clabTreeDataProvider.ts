import * as vscode from "vscode"
import * as utils from "./utils"
import { promisify } from "util";
import path = require("path");

const execAsync = promisify(require('child_process').exec);

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
    async getChildren(element?: ClabLabTreeNode): Promise<ClabLabTreeNode[] | ClabContainerTreeNode[] | undefined> {
        // Discover labs to populate tree
        if (!element) { return this.discoverLabs(); }
        // Find containers belonging to a lab
        if (element instanceof ClabLabTreeNode) { return element.containers; }

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

        // discover labs
        const localLabs = await this.discoverLocalLabs();
        const globalLabs = await this.discoverInspectLabs();


        if (!localLabs && !globalLabs) {
            console.error("[discovery]:\tNo labs found");
            return [new ClabLabTreeNode("No labs found. Add a lab with the '+' icon.", vscode.TreeItemCollapsibleState.None, { absolute: "", relative: "" })];
        }
        else if (!globalLabs) {
            console.error("[discovery]:\tNo inspected labs found");
            return Object.values(localLabs!);
        }
        else if (!localLabs) {
            console.error("[discovery]:\tNo local labs found");
            return Object.values(globalLabs);
        }

        const labs: Record<string, ClabLabTreeNode> = { ...globalLabs };

        // add the local labs, if they aren't already discovered.
        for (const labPath in localLabs) {
            if (!labs.hasOwnProperty(labPath)) {
                labs[labPath] = localLabs[labPath];
            }
        }

        // Convert to an array then sort
        const sortedLabs = Object.values(labs).sort(
            // deployed labs go first, then compare the absolute path to the lab topology as this should be unique.
            (a, b) => {
                if (a.contextValue === "containerlabLabDeployed" && b.contextValue === "containerlabLabUndeployed") {
                    return -1; // a goes first
                }
                if (a.contextValue === "containerlabLabUndeployed" && b.contextValue === "containerlabLabDeployed") {
                    return 1; // b goes first
                }
                return a.labPath.absolute.localeCompare(b.labPath.absolute);
            }
        );

        console.log(`[discovery]:\tDiscovered ${sortedLabs.length} labs.`)

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

        const clabGlobPatterns = ['**/*.clab.yml', '**/*.clab.yaml'];
        const ignorePattern = '**/node_modules/**';

        let uris: vscode.Uri[] = [];

        // search the workspace with both glob patterns
        for (const pattern of clabGlobPatterns) {
            const found = await vscode.workspace.findFiles(pattern, ignorePattern);
            uris.push(...found);
        }

        if (!uris.length) { return undefined; }

        let labs: Record<string, ClabLabTreeNode> = {};

        uris.map(
            (uri) => {
                if (!labs[uri.fsPath]) {
                    // create a node, omitting the name, owners and 'child' containers
                    const lab = new ClabLabTreeNode(
                        path.basename(uri.fsPath),
                        vscode.TreeItemCollapsibleState.None,
                        {
                            relative: uri.fsPath,
                            absolute: utils.normalizeLabPath(uri.fsPath)
                        },
                        undefined,
                        undefined,
                        undefined,
                        "containerlabLabUndeployed"
                    )
                    lab.description = utils.getRelLabFolderPath(uri.fsPath);
                    // set the icon
                    const icon = this.getResourceUri(StateIcons.UNDEPLOYED);
                    lab.iconPath = { light: icon, dark: icon };

                    labs[uri.fsPath] = lab;
                }
            }
        )

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

        if (clabStderr) { console.error(`[stderr]: ${clabStderr}`.replace("\n", "")); }

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


        if (!inspectData) { return undefined; }

        let labs: Record<string, ClabLabTreeNode> = {};

        // 'containers' is the name of the array in the clab inspect JSON
        // which holds all the running container data/
        inspectData.containers.map(
            (container: ClabJSON) => {
                if (!labs.hasOwnProperty(container.labPath)) {
                    const label = `${container.lab_name} (${container.owner})`;

                    const labPathObj: LabPath = {
                        absolute: utils.normalizeLabPath(container.labPath),
                        relative: utils.getRelLabFolderPath(container.labPath)
                    }

                    // get all containers that belong to this lab.
                    const discoveredContainers: ClabContainerTreeNode[] = this.discoverContainers(inspectData, container.labPath);


                    /**
                     * To determine the icon, we use a counter.
                     * 
                     * When we see a discovered container as running then increment the counter.
                     * 
                     * If the counter and array length of discovered containers is equal, then we know
                     * that all containers are running.
                     * 
                     * If this is not the case, then we know to use the partial icon.
                     * 
                     * If the counter is zero, then the lab is not running -- but could be deployed.
                     */
                    let counter = 0;

                    // increment counter if container is running
                    for (const c of discoveredContainers) {
                        if (c.state === "running") { counter++; }
                    }

                    let icon: string;

                    // determine what icon to use
                    if (!counter) { icon = StateIcons.STOPPED; }
                    else if (counter == discoveredContainers.length) { icon = StateIcons.RUNNING; }
                    else { icon = StateIcons.PARTIAL; }

                    // create the node
                    const lab: ClabLabTreeNode = new ClabLabTreeNode(
                        label,
                        vscode.TreeItemCollapsibleState.Collapsed,
                        labPathObj,
                        container.lab_name,
                        container.owner,
                        discoveredContainers,
                        "containerlabLabDeployed"
                    )
                    // setting the description (text next to label) to relFolderPath.
                    lab.description = labPathObj.relative;

                    const iconUri = this.getResourceUri(icon);
                    lab.iconPath = { light: iconUri, dark: iconUri };

                    labs[container.labPath] = lab;
                }
            }
        )

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

                // create the node
                const node = new ClabContainerTreeNode(
                    container.name,
                    vscode.TreeItemCollapsibleState.None,
                    container.name,
                    container.container_id,
                    container.state,
                    container.kind,
                    container.image,
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