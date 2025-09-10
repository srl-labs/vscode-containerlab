import * as vscode from "vscode"
import * as utils from "../helpers/utils"
import * as c from "./common";
import * as ins from "./inspector"
import { FilterUtils } from "../helpers/filterUtils";

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import path = require("path");
import { hideNonOwnedLabsState, runningTreeView, username, favoriteLabs, sshxSessions, refreshSshxSessions, gottySessions, refreshGottySessions } from "../extension";
// Mode switching imports removed - now handled by command completion callbacks
// import { getCurrentTopoViewer, setCurrentTopoViewer } from "../commands/graph";

/**
 * Interface corresponding to fields in the
 *  the JSON output of 'clab ins interfaces'
 */
interface ClabInsIntfJSON {
    name: string,
    interfaces: [
        {
            name: string,
            type: string,
            state: string,
            alias: string,
            mac: string,
            mtu: number,
            ifindex: number,
        }
    ]
}

type RunningTreeNode = c.ClabLabTreeNode | c.ClabContainerTreeNode | c.ClabInterfaceTreeNode;

export class RunningLabTreeDataProvider implements vscode.TreeDataProvider<c.ClabLabTreeNode | c.ClabContainerTreeNode> {
    private _onDidChangeTreeData = new vscode.EventEmitter<void | c.ClabLabTreeNode | c.ClabContainerTreeNode | null | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private treeItems: c.ClabLabTreeNode[] = [];
    private treeFilter: string = '';
    private labNodeCache: Map<string, c.ClabLabTreeNode> = new Map();


    private containerInterfacesCache: Map<string, {
        state: string,
        timestamp: number,
        interfaces: c.ClabInterfaceTreeNode[]
    }> = new Map();

    // Cache for labs: both local and inspect (running) labs.
    private labsCache: {
        inspect: { data: Record<string, c.ClabLabTreeNode> | undefined, timestamp: number, rawDataHash?: string } | null,
    } = { inspect: null };

    private refreshInterval: number = 10000; // Default to 10 seconds
    private cacheTTL: number = 30000; // Default to 30 seconds, will be overridden

    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        // Get the refresh interval from configuration
        const config = vscode.workspace.getConfiguration('containerlab');
        this.refreshInterval = config.get<number>('refreshInterval', 10000);

        let calculatedTTL = this.refreshInterval - 1000; // e.g., 1 second less
        if (this.refreshInterval <= 5000) { // If refreshInterval is very short, make TTL even shorter or equal
            calculatedTTL = this.refreshInterval * 0.8;
        }
        this.cacheTTL = Math.max(calculatedTTL, 4000); // Ensure a minimum reasonable TTL (e.g., 4s to avoid being too aggressive)

        this.startCacheJanitor();
    }

    async refresh(element?: c.ClabLabTreeNode | c.ClabContainerTreeNode) {
        if (!element) {
            // Full refresh - update inspect data and clear interface cache
            this.containerInterfacesCache.clear();
            // Don't clear labs cache - let the hash comparison handle it

            await ins.update();
            await this.discoverLabs();
            this._onDidChangeTreeData.fire();

            // Also refresh the topology viewer if it's open
            await this.refreshTopoViewerIfOpen();
        } else {
            // Selective refresh - only refresh this element
            this._onDidChangeTreeData.fire(element);

            // Also refresh the topology viewer if it's open
            await this.refreshTopoViewerIfOpen();
        }
    }

    // a soft refresh will check for changes and only update if needed
    async softRefresh(element?: c.ClabLabTreeNode | c.ClabContainerTreeNode) {
        if (!element) {
            // Check if the inspect data has actually changed
            const previousLabCount = this.treeItems.length;
            const previousLabKeys = new Set(this.treeItems.map(lab => lab.labPath.absolute));

            // Discover labs without clearing caches first
            await this.discoverLabs();

            // Check if anything changed
            const currentLabCount = this.treeItems.length;
            const currentLabKeys = new Set(this.treeItems.map(lab => lab.labPath.absolute));

            // Only fire change event if labs were added/removed
            const labsChanged = previousLabCount !== currentLabCount ||
                ![...previousLabKeys].every(key => currentLabKeys.has(key)) ||
                ![...currentLabKeys].every(key => previousLabKeys.has(key));

            if (labsChanged) {
                console.log("[RunningLabTreeDataProvider]:\tLabs changed, refreshing tree view");
                this._onDidChangeTreeData.fire();
            }

            // Always refresh the topology viewer to catch interface state changes
            await this.refreshTopoViewerIfOpen();
        } else {
            // Selective refresh - only refresh this element
            this._onDidChangeTreeData.fire(element);

            // Also refresh the topology viewer if it's open
            await this.refreshTopoViewerIfOpen();
        }
    }

    async refreshWithoutDiscovery(element?: c.ClabLabTreeNode | c.ClabContainerTreeNode) {
        if (!element) {
            this._onDidChangeTreeData.fire();
        } else {
            // Selective refresh - only refresh this element
            this._onDidChangeTreeData.fire(element);
        }
    }

    setTreeFilter(filterText: string) {
        this.treeFilter = filterText;
        if (runningTreeView) {
            runningTreeView.message = `Filter: ${filterText}`;
        }
        this.refreshWithoutDiscovery();
    }

    clearTreeFilter() {
        this.treeFilter = '';
        if (runningTreeView) {
            runningTreeView.message = undefined;
        }
        this.refreshWithoutDiscovery();
    }

    /**
     * Refresh the topology viewer if it's currently open.
     * This ensures the viewer stays in sync with tree data changes.
     * NOTE: This no longer performs automatic mode switching - mode changes
     * are only triggered by successful deploy/destroy command completion.
     */
    private async refreshTopoViewerIfOpen(): Promise<void> {
        // DISABLED: Automatic mode switching based on deployment state
        // Mode switching is now handled exclusively by command completion callbacks
        // in deploy.ts, destroy.ts, and redeploy.ts
        return;
    }

    hasChanges(): boolean {
        const now = Date.now();

        // Check for expired caches
        let anyInterfaceExpired = false;
        for (const value of this.containerInterfacesCache.values()) {
            if (now - value.timestamp > this.cacheTTL) {
                anyInterfaceExpired = true;
                break;
            }
        }

        const labsExpired = !!(this.labsCache.inspect && (now - this.labsCache.inspect.timestamp >= this.cacheTTL));
        return anyInterfaceExpired || labsExpired;
    }

    getTreeItem(element: RunningTreeNode): vscode.TreeItem {
        return element;
    }

    /**
     * Return tree children. If called with c.ClabLabTreeNode as args it will return the c.ClabLabTreeNode's
     * array of containers.
     */
    async getChildren(element?: RunningTreeNode): Promise<any> {
        if (!this.treeItems.length) await this.discoverLabs();

        if (!element) return this.getRootChildren();
        if (element instanceof c.ClabLabTreeNode) return this.getLabChildren(element);
        if (element instanceof c.ClabContainerTreeNode) return this.getContainerChildren(element);
        return undefined;
    }

    private getRootChildren(): RunningTreeNode[] {
        const labs = hideNonOwnedLabsState
            ? this.treeItems.filter(labNode => labNode.owner == username)
            : this.treeItems;

        const filtered = this.treeFilter
            ? this.filterLabs(labs, this.treeFilter)
            : labs;

        vscode.commands.executeCommand('setContext', 'runningLabsEmpty', filtered.length == 0);
        return filtered;
    }

    private filterLabs(labs: c.ClabLabTreeNode[], text: string): c.ClabLabTreeNode[] {
        const filter = FilterUtils.createFilter(text);
        return labs.filter(lab => this.labMatchesFilter(lab, filter));
    }

    private labMatchesFilter(lab: c.ClabLabTreeNode, filter: ReturnType<typeof FilterUtils.createFilter>): boolean {
        if (filter(String(lab.label))) return true;
        const containers = lab.containers || [];
        return containers.some(cn => filter(String(cn.label)) ||
            (cn as c.ClabContainerTreeNode).interfaces?.some(it => filter(String(it.label))));
    }

    private getLabChildren(element: c.ClabLabTreeNode) {
        let containers: (c.ClabContainerTreeNode | c.ClabSshxLinkTreeNode | c.ClabGottyLinkTreeNode)[] = element.containers || [];
        if (element.sshxNode) containers = [element.sshxNode, ...containers];
        if (element.gottyNode) containers = [element.gottyNode, ...containers];
        if (!this.treeFilter) return containers;

        const filter = FilterUtils.createFilter(this.treeFilter);
        const labMatch = filter(String(element.label));
        if (labMatch) return containers;

        return containers.filter(cn => this.containerMatchesFilter(cn as any, filter));
    }

    private containerMatchesFilter(cn: c.ClabContainerTreeNode, filter: ReturnType<typeof FilterUtils.createFilter>): boolean {
        if (filter(String(cn.label))) return true; // Keep entire container with all interfaces
        const ifaces = cn.interfaces || [];
        return ifaces.some(it => filter(String(it.label)));
    }

    private getContainerChildren(element: c.ClabContainerTreeNode) {
        let interfaces = element.interfaces;
        if (!this.treeFilter) return interfaces;
        const filter = FilterUtils.createFilter(this.treeFilter);
        const containerMatches = filter(String(element.label));
        return containerMatches ? interfaces : interfaces.filter(it => filter(String(it.label)));
    }

    private async discoverLabs() {
        console.log("[RunningLabTreeDataProvider]:\tDiscovering labs");

        const globalLabs = await this.discoverInspectLabs();  // Deployed labs from `clab inspect -a`

        // --- Combine local and global labs ---
        // Initialize with global labs (deployed)
        const labs: Record<string, c.ClabLabTreeNode> = globalLabs ? { ...globalLabs } : {};

        // Convert the dict to an array and sort by:
        // 1. Deployed labs first
        // 2. Then by absolute path
        const sortedLabs = Object.values(labs).sort((a, b) => {
            const isADeployed = a.contextValue?.startsWith("containerlabLabDeployed");
            const isBDeployed = b.contextValue?.startsWith("containerlabLabDeployed");

            if (isADeployed && !isBDeployed) {
                return -1; // a (deployed) comes before b (undeployed)
            }
            if (!isADeployed && isBDeployed) {
                return 1; // b (deployed) comes before a (undeployed)
            }
            // If same deployment status, sort by path
            const aPath = a.labPath?.absolute ?? '';
            const bPath = b.labPath?.absolute ?? '';
            return aPath.localeCompare(bPath);
        });

        console.log(`[RunningLabTreeDataProvider]:\tDiscovered ${sortedLabs.length} labs.`);

        const newCache: Map<string, c.ClabLabTreeNode> = new Map();

        sortedLabs.forEach(lab => {
            const key = lab.labPath.absolute;
            const existing = this.labNodeCache.get(key);

            if (existing) {
                (existing as any).label = lab.label;
                existing.description = lab.description;
                existing.iconPath = lab.iconPath;
                existing.contextValue = lab.contextValue;
                (existing as any).containers = lab.containers;
                existing.sshxLink = lab.sshxLink;
                existing.sshxNode = lab.sshxNode;
                existing.gottyLink = lab.gottyLink;
                existing.gottyNode = lab.gottyNode;
                newCache.set(key, existing);
            } else {
                newCache.set(key, lab);
            }
        });

        this.labNodeCache = newCache;
        this.treeItems = Array.from(newCache.values());
    }

    /**
     * Convert detailed container data to the simpler format used by the existing code.
     * This maintains backward compatibility while adding new fields.
     */
    private convertDetailedToSimpleFormat(detailedData: Record<string, c.ClabDetailedJSON[]>): Record<string, c.ClabJSON[]> {
        const result: Record<string, c.ClabJSON[]> = {};

        // Process each lab
        for (const labName in detailedData) {
            if (!Array.isArray(detailedData[labName])) continue;

            result[labName] = detailedData[labName].map(container => {
                // Construct IPv4 and IPv6 addresses with prefix length
                let ipv4Address = "N/A";
                if (container.NetworkSettings.IPv4addr && container.NetworkSettings.IPv4pLen !== undefined) {
                    ipv4Address = `${container.NetworkSettings.IPv4addr}/${container.NetworkSettings.IPv4pLen}`;
                }

                let ipv6Address = "N/A";
                if (container.NetworkSettings.IPv6addr && container.NetworkSettings.IPv6pLen !== undefined) {
                    ipv6Address = `${container.NetworkSettings.IPv6addr}/${container.NetworkSettings.IPv6pLen}`;
                }

                // Extract name from Names array or Labels
                const name = container.Names[0] || container.Labels['clab-node-longname'];
                // Always get absolute lab path
                const absLabPath = container.Labels['clab-topo-file'];

                // Convert to the simpler format
                return {
                    container_id: container.ShortID,
                    image: container.Image,
                    ipv4_address: ipv4Address,
                    ipv6_address: ipv6Address,
                    kind: container.Labels['clab-node-kind'],
                    lab_name: labName,
                    labPath: absLabPath,
                    absLabPath: absLabPath,
                    name: name,
                    name_short: container.Labels['clab-node-name'],
                    owner: container.Labels['clab-owner'],
                    state: container.State,
                    status: container.Status,
                    node_type: container.Labels['clab-node-type'] || undefined,
                    node_group: container.Labels['clab-node-group'] || undefined,
                    network_name: container.NetworkName || undefined
                };
            });
        }

        return result;
    }

    private createDataHash(data: any): string {
        // Create a simple hash based on lab names and container counts
        if (!data) return 'empty';

        if (Array.isArray(data)) {
            // Old format: count of containers
            return `array-${data.length}`;
        } else if (typeof data === 'object') {
            // New format: lab names and container counts
            const labInfo = Object.keys(data).sort().map(labName =>
                `${labName}:${Array.isArray(data[labName]) ? data[labName].length : 0}`
            ).join(',');
            return `object-${labInfo}`;
        }
        return 'unknown';
    }

    public async discoverInspectLabs(): Promise<Record<string, c.ClabLabTreeNode> | undefined> {
        console.log("[RunningLabTreeDataProvider]:\tDiscovering labs via inspect...");

        const inspectData = await this.getInspectData(); // This now properly handles both formats
        const currentDataHash = this.createDataHash(inspectData);

        // Check if we have cached data and if the raw data hasn't changed
        const cached = this.getCachedInspectIfFresh(currentDataHash);
        if (cached) return cached;

        if (!inspectData) {
            this.updateBadge(0);
            this.labsCache.inspect = { data: undefined, timestamp: Date.now(), rawDataHash: currentDataHash };
            return undefined;
        }

        // --- Normalize inspectData into a flat list of containers ---
        const allContainers = this.normalizeInspectData(inspectData);
        if (!allContainers) {
            this.updateBadge(0);
            this.labsCache.inspect = { data: undefined, timestamp: Date.now(), rawDataHash: currentDataHash };
            return undefined;
        }

        // If after normalization, we have no containers, return undefined
        if (allContainers.length === 0) {
            this.updateBadge(0);
            this.labsCache.inspect = { data: undefined, timestamp: Date.now(), rawDataHash: currentDataHash };
            return undefined;
        }

        await this.refreshSessionLists(allContainers);

        // --- Process the flat allContainers list ---
        const labs = this.buildLabsFromContainers(allContainers);

        this.updateBadge(Object.keys(labs).length);

        this.labsCache.inspect = { data: labs, timestamp: Date.now(), rawDataHash: currentDataHash };
        return labs;
    }

    private getCachedInspectIfFresh(currentDataHash: string) {
        if (this.labsCache.inspect &&
            this.labsCache.inspect.rawDataHash === currentDataHash &&
            (Date.now() - this.labsCache.inspect.timestamp < this.cacheTTL)) {
            console.log("[RunningLabTreeDataProvider]:\tUsing cached labs (data unchanged)");
            return this.labsCache.inspect.data;
        }
        return undefined;
    }

    private normalizeInspectData(inspectData: any): c.ClabJSON[] | undefined {
        let allContainers: c.ClabJSON[] = [];
        if (Array.isArray(inspectData)) {
            console.log("[RunningLabTreeDataProvider]:\tDetected old inspect format (flat container list).");
            return inspectData;
        }
        if (inspectData?.containers && Array.isArray(inspectData.containers)) {
            console.log("[RunningLabTreeDataProvider]:\tDetected old inspect format (flat container list with 'containers' key).");
            return inspectData.containers;
        }
        if (typeof inspectData === 'object' && Object.keys(inspectData).length > 0) {
            console.log("[RunningLabTreeDataProvider]:\tDetected new inspect format (grouped by lab).");
            for (const labName in inspectData) {
                if (Array.isArray(inspectData[labName])) allContainers.push(...inspectData[labName]);
            }
            return allContainers;
        }
        console.log("[RunningLabTreeDataProvider]:\tInspect data is empty or in an unexpected format.");
        return undefined;
    }

    private async refreshSessionLists(allContainers: c.ClabJSON[]) {
        const sshxLabs = new Set(allContainers.filter(c => (c.name || '').includes('sshx')).map(c => c.lab_name));
        const missingSessions = Array.from(sshxLabs).filter(lab => !sshxSessions.has(lab));
        if (missingSessions.length > 0) await refreshSshxSessions();

        const gottyLabs = new Set(allContainers.filter(c => (c.name || '').includes('gotty')).map(c => c.lab_name));
        const missingGottySessions = Array.from(gottyLabs).filter(lab => !gottySessions.has(lab));
        if (missingGottySessions.length > 0) await refreshGottySessions();
    }

    private buildLabsFromContainers(allContainers: c.ClabJSON[]): Record<string, c.ClabLabTreeNode> {
        const labs: Record<string, c.ClabLabTreeNode> = {};
        allContainers.forEach((container: c.ClabJSON) => {
            const normPath = container.absLabPath || utils.normalizeLabPath(container.labPath);
            if (!labs[normPath]) labs[normPath] = this.createLabNode(container, allContainers, normPath);
        });
        return labs;
    }

    private createLabNode(container: c.ClabJSON, allContainers: c.ClabJSON[], normPath: string): c.ClabLabTreeNode {
        const label = `${container.lab_name} (${container.owner})`;
        const labPathObj: c.LabPath = {
            absolute: normPath,
            relative: utils.getRelativeFolderPath(normPath)
        };
        const containersForThisLab = allContainers.filter(
            (c: c.ClabJSON) => (c.absLabPath || utils.normalizeLabPath(c.labPath)) === normPath
        );
        const discoveredContainers = this.discoverContainers(containersForThisLab, labPathObj.absolute);
        const { running, unhealthy } = this.getContainerHealth(discoveredContainers);
        const icon = this.determineIcon(discoveredContainers.length, running, unhealthy);
        const isFav = favoriteLabs.has(normPath);
        const contextVal = isFav ? "containerlabLabDeployedFavorite" : "containerlabLabDeployed";
        const sshxLink = sshxSessions.get(container.lab_name);
        const gottyLink = gottySessions.get(container.lab_name);
        let labLabel = label;
        if (sshxLink || gottyLink) {
            labLabel = `🔗 ${label}`;
        }
        const labNode = new c.ClabLabTreeNode(
            labLabel,
            vscode.TreeItemCollapsibleState.Collapsed,
            labPathObj,
            container.lab_name,
            container.owner,
            discoveredContainers,
            contextVal,
            isFav,
            sshxLink,
            gottyLink
        );
        this.decorateSharing(labNode, labPathObj.relative, sshxLink, gottyLink);
        const iconUri = this.getResourceUri(icon);
        labNode.iconPath = { light: iconUri, dark: iconUri };
        return labNode;
    }

    private getContainerHealth(containers: c.ClabContainerTreeNode[]): { running: number; unhealthy: number } {
        let running = 0;
        let unhealthy = 0;
        for (const ctr of containers) {
            if (ctr.state === "running") {
                running++;
                const status = ctr.status?.toLowerCase() || "";
                if (status.includes("health: starting") || status.includes("unhealthy")) {
                    unhealthy++;
                }
            }
        }
        return { running, unhealthy };
    }

    private determineIcon(total: number, running: number, unhealthy: number): string {
        if (running === 0 && total > 0) {
            return c.CtrStateIcons.STOPPED;
        }
        if (running === total && unhealthy === 0) {
            return c.CtrStateIcons.RUNNING;
        }
        if (running === total && unhealthy > 0) {
            return c.CtrStateIcons.PARTIAL;
        }
        if (total > 0) {
            return c.CtrStateIcons.PARTIAL;
        }
        return c.CtrStateIcons.STOPPED;
    }

    private decorateSharing(labNode: c.ClabLabTreeNode, relativePath: string, sshxLink?: string, gottyLink?: string) {
        if (sshxLink) {
            labNode.sshxNode = new c.ClabSshxLinkTreeNode(labNode.name!, sshxLink);
            labNode.description = `${relativePath} (Shared)`;
            labNode.command = {
                command: 'containerlab.lab.sshx.copyLink',
                title: 'Copy SSHX link',
                arguments: [sshxLink]
            };
        } else if (gottyLink) {
            labNode.gottyNode = new c.ClabGottyLinkTreeNode(labNode.name!, gottyLink);
            labNode.description = `${relativePath} (Shared)`;
            labNode.command = {
                command: 'containerlab.lab.gotty.copyLink',
                title: 'Copy GoTTY link',
                arguments: [gottyLink]
            };
        } else {
            labNode.description = relativePath;
        }
    }

    private async getInspectData(): Promise<any> {

        const parsedData = ins.rawInspectData;

        // Determine the format of the returned data
        // Check if it's an array (old flat format) or an object with lab keys (new grouped format)
        const isOldFlatFormat = Array.isArray(parsedData);
        const isNewGroupedFormat = !isOldFlatFormat &&
            typeof parsedData === 'object' &&
            Object.keys(parsedData).length > 0 &&
            Object.values(parsedData).some(val => Array.isArray(val));

        // Check if we have the detailed format (contains Labels property)
        let hasDetailedFormat = false;

        if (isOldFlatFormat) {
            // Check first item in array for Labels
            hasDetailedFormat = parsedData.length > 0 && 'Labels' in parsedData[0];
        } else if (isNewGroupedFormat) {
            // Check first container in first lab
            for (const labName in parsedData) {
                if (Array.isArray(parsedData[labName]) &&
                    parsedData[labName].length > 0 &&
                    'Labels' in parsedData[labName][0]) {
                    hasDetailedFormat = true;
                    break;
                }
            }
        }

        // If we have detailed format, convert it to the standard format
        if (hasDetailedFormat) {
            console.log("[RunningLabTreeDataProvider]:\tConverting detailed format to standard format");

            if (isOldFlatFormat) {
                // Convert flat array to lab-grouped format first
                const grouped = this.convertFlatToGroupedFormat(parsedData);
                return this.convertDetailedToSimpleFormat(grouped);
            } else {
                // Already lab-grouped, just convert the format
                return this.convertDetailedToSimpleFormat(parsedData);
            }
        }

        // Return as-is if not detailed format (might already be in simple format)
        return parsedData;
    }

    /**
     * Convert a flat array of containers to a lab-grouped format
     */
    private convertFlatToGroupedFormat(flatContainers: any[]): Record<string, any[]> {
        const result: Record<string, any[]> = {};

        flatContainers.forEach(container => {
            // Extract lab name from the container
            const labName = container.Labels['containerlab'] || "unknown";

            // Initialize array for this lab if it doesn't exist
            if (!result[labName]) {
                result[labName] = [];
            }

            // Add container to the lab group
            result[labName].push(container);
        });

        return result;
    }

    private buildTooltipParts(container: c.ClabJSON): string[] {
        const tooltipParts = [
            `Container: ${container.name}`,
            `ID: ${container.container_id}`,
            `State: ${container.state}`,
            `Status: ${container.status || "Unknown"}`,
            `Kind: ${container.kind}`,
            `Image: ${container.image}`
        ];

        if (container.node_type) {
            tooltipParts.push(`Type: ${container.node_type}`);
        }

        if (container.node_group && container.node_group.trim() !== '') {
            tooltipParts.push(`Group: ${container.node_group}`);
        }

        const v4Addr = container.ipv4_address?.split('/')[0];
        if (v4Addr && v4Addr !== "N/A") {
            tooltipParts.push(`IPv4: ${v4Addr}`);
        }

        const v6Addr = container.ipv6_address?.split('/')[0];
        if (v6Addr && v6Addr !== "N/A") {
            tooltipParts.push(`IPv6: ${v6Addr}`);
        }

        return tooltipParts;
    }

    private getContainerIcon(container: c.ClabJSON): string {
        if (container.state === "running") {
            const status = container.status?.toLowerCase() || "";
            if (status.includes("health: starting") || status.includes("unhealthy")) {
                return c.CtrStateIcons.PARTIAL;
            }
            return c.CtrStateIcons.RUNNING;
        }
        return c.CtrStateIcons.STOPPED;
    }

    /**
     * Discover containers that belong to a specific lab path.
     */
    private discoverContainers(containersForThisLab: c.ClabJSON[], absLabPath: string): c.ClabContainerTreeNode[] {
        console.log(`[RunningLabTreeDataProvider]:\tProcessing ${containersForThisLab.length} containers for ${absLabPath}...`);

        let containerNodes: c.ClabContainerTreeNode[] = [];

        containersForThisLab.forEach((container: c.ClabJSON) => {
            const name_short = container.name_short || container.name.replace(/^clab-[^-]+-/, '');
            const tooltipParts = this.buildTooltipParts(container);
            const icon = this.getContainerIcon(container);

            const interfaces = this.discoverContainerInterfaces(
                absLabPath,
                container.name,
                container.container_id,
                container.state
            ).sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));

            const collapsible = interfaces.length > 0
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None;

            const label = container.name_short || container.name;

            const node = new c.ClabContainerTreeNode(
                label,
                collapsible,
                container.name,
                name_short,
                container.container_id,
                container.state,
                container.kind,
                container.image,
                interfaces,
                { absolute: absLabPath, relative: utils.getRelLabFolderPath(container.labPath) },
                container.ipv4_address,
                container.ipv6_address,
                container.node_type,
                container.node_group,
                container.status,
                "containerlabContainer"
            );

            node.description = container.status ? ` ${container.status}` : "";
            node.tooltip = tooltipParts.join("\n");

            const iconPath = this.getResourceUri(icon);
            node.iconPath = { light: iconPath, dark: iconPath };

            containerNodes.push(node);
        });

        // Sort container nodes alphabetically by name
        return containerNodes.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
    }

    private discoverContainerInterfaces(
        absLabPath: string, // Use absolute lab path
        cName: string,
        cID: string,
        containerState: string
    ): c.ClabInterfaceTreeNode[] {
        const cacheKey = `${absLabPath}::${cName}::${cID}`;
        const cached = this.containerInterfacesCache.get(cacheKey);
        const cachedValid = cached && cached.state === containerState &&
            (Date.now() - cached.timestamp < this.cacheTTL);
        if (cachedValid) return cached!.interfaces;

        let interfaces: c.ClabInterfaceTreeNode[] = [];
        try {
            const bin = this.findContainerlabBinary();
            const clabInsJSON = this.getInterfacesJSON(bin, absLabPath, cName);
            interfaces = this.buildInterfaceNodes(clabInsJSON, cName, cID);
            this.containerInterfacesCache.set(cacheKey, {
                state: containerState,
                timestamp: Date.now(),
                interfaces
            });
        } catch (err: any) {
            if (err.killed || err.signal === 'SIGTERM') {
                console.error(`[RunningLabTreeDataProvider]: Interface detection timed out for ${cName}. Cmd: ${err.cmd}`);
            } else {
                console.error(`[RunningLabTreeDataProvider]: Interface detection failed for ${cName}. ${err.message || String(err)}`);
            }
            this.containerInterfacesCache.delete(cacheKey);
        }
        return interfaces;
    }

    private findContainerlabBinary(): string {
        const candidateBins = ['/usr/bin/containerlab', '/bin/containerlab', '/usr/local/bin/containerlab'];
        return candidateBins.find(p => {
            try { return fs.existsSync(p); } catch { return false; }
        }) || 'containerlab';
    }

    private getInterfacesJSON(bin: string, absLabPath: string, cName: string): ClabInsIntfJSON[] {
        const clabStdout = execFileSync(
            bin,
            ['inspect', 'interfaces', '-t', absLabPath, '-f', 'json', '-n', cName],
            { stdio: ['pipe', 'pipe', 'ignore'], timeout: 10000 }
        ).toString();
        return JSON.parse(clabStdout);
    }

    private buildInterfaceNodes(clabInsJSON: ClabInsIntfJSON[], cName: string, cID: string): c.ClabInterfaceTreeNode[] {
        const interfaces: c.ClabInterfaceTreeNode[] = [];

        if (!(clabInsJSON && clabInsJSON.length > 0 && Array.isArray(clabInsJSON[0].interfaces))) {
            console.warn(`[RunningLabTreeDataProvider]: Unexpected JSON structure from inspect interfaces for ${cName}`);
            return interfaces;
        }

        clabInsJSON[0].interfaces.forEach(intf => {
            if (intf.state === 'unknown' || intf.name === 'lo') return;

            const tooltipParts: string[] = [
                `Name: ${intf.name}`,
                `State: ${intf.state}`,
                `Type: ${intf.type}`,
                `MAC: ${intf.mac}`,
                `MTU: ${intf.mtu}`
            ];

            let label: string = intf.name;
            let description: string = intf.state.toUpperCase();

            if (intf.alias) {
                label = intf.alias;
                tooltipParts.splice(1, 0, `Alias: ${intf.alias}`);
                description = `${intf.state.toUpperCase()} (${intf.name})`;
            }

            let iconLight: vscode.Uri;
            let iconDark: vscode.Uri;
            const contextValue = this.getInterfaceContextValue(intf.state);

            switch (intf.state) {
                case 'up':
                    iconLight = this.getResourceUri(c.IntfStateIcons.UP);
                    iconDark = this.getResourceUri(c.IntfStateIcons.UP);
                    break;
                case 'down':
                    iconLight = this.getResourceUri(c.IntfStateIcons.DOWN);
                    iconDark = this.getResourceUri(c.IntfStateIcons.DOWN);
                    break;
                default:
                    iconLight = this.getResourceUri(c.IntfStateIcons.LIGHT);
                    iconDark = this.getResourceUri(c.IntfStateIcons.DARK);
                    break;
            }

            const node = new c.ClabInterfaceTreeNode(
                label,
                vscode.TreeItemCollapsibleState.None,
                cName,
                cID,
                intf.name,
                intf.type,
                intf.alias,
                intf.mac,
                intf.mtu,
                intf.ifindex,
                intf.state,
                contextValue
            );

            node.tooltip = tooltipParts.join("\n");
            node.description = description;
            node.iconPath = { light: iconLight, dark: iconDark };

            interfaces.push(node);
        });

        return interfaces;
    }


    // getInterfaceContextValue remains unchanged
    private getInterfaceContextValue(state: string): string {
        return state === 'up' ? 'containerlabInterfaceUp' : 'containerlabInterfaceDown';
    }

    // startCacheJanitor remains unchanged
    private startCacheJanitor() {
        setInterval(() => {
            const now = Date.now();
            let hasExpired = false;

            // Check for expired container interfaces
            this.containerInterfacesCache.forEach((value, key) => {
                if (now - value.timestamp >= this.cacheTTL) {
                    this.containerInterfacesCache.delete(key);
                    hasExpired = true;
                }
            });

            if (this.labsCache.inspect && now - this.labsCache.inspect.timestamp >= this.cacheTTL) {
                this.labsCache.inspect = null;
                hasExpired = true;
            }

            // Only fire the event if something actually expired
            if (hasExpired) {
                this._onDidChangeTreeData.fire();
            }
        }, Math.min(this.refreshInterval, this.cacheTTL));
    }

    // getResourceUri remains unchanged
    private getResourceUri(resource: string) {
        return vscode.Uri.file(this.context.asAbsolutePath(path.join("resources", resource)));
    }

    // updateBadge remains unchanged
    private updateBadge(runningLabs: number) {
        if (!runningTreeView) return; // Guard against treeView not being initialized yet

        if (runningLabs < 1) {
            runningTreeView.badge = undefined;
        } else {
            runningTreeView.badge = {
                value: runningLabs,
                tooltip: `${runningLabs} running lab(s)`
            };
        }
    }
}
