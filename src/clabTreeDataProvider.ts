import * as vscode from "vscode"
import * as utils from "./utils"
import { promisify } from "util";
import { exec, execSync } from "child_process";
import path = require("path");
import { treeView } from "./extension";

const execAsync = promisify(exec);

// Enum to store types of container state icons.
enum CtrStateIcons {
  RUNNING = "icons/running.svg",
  STOPPED = "icons/stopped.svg",
  PARTIAL = "icons/partial.svg",
  UNDEPLOYED = "icons/undeployed.svg"
}

// Enum to store interface state icons.
enum IntfStateIcons {
  UP = "icons/ethernet-port-green.svg",
  DOWN = "icons/ethernet-port-red.svg",
  LIGHT = "icons/ethernet-port-light.svg",
  DARK = "icons/ethernet-port-dark.svg",
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
 * Interface for detailed container info from `containerlab inspect --all --details`
 */
interface ClabDetailedJSON {
  Names: string[];
  ID: string;
  ShortID: string;
  Image: string;
  State: string;
  Status: string;
  Labels: {
    'clab-node-kind': string;
    'clab-node-lab-dir': string;
    'clab-node-longname': string;
    'clab-node-name': string;
    'clab-owner': string;
    'clab-topo-file': string;
    [key: string]: string | undefined;
    'clab-node-type'?: string;
    'clab-node-group'?: string;
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
  Ports: Array<any>;
  Pid?: number;
}

/**
 * Interface which stores fields from simple clab inspect format
 * (used for backward compatibility and as a standard format)
 */
interface ClabJSON {
  container_id: string;
  image: string;
  ipv4_address: string;
  ipv6_address: string;
  kind: string;
  lab_name: string;
  labPath: string;      // Path as provided by containerlab (might be relative)
  absLabPath?: string;  // Absolute path (present in newer versions >= 0.68.0)
  name: string;
  name_short?: string;  // Short name without lab prefix
  owner: string;
  state: string;
  status?: string;      // Also add the optional status field
  node_type?: string;   // Node type (e.g. ixrd3, srlinux, etc.)
  node_group?: string;  // Node group
}

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

export class ClabTreeDataProvider implements vscode.TreeDataProvider<ClabLabTreeNode | ClabContainerTreeNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void | ClabLabTreeNode | ClabContainerTreeNode | null | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private containerInterfacesCache: Map<string, {
    state: string,
    timestamp: number,
    interfaces: ClabInterfaceTreeNode[]
  }> = new Map();

  // Cache for labs: both local and inspect (running) labs.
  private labsCache: {
    local: { data: Record<string, ClabLabTreeNode> | undefined, timestamp: number } | null,
    inspect: { data: Record<string, ClabLabTreeNode> | undefined, timestamp: number } | null,
  } = { local: null, inspect: null };

  constructor(private context: vscode.ExtensionContext) {
    this.startCacheJanitor();
  }

  refresh(element?: ClabLabTreeNode | ClabContainerTreeNode): void {
    if (!element) {
      // Full refresh - clear all caches
      this.containerInterfacesCache.clear();
      this.labsCache.local = null;
      this.labsCache.inspect = null;
      this._onDidChangeTreeData.fire();
    } else {
      // Selective refresh - only refresh this element
      this._onDidChangeTreeData.fire(element);
    }
  }

  // Add to ClabTreeDataProvider class
  async hasChanges(): Promise<boolean> {
    const now = Date.now();

    // Check for expired caches
    for (const [key, value] of this.containerInterfacesCache.entries()) {
      if (now - value.timestamp > 30000) {
        return true;
      }
    }

    if (this.labsCache.local && now - this.labsCache.local.timestamp > 30000) {
      return true;
    }

    if (this.labsCache.inspect && now - this.labsCache.inspect.timestamp > 30000) {
      return true;
    }

    return false;
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
    // Find interfaces belonging to a container
    if (element instanceof ClabContainerTreeNode) {
      // Ensure interfaces are fetched/updated if needed (or rely on existing cache logic)
      // The existing discoverContainerInterfaces logic with caching should handle this.
      return element.interfaces;
    }

    return [];
  }

  private async discoverLabs(): Promise<ClabLabTreeNode[]> {
    console.log("[discovery]:\tDiscovering labs");

    const localLabs = await this.discoverLocalLabs();     // Undeployed topologies
    const globalLabs = await this.discoverInspectLabs();  // Deployed labs from `clab inspect -a`

    // --- Combine local and global labs ---
    // Initialize with global labs (deployed)
    const labs: Record<string, ClabLabTreeNode> = globalLabs ? { ...globalLabs } : {};

    // Add local labs (undeployed) if they don't already exist as deployed
    if (localLabs) {
      for (const labPath in localLabs) {
        if (!labs.hasOwnProperty(labPath)) {
          labs[labPath] = localLabs[labPath];
        }
      }
    }

    // Handle case where no labs are found at all
    if (Object.keys(labs).length === 0) {
      console.error("[discovery]:\tNo labs found");
      return [
        new ClabLabTreeNode(
          "No labs found. Add a lab with the '+' icon.",
          vscode.TreeItemCollapsibleState.None,
          { absolute: "", relative: "" }
        )
      ];
    }

    // Convert the dict to an array and sort by:
    // 1. Deployed labs first
    // 2. Then by absolute path
    const sortedLabs = Object.values(labs).sort((a, b) => {
      const isADeployed = a.contextValue === "containerlabLabDeployed";
      const isBDeployed = b.contextValue === "containerlabLabDeployed";

      if (isADeployed && !isBDeployed) {
        return -1; // a (deployed) comes before b (undeployed)
      }
      if (!isADeployed && isBDeployed) {
        return 1; // b (deployed) comes before a (undeployed)
      }
      // If same deployment status, sort by path
      return a.labPath.absolute.localeCompare(b.labPath.absolute);
    });

    console.log(`[discovery]:\tDiscovered ${sortedLabs.length} labs.`);
    return sortedLabs;
  }

  private async discoverLocalLabs(): Promise<Record<string, ClabLabTreeNode> | undefined> {
    console.log("[discovery]:\tDiscovering local labs...");
    const CACHE_TTL = 30000; // 30 seconds TTL for labs

    if (this.labsCache.local && (Date.now() - this.labsCache.local.timestamp < CACHE_TTL)) {
      return this.labsCache.local.data;
    }

    const clabGlobPatterns = "{**/*.clab.yml,**/*.clab.yaml}";
    const ignorePattern = "**/node_modules/**";

    const uris = await vscode.workspace.findFiles(clabGlobPatterns, ignorePattern);

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

        const icon = this.getResourceUri(CtrStateIcons.UNDEPLOYED);
        labNode.iconPath = { light: icon, dark: icon };

        labs[normPath] = labNode;
      }
    });

    this.labsCache.local = { data: labs, timestamp: Date.now() };
    return labs;
  }

  /**
   * Convert detailed container data to the simpler format used by the existing code.
   * This maintains backward compatibility while adding new fields.
   */
  private convertDetailedToSimpleFormat(detailedData: Record<string, ClabDetailedJSON[]>): Record<string, ClabJSON[]> {
    const result: Record<string, ClabJSON[]> = {};

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
          node_group: container.Labels['clab-node-group'] || undefined
        };
      });
    }

    return result;
  }

  public async discoverInspectLabs(): Promise<Record<string, ClabLabTreeNode> | undefined> {
    console.log("[discovery]:\tDiscovering labs via inspect...");
    const CACHE_TTL = 30000; // 30 seconds TTL for inspect labs

    if (this.labsCache.inspect && (Date.now() - this.labsCache.inspect.timestamp < CACHE_TTL)) {
      return this.labsCache.inspect.data;
    }

    const inspectData = await this.getInspectData(); // This now properly handles both formats

    if (!inspectData) {
      this.updateBadge(0);
      this.labsCache.inspect = { data: undefined, timestamp: Date.now() }; // Cache empty result
      return undefined;
    }

    // --- Normalize inspectData into a flat list of containers ---
    let allContainers: ClabJSON[] = [];

    if (Array.isArray(inspectData)) {
      // Old format: Flat array of containers
      console.log("[discovery]:\tDetected old inspect format (flat container list).");
      allContainers = inspectData;
    } else if (inspectData.containers && Array.isArray(inspectData.containers)) {
      // Old format: Top-level "containers" array
      console.log("[discovery]:\tDetected old inspect format (flat container list with 'containers' key).");
      allContainers = inspectData.containers;
    } else if (typeof inspectData === 'object' && Object.keys(inspectData).length > 0) {
      // New format: Object with lab names as keys
      console.log("[discovery]:\tDetected new inspect format (grouped by lab).");
      for (const labName in inspectData) {
        if (Array.isArray(inspectData[labName])) {
          // Add containers from this lab to the flat list
          allContainers.push(...inspectData[labName]);
        }
      }
    } else {
      // Handle cases where inspectData is invalid, empty, or not the expected object/array
      console.log("[discovery]:\tInspect data is empty or in an unexpected format.");
      this.updateBadge(0);
      this.labsCache.inspect = { data: undefined, timestamp: Date.now() }; // Cache empty result
      return undefined;
    }

    // If after normalization, we have no containers, return undefined
    if (allContainers.length === 0) {
      this.updateBadge(0);
      this.labsCache.inspect = { data: undefined, timestamp: Date.now() }; // Cache empty result
      return undefined;
    }

    // --- Process the flat allContainers list ---
    const labs: Record<string, ClabLabTreeNode> = {};

    allContainers.forEach((container: ClabJSON) => {
      // Use absLabPath if available, otherwise normalize labPath as fallback
      const normPath = container.absLabPath || utils.normalizeLabPath(container.labPath);

      if (!labs[normPath]) {
        // This is the first container we see for this lab path
        const label = `${container.lab_name} (${container.owner})`;

        const labPathObj: LabPath = {
          absolute: normPath,
          // Use relative path from the container data if possible, else calculate
          relative: utils.getRelativeFolderPath(normPath) // Or use a calculated relative path
        };

        // Filter the flat list to get all containers for *this specific lab path*
        const containersForThisLab = allContainers.filter(
          (c: ClabJSON) => (c.absLabPath || utils.normalizeLabPath(c.labPath)) === normPath
        );

        // Discover the container nodes for this lab using the filtered list
        const discoveredContainers: ClabContainerTreeNode[] =
          this.discoverContainers(containersForThisLab, labPathObj.absolute); // Pass filtered list

        // Determine lab icon based on container states
        let runningCount = 0;
        for (const c of discoveredContainers) {
          if (c.state === "running") {
            runningCount++;
          }
        }
        let icon: string;
        if (runningCount === 0 && discoveredContainers.length > 0) { // Check length > 0
          icon = CtrStateIcons.STOPPED;
        } else if (runningCount === discoveredContainers.length) {
          icon = CtrStateIcons.RUNNING;
        } else if (discoveredContainers.length > 0) { // Only show partial if there are containers
          icon = CtrStateIcons.PARTIAL;
        } else {
           icon = CtrStateIcons.STOPPED; // Default if no containers somehow (shouldn't happen here)
        }

        const labNode = new ClabLabTreeNode(
          label,
          vscode.TreeItemCollapsibleState.Collapsed, // Always collapsed initially for deployed labs
          labPathObj,
          container.lab_name,
          container.owner,
          discoveredContainers,
          "containerlabLabDeployed" // Context value for deployed labs
        );
        labNode.description = labPathObj.relative; // Show relative path

        const iconUri = this.getResourceUri(icon);
        labNode.iconPath = { light: iconUri, dark: iconUri };

        labs[normPath] = labNode;
      }
    });

    this.updateBadge(Object.keys(labs).length);

    this.labsCache.inspect = { data: labs, timestamp: Date.now() }; // Cache the result
    return labs;
  }

  private async getInspectData(): Promise<any> {
    const config = vscode.workspace.getConfiguration("containerlab");
    const runtime = config.get<string>("runtime", "docker");

    // Updated to use --details flag
    const cmd = `${utils.getSudo()}containerlab inspect -r ${runtime} --all --details --format json 2>/dev/null`;

    let clabStdout;
    try {
      const { stdout } = await execAsync(cmd);
      clabStdout = stdout;
    } catch (err) {
      throw new Error(`Could not run ${cmd}.\n${err}`);
    }

    if (!clabStdout) {
      return undefined;
    }

    const parsedData = JSON.parse(clabStdout);

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
      console.log("[discovery]: Converting detailed format to standard format");

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
      let labName = "unknown";

      // Try to get lab name from Labels
      if (container.Labels && container.Labels['clab-owner']) {
        labName = container.Labels['clab-owner'];
      } else if (container.Names && container.Names.length > 0) {
        // Fallback: try to extract from container name (format: clab-LABNAME-NODENAME)
        const match = container.Names[0].match(/^clab-([^-]+)-/);
        if (match && match[1]) {
          labName = match[1];
        }
      }

      // Initialize array for this lab if it doesn't exist
      if (!result[labName]) {
        result[labName] = [];
      }

      // Add container to the lab group
      result[labName].push(container);
    });

    return result;
  }

  /**
   * Discover containers that belong to a specific lab path.
   */
  private discoverContainers(containersForThisLab: ClabJSON[], absLabPath: string): ClabContainerTreeNode[] {
    console.log(`[discovery]:\tProcessing ${containersForThisLab.length} containers for ${absLabPath}...`);

    let containerNodes: ClabContainerTreeNode[] = [];

    containersForThisLab.forEach((container: ClabJSON) => {
      // Use name_short if available, otherwise extract from name
      const name_short = container.name_short ||
                        container.name.replace(/^clab-[^-]+-/, '');

      let tooltipParts = [
        `Container: ${container.name}`,
        `ID: ${container.container_id}`,
        `State: ${container.state}`,
        `Kind: ${container.kind}`,
        `Image: ${container.image}`
      ];

      // Add node type if available
      if (container.node_type) {
        tooltipParts.push(`Type: ${container.node_type}`);
      }

      // Add node group if available and not empty
      if (container.node_group && container.node_group.trim() !== '') {
        tooltipParts.push(`Group: ${container.node_group}`);
      }

      // Add IPs to tooltip if valid
      const v4Addr = container.ipv4_address?.split('/')[0];
      if (v4Addr && v4Addr !== "N/A") {
        tooltipParts.push(`IPv4: ${v4Addr}`);
      }
      const v6Addr = container.ipv6_address?.split('/')[0];
      if (v6Addr && v6Addr !== "N/A") {
        tooltipParts.push(`IPv6: ${v6Addr}`);
      }

      // Determine icon based on state
      const icon = container.state === "running" ? CtrStateIcons.RUNNING : CtrStateIcons.STOPPED;

      // Discover interfaces for this specific container
      // The interface discovery logic already uses caching based on container ID and state
      const interfaces = this.discoverContainerInterfaces(
        absLabPath, // Pass the absolute path of the lab file
        container.name,
        container.container_id,
        container.state // Pass container state for cache validation
      ).sort((a, b) => a.name.localeCompare(b.name)); // Sort interfaces alphabetically

      // Determine collapsible state based on interfaces
      const collapsible = interfaces.length > 0
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None;

      // Create the container node with optional fields
      const node = new ClabContainerTreeNode(
        container.name, // Use container name as label
        collapsible,
        container.name,
        name_short,
        container.container_id,
        container.state,
        container.kind,
        container.image,
        interfaces, // Assign discovered interfaces
        { absolute: absLabPath, relative: utils.getRelLabFolderPath(container.labPath) }, // Lab path info
        container.ipv4_address, // Full address with mask
        container.ipv6_address, // Full address with mask
        container.node_type, // Node type (if available)
        container.node_group, // Node group (if available)
        "containerlabContainer" // Context value
      );

      // Set description (e.g., "Running", "Stopped") and tooltip
      const description = [utils.titleCase(container.state)];

      node.description = description.join(" ");
      node.tooltip = tooltipParts.join("\n");

      // Set icon path
      const iconPath = this.getResourceUri(icon);
      node.iconPath = { light: iconPath, dark: iconPath };

      containerNodes.push(node);
    });

    // Sort container nodes alphabetically by name
    return containerNodes.sort((a, b) => a.name.localeCompare(b.name));
  }

  private discoverContainerInterfaces(
    absLabPath: string, // Use absolute lab path
    cName: string,
    cID: string,
    containerState: string
  ): ClabInterfaceTreeNode[] {
    const CACHE_TTL = 30000; // 30 seconds
    // Use a consistent cache key including the absolute path
    const cacheKey = `${absLabPath}::${cName}::${cID}`;

    // Cache validation check
    if (this.containerInterfacesCache.has(cacheKey)) {
      const cached = this.containerInterfacesCache.get(cacheKey)!;
      // Check if container state matches and cache is not expired
      const isValid = cached.state === containerState &&
                     (Date.now() - cached.timestamp < CACHE_TTL);

      if (isValid) {
         // console.log(`[cache] HIT interfaces for ${cName} (${containerState})`);
         return cached.interfaces;
      } else {
         // console.log(`[cache] STALE interfaces for ${cName} (Cached: ${cached.state}, Current: ${containerState}, Age: ${Date.now() - cached.timestamp}ms)`);
      }
    } else {
       // console.log(`[cache] MISS interfaces for ${cName} (${containerState})`);
    }


    let interfaces: ClabInterfaceTreeNode[] = [];

    try {
      // IMPORTANT: Use the absolute lab path in the command
      const cmd = `${utils.getSudo()}containerlab inspect interfaces -t "${absLabPath}" -f json -n ${cName}`;
      // Use execSync for simplicity here, assuming it's fast enough. Add timeout if needed.
      const clabStdout = execSync(
        cmd,
        { stdio: ['pipe', 'pipe', 'ignore'], timeout: 10000 } // 10s timeout
      ).toString();

      const clabInsJSON: ClabInsIntfJSON[] = JSON.parse(clabStdout);

      // Check if the expected structure is present
      if (clabInsJSON && clabInsJSON.length > 0 && Array.isArray(clabInsJSON[0].interfaces)) {
          clabInsJSON[0].interfaces.forEach(intf => {
            // Skip interfaces in 'unknown' state or loopback 'lo'
            if (intf.state === "unknown" || intf.name === "lo") return;

            let tooltipParts: string[] = [
              `Name: ${intf.name}`,
              `State: ${intf.state}`,
              `Type: ${intf.type}`,
              `MAC: ${intf.mac}`,
              `MTU: ${intf.mtu}`
            ];

            let label: string = intf.name;
            let description: string = intf.state.toUpperCase();

            // Use alias if available
            if (intf.alias) {
              label = intf.alias;
              tooltipParts.splice(1, 0, `Alias: ${intf.alias}`); // Insert alias after name
              description = `${intf.state.toUpperCase()} (${intf.name})`; // Show state and real name
            }

            // Determine icons and context value based on interface state
            let iconLight: vscode.Uri;
            let iconDark: vscode.Uri;
            const contextValue = this.getInterfaceContextValue(intf.state);

            switch (intf.state) {
              case "up":
                iconLight = this.getResourceUri(IntfStateIcons.UP);
                iconDark = this.getResourceUri(IntfStateIcons.UP);
                break;
              case "down":
                iconLight = this.getResourceUri(IntfStateIcons.DOWN);
                iconDark = this.getResourceUri(IntfStateIcons.DOWN);
                break;
              default: // Should not happen if we skip 'unknown'
                iconLight = this.getResourceUri(IntfStateIcons.LIGHT);
                iconDark = this.getResourceUri(IntfStateIcons.DARK);
                break;
            }

            const node = new ClabInterfaceTreeNode(
              label,
              vscode.TreeItemCollapsibleState.None,
              cName, // parent container name
              cID,   // parent container ID
              intf.name, // interface name
              intf.type,
              intf.alias,
              intf.mac,
              intf.mtu,
              intf.ifindex,
              intf.state, // Store raw state value
              contextValue
            );

            node.tooltip = tooltipParts.join("\n");
            node.description = description;
            node.iconPath = { light: iconLight, dark: iconDark };

            interfaces.push(node);
          });
      } else {
          console.warn(`[discovery]: Unexpected JSON structure from inspect interfaces for ${cName}`);
      }


      // Update cache with current state and timestamp
      this.containerInterfacesCache.set(cacheKey, {
        state: containerState,
        timestamp: Date.now(),
        interfaces
      });

      // console.log(`[cache] STORED interfaces for ${cName} (${containerState})`);

    } catch (err: any) {
      // Log specific errors
      if (err.killed || err.signal === 'SIGTERM') {
         console.error(`[discovery]: Interface detection timed out for ${cName}. Cmd: ${err.cmd}`);
      } else {
         console.error(`[discovery]: Interface detection failed for ${cName}. ${err.message || String(err)}`);
      }
      // Clear cache entry on error to force refetch next time
      this.containerInterfacesCache.delete(cacheKey);
    }

    return interfaces; // Return potentially empty array on error
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
      const cacheTTL = 30000; // Use consistent TTL

      // Check for expired container interfaces
      this.containerInterfacesCache.forEach((value, key) => {
        if (now - value.timestamp > cacheTTL) {
          this.containerInterfacesCache.delete(key);
          hasExpired = true;
        }
      });

      // Check for expired labs caches
      if (this.labsCache.local && now - this.labsCache.local.timestamp > cacheTTL) {
        this.labsCache.local = null;
        hasExpired = true;
      }

      if (this.labsCache.inspect && now - this.labsCache.inspect.timestamp > cacheTTL) {
        this.labsCache.inspect = null;
        hasExpired = true;
      }

      // Only fire the event if something actually expired
      if (hasExpired) {
        // console.log("[cache]: Janitor expired some cache entries, refreshing tree.");
        this._onDidChangeTreeData.fire();
      }
    }, 10000); // Check every 10 seconds
  }

  // getResourceUri remains unchanged
  private getResourceUri(resource: string) {
    return vscode.Uri.file(this.context.asAbsolutePath(path.join("resources", resource)));
  }

  // updateBadge remains unchanged
  private updateBadge(runningLabs: number) {
    if (!treeView) return; // Guard against treeView not being initialized yet

    if (runningLabs < 1) {
      treeView.badge = undefined;
    } else {
      treeView.badge = {
        value: runningLabs,
        tooltip: `${runningLabs} running lab(s)`
      };
    }
  }
}