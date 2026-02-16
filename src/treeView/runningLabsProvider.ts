import path = require("path");

import * as vscode from "vscode";

import { FilterUtils } from "../helpers/filterUtils";
import * as utils from "../utils/utils";
import {
  hideNonOwnedLabsState,
  username,
  favoriteLabs,
  sshxSessions,
  gottySessions,
  outputChannel
} from "../globals";
import { refreshSshxSessions, refreshGottySessions } from "../services/sessionRefresh";
import { getCurrentTopoViewer } from "../commands/graph";
import type {
  ClabInterfaceSnapshot,
  ClabInterfaceSnapshotEntry,
  ClabInterfaceStats
} from "../types/containerlab";

import * as ins from "./inspector";
import * as c from "./common";

/**
 * Type for VS Code TreeItem iconPath property
 */
type IconPath = vscode.TreeItem["iconPath"];

/**
 * Type for light/dark icon pair
 */
interface LightDarkIcon {
  light: vscode.Uri;
  dark: vscode.Uri;
}

type RunningTreeNode = c.ClabLabTreeNode | c.ClabContainerTreeNode | c.ClabInterfaceTreeNode;

interface LabDiscoveryResult {
  rootChanged: boolean;
  labsToRefresh: Set<c.ClabLabTreeNode>;
  containersToRefresh: Set<c.ClabContainerTreeNode>;
}

export class RunningLabTreeDataProvider implements vscode.TreeDataProvider<
  c.ClabLabTreeNode | c.ClabContainerTreeNode
> {
  private _onDidChangeTreeData = new vscode.EventEmitter<
    void | c.ClabLabTreeNode | c.ClabContainerTreeNode | null | undefined
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private treeItems: c.ClabLabTreeNode[] = [];
  private treeFilter: string = "";
  private labNodeCache: Map<string, c.ClabLabTreeNode> = new Map();
  private labsSnapshot: Record<string, c.ClabLabTreeNode> | undefined;

  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  async refresh(element?: c.ClabLabTreeNode | c.ClabContainerTreeNode) {
    if (!element) {
      // Full refresh - update inspect data from the event stream
      await ins.update();
      const discovery = await this.discoverLabs();
      this.emitRefreshEvents(discovery);

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
      // Discover labs without clearing caches first
      const discovery = await this.discoverLabs();
      this.emitRefreshEvents(discovery);

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

  /**
   * Refresh a specific container by its short ID.
   * Rebuilds the interface list from scratch based on current inspection data.
   */
  async refreshContainer(containerShortId: string, newState: string) {
    outputChannel.info(`Container state change detected: ${containerShortId} → ${newState}`);

    // Find the container node in our tree
    const containerNode = this.findContainerNode(containerShortId);
    if (!containerNode) {
      outputChannel.warn(`Container ${containerShortId} not found in tree for refresh`);
      return;
    }

    outputChannel.info(
      `Triggering interface inspection for container: ${containerNode.name} (${containerShortId})`
    );

    // Rebuild interface list from inspection data
    // This will get current interfaces if running, or empty list if not
    const newInterfaces = this.discoverContainerInterfaces(
      containerNode.name,
      containerShortId,
      true // Log to output channel
    ).sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));

    outputChannel.info(
      `Interface inspection complete: ${containerNode.name} - found ${newInterfaces.length} interfaces`
    );

    // Update runtime state immediately (event stream gives us the fresh state).
    containerNode.state = newState;

    // Replace the entire interface list
    containerNode.interfaces = newInterfaces;

    // Update collapsible state based on interface count
    containerNode.collapsibleState =
      newInterfaces.length > 0
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None;

    // Fire refresh for this specific container
    this._onDidChangeTreeData.fire(containerNode);

    // Also refresh the topology viewer if it's open
    await this.refreshTopoViewerIfOpen();
  }

  /**
   * Find a container node by its short ID
   */
  private findContainerNode(containerShortId: string): c.ClabContainerTreeNode | undefined {
    for (const lab of this.treeItems) {
      if (!lab.containers) continue;
      for (const container of lab.containers) {
        if (container.cID === containerShortId) {
          return container;
        }
      }
    }
    return undefined;
  }

  setTreeFilter(filterText: string) {
    this.treeFilter = filterText;
    void this.refreshWithoutDiscovery();
  }

  clearTreeFilter() {
    this.treeFilter = "";
    void this.refreshWithoutDiscovery();
  }

  /**
   * Refresh the topology viewer if it's currently open.
   * This ensures the viewer stays in sync with tree data changes.
   * NOTE: This no longer performs automatic mode switching - mode changes
   * are only triggered by successful deploy/destroy command completion.
   */
  private async refreshTopoViewerIfOpen(): Promise<void> {
    const viewer = getCurrentTopoViewer();
    if (viewer?.currentPanel && viewer.isViewMode) {
      try {
        const labsForViewer = this.getLabsSnapshotForViewer();
        await viewer.refreshLinkStatesFromInspect(labsForViewer);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(
          `[RunningLabTreeDataProvider]:\tFailed to refresh TopoViewer link states: ${message}`
        );
      }
    }
  }

  /**
   * Build a fresh labs snapshot from the current tree cache.
   * This avoids stale references from older discover snapshots.
   */
  private getLabsSnapshotForViewer(): Record<string, c.ClabLabTreeNode> | undefined {
    if (this.treeItems.length === 0) {
      return this.labsSnapshot;
    }
    return this.treeItems.reduce<Record<string, c.ClabLabTreeNode>>((acc, lab) => {
      acc[lab.labPath.absolute] = lab;
      return acc;
    }, {});
  }

  getTreeItem(element: RunningTreeNode): vscode.TreeItem {
    return element;
  }

  /**
   * Return tree children. If called with c.ClabLabTreeNode as args it will return the c.ClabLabTreeNode's
   * array of containers.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async getChildren(element?: RunningTreeNode): Promise<any> {
    if (!this.treeItems.length) await this.discoverLabs();

    if (!element) return this.getRootChildren();
    if (element instanceof c.ClabLabTreeNode) return this.getLabChildren(element);
    if (element instanceof c.ClabContainerTreeNode) return this.getContainerChildren(element);
    return undefined;
  }

  private getRootChildren(): RunningTreeNode[] {
    const labs = hideNonOwnedLabsState
      ? this.treeItems.filter((labNode) => labNode.owner == username)
      : this.treeItems;

    const filtered = this.treeFilter ? this.filterLabs(labs, this.treeFilter) : labs;
    return filtered;
  }

  private filterLabs(labs: c.ClabLabTreeNode[], text: string): c.ClabLabTreeNode[] {
    const filter = FilterUtils.createFilter(text);
    return labs.filter((lab) => this.labMatchesFilter(lab, filter));
  }

  private labMatchesFilter(
    lab: c.ClabLabTreeNode,
    filter: ReturnType<typeof FilterUtils.createFilter>
  ): boolean {
    if (filter(String(lab.label))) return true;
    const containers = lab.containers || [];
    return containers.some(
      (cn) =>
        filter(String(cn.label)) ||
        (cn as c.ClabContainerTreeNode).interfaces?.some((it) => filter(String(it.label)))
    );
  }

  private getLabChildren(element: c.ClabLabTreeNode) {
    let containers: (c.ClabContainerTreeNode | c.ClabSshxLinkTreeNode | c.ClabGottyLinkTreeNode)[] =
      element.containers || [];
    if (element.sshxNode) containers = [element.sshxNode, ...containers];
    if (element.gottyNode) containers = [element.gottyNode, ...containers];
    if (!this.treeFilter) return containers;

    const filter = FilterUtils.createFilter(this.treeFilter);
    const labMatch = filter(String(element.label));
    if (labMatch) return containers;

    return containers.filter((cn) => {
      if (cn instanceof c.ClabContainerTreeNode) {
        return this.containerMatchesFilter(cn, filter);
      }
      // Keep link nodes when filtering
      return true;
    });
  }

  private containerMatchesFilter(
    cn: c.ClabContainerTreeNode,
    filter: ReturnType<typeof FilterUtils.createFilter>
  ): boolean {
    if (filter(String(cn.label))) return true; // Keep entire container with all interfaces
    const ifaces = cn.interfaces || [];
    return ifaces.some((it) => filter(String(it.label)));
  }

  private getContainerChildren(element: c.ClabContainerTreeNode) {
    let interfaces = element.interfaces;
    if (!this.treeFilter) return interfaces;
    const filter = FilterUtils.createFilter(this.treeFilter);
    const containerMatches = filter(String(element.label));
    return containerMatches ? interfaces : interfaces.filter((it) => filter(String(it.label)));
  }

  private async discoverLabs(): Promise<LabDiscoveryResult> {
    const previousCache = this.labNodeCache;
    const labsToRefresh: Set<c.ClabLabTreeNode> = new Set();
    const containersToRefresh: Set<c.ClabContainerTreeNode> = new Set();

    const globalLabs = await this.discoverInspectLabs(); // Deployed labs from `clab inspect -a`

    // --- Combine local and global labs ---
    // Initialize with global labs (deployed)
    const labs: Record<string, c.ClabLabTreeNode> = globalLabs ? { ...globalLabs } : {};

    const sortedLabs = this.sortLabsForDisplay(labs);

    const { cache: newCache, rootChanged } = this.mergeLabsIntoCache(
      sortedLabs,
      previousCache,
      labsToRefresh,
      containersToRefresh
    );

    this.labNodeCache = newCache;
    this.treeItems = Array.from(newCache.values());

    return { rootChanged, labsToRefresh, containersToRefresh };
  }

  private sortLabsForDisplay(labs: Record<string, c.ClabLabTreeNode>): c.ClabLabTreeNode[] {
    return Object.values(labs).sort((a, b) => {
      const isADeployed = a.contextValue?.startsWith("containerlabLabDeployed");
      const isBDeployed = b.contextValue?.startsWith("containerlabLabDeployed");

      if (isADeployed && !isBDeployed) {
        return -1;
      }
      if (!isADeployed && isBDeployed) {
        return 1;
      }

      const aPath = a.labPath?.absolute ?? "";
      const bPath = b.labPath?.absolute ?? "";
      return aPath.localeCompare(bPath);
    });
  }

  private mergeLabsIntoCache(
    sortedLabs: c.ClabLabTreeNode[],
    previousCache: Map<string, c.ClabLabTreeNode>,
    labsToRefresh: Set<c.ClabLabTreeNode>,
    containersToRefresh: Set<c.ClabContainerTreeNode>
  ): { cache: Map<string, c.ClabLabTreeNode>; rootChanged: boolean } {
    const newCache: Map<string, c.ClabLabTreeNode> = new Map();
    let rootChanged = false;

    sortedLabs.forEach((lab) => {
      const key = lab.labPath.absolute;
      const existing = previousCache.get(key);

      if (existing) {
        const mergeResult = this.mergeLabNode(existing, lab);
        if (mergeResult.labChanged || mergeResult.branchStructureChanged) {
          labsToRefresh.add(existing);
        }
        mergeResult.containersToRefresh.forEach((container) => containersToRefresh.add(container));
        if (mergeResult.branchStructureChanged) {
          labsToRefresh.add(existing);
        }
        newCache.set(key, existing);
      } else {
        newCache.set(key, lab);
        rootChanged = true;
      }
    });

    if (this.hasRemovedLabs(previousCache, newCache)) {
      rootChanged = true;
    }

    return { cache: newCache, rootChanged };
  }

  private hasRemovedLabs(
    previousCache: Map<string, c.ClabLabTreeNode>,
    newCache: Map<string, c.ClabLabTreeNode>
  ): boolean {
    for (const key of previousCache.keys()) {
      if (!newCache.has(key)) {
        return true;
      }
    }
    return false;
  }

  private emitRefreshEvents(_discovery: LabDiscoveryResult) {
    this._onDidChangeTreeData.fire();
  }

  private mergeLabNode(
    target: c.ClabLabTreeNode,
    source: c.ClabLabTreeNode
  ): {
    labChanged: boolean;
    branchStructureChanged: boolean;
    containersToRefresh: c.ClabContainerTreeNode[];
  } {
    let labChanged = false;
    let branchStructureChanged = false;
    const containersToRefresh: Set<c.ClabContainerTreeNode> = new Set();

    if (String(target.label) !== String(source.label)) {
      target.label = source.label;
      labChanged = true;
    }
    if (target.description !== source.description) {
      target.description = source.description;
      labChanged = true;
    }
    // Always update tooltip (VS Code fetches it lazily on hover)
    // but don't mark as changed to avoid dismissing visible tooltips
    if (target.tooltip !== source.tooltip) {
      target.tooltip = source.tooltip;
    }
    if (!this.iconsEqual(target.iconPath, source.iconPath)) {
      target.iconPath = source.iconPath;
      labChanged = true;
    }
    if (target.contextValue !== source.contextValue) {
      target.contextValue = source.contextValue;
      labChanged = true;
    }
    if ((target.favorite ?? false) !== (source.favorite ?? false)) {
      target.favorite = source.favorite;
      labChanged = true;
    }

    if (target.sshxLink !== source.sshxLink) {
      target.sshxLink = source.sshxLink;
      branchStructureChanged = true;
    }
    if (!this.treeItemEquals(target.sshxNode, source.sshxNode)) {
      target.sshxNode = source.sshxNode;
      branchStructureChanged = true;
    }
    if (target.gottyLink !== source.gottyLink) {
      target.gottyLink = source.gottyLink;
      branchStructureChanged = true;
    }
    if (!this.treeItemEquals(target.gottyNode, source.gottyNode)) {
      target.gottyNode = source.gottyNode;
      branchStructureChanged = true;
    }

    const containerMerge = this.mergeContainerLists(target, source);
    containerMerge.containersToRefresh.forEach((container) => containersToRefresh.add(container));
    if (containerMerge.branchStructureChanged) {
      branchStructureChanged = true;
    }

    return {
      labChanged,
      branchStructureChanged,
      containersToRefresh: Array.from(containersToRefresh)
    };
  }

  private mergeContainerLists(
    targetLab: c.ClabLabTreeNode,
    sourceLab: c.ClabLabTreeNode
  ): {
    containersToRefresh: c.ClabContainerTreeNode[];
    branchStructureChanged: boolean;
  } {
    const existingContainers = new Map<string, c.ClabContainerTreeNode>(
      (targetLab.containers || []).map((container) => [
        container.name ?? String(container.label ?? ""),
        container
      ])
    );
    const orderedContainers: c.ClabContainerTreeNode[] = [];
    const containersToRefresh: Set<c.ClabContainerTreeNode> = new Set();
    let branchStructureChanged = false;

    for (const incoming of sourceLab.containers || []) {
      const key = incoming.name ?? String(incoming.label ?? "");
      const existing = key ? existingContainers.get(key) : undefined;

      if (existing) {
        const result = this.updateContainerNode(existing, incoming);
        if (result.changed) {
          containersToRefresh.add(existing);
        }
        if (result.structureChanged) {
          containersToRefresh.add(existing);
        }
        orderedContainers.push(existing);
        existingContainers.delete(key);
      } else {
        branchStructureChanged = true;
        orderedContainers.push(incoming);
      }
    }

    if (existingContainers.size > 0) {
      branchStructureChanged = true;
    }

    targetLab.containers = orderedContainers;

    return {
      containersToRefresh: Array.from(containersToRefresh),
      branchStructureChanged
    };
  }

  private updateContainerNode(
    target: c.ClabContainerTreeNode,
    source: c.ClabContainerTreeNode
  ): {
    changed: boolean;
    structureChanged: boolean;
  } {
    let changed = false;
    let structureChanged = false;

    if (
      this.applySimpleUpdates(target as unknown as Record<string, unknown>, [
        ["label", source.label, true],
        ["description", source.description, true],
        ["contextValue", source.contextValue],
        ["cID", source.cID],
        ["state", source.state],
        ["status", source.status],
        ["kind", source.kind],
        ["image", source.image],
        ["v4Address", source.v4Address],
        ["v6Address", source.v6Address],
        ["nodeType", source.nodeType],
        ["nodeGroup", source.nodeGroup]
      ])
    ) {
      changed = true;
    }

    // Always update tooltip (VS Code fetches it lazily on hover)
    // but don't mark as changed to avoid dismissing visible tooltips
    if (String(target.tooltip ?? "") !== String(source.tooltip ?? "")) {
      target.tooltip = source.tooltip;
    }

    if (!this.iconsEqual(target.iconPath, source.iconPath)) {
      target.iconPath = source.iconPath;
      changed = true;
    }

    if (target.collapsibleState !== source.collapsibleState) {
      target.collapsibleState = source.collapsibleState;
      structureChanged = true;
    }

    const interfacesResult = this.mergeInterfaceNodes(target, source);
    if (interfacesResult.changed) {
      changed = true;
    }
    if (interfacesResult.structureChanged) {
      structureChanged = true;
    }

    return { changed, structureChanged };
  }

  private mergeInterfaceNodes(
    target: c.ClabContainerTreeNode,
    source: c.ClabContainerTreeNode
  ): {
    changed: boolean;
    structureChanged: boolean;
  } {
    const existingInterfaces = new Map<string, c.ClabInterfaceTreeNode>(
      (target.interfaces || []).map((intf) => [intf.name ?? String(intf.label ?? ""), intf])
    );
    const orderedInterfaces: c.ClabInterfaceTreeNode[] = [];
    let changed = false;
    let structureChanged = false;

    for (const incoming of source.interfaces || []) {
      const key = incoming.name ?? String(incoming.label ?? "");
      const existing = existingInterfaces.get(key);
      if (existing) {
        if (this.updateInterfaceNode(existing, incoming)) {
          changed = true;
        }
        orderedInterfaces.push(existing);
        existingInterfaces.delete(key);
      } else {
        structureChanged = true;
        changed = true;
        orderedInterfaces.push(incoming);
      }
    }

    if (existingInterfaces.size > 0) {
      structureChanged = true;
      changed = true;
    }

    target.interfaces = orderedInterfaces;

    return { changed, structureChanged };
  }

  private updateInterfaceNode(
    target: c.ClabInterfaceTreeNode,
    source: c.ClabInterfaceTreeNode
  ): boolean {
    let changed = false;

    if (
      this.applySimpleUpdates(target as unknown as Record<string, unknown>, [
        ["label", source.label, true],
        ["description", source.description, true],
        ["contextValue", source.contextValue],
        ["cID", source.cID],
        ["state", source.state],
        ["type", source.type],
        ["alias", source.alias],
        ["mac", source.mac],
        ["mtu", source.mtu],
        ["ifIndex", source.ifIndex]
      ])
    ) {
      changed = true;
    }

    // Always update tooltip (VS Code fetches it lazily on hover)
    // but don't mark as changed to avoid dismissing visible tooltips
    if (String(target.tooltip ?? "") !== String(source.tooltip ?? "")) {
      target.tooltip = source.tooltip;
    }

    if (!this.iconsEqual(target.iconPath, source.iconPath)) {
      target.iconPath = source.iconPath;
      changed = true;
    }

    if (!this.areObjectValuesEqual(target.stats, source.stats)) {
      target.stats = source.stats ? { ...source.stats } : undefined;
      changed = true;
    }

    if (!this.areObjectValuesEqual(target.netemState, source.netemState)) {
      target.netemState = source.netemState ? { ...source.netemState } : undefined;
      changed = true;
    }

    return changed;
  }

  private areObjectValuesEqual<T extends object>(a: T | undefined, b: T | undefined): boolean {
    if (!a && !b) return true;
    if (!a || !b) return false;
    const aRecord = a as Record<string, unknown>;
    const bRecord = b as Record<string, unknown>;
    const keys = new Set([...Object.keys(aRecord), ...Object.keys(bRecord)]);
    for (const key of keys) {
      if (aRecord[key] !== bRecord[key]) {
        return false;
      }
    }
    return true;
  }

  private iconsEqual(a: IconPath, b: IconPath): boolean {
    if (a === b) return true;
    if (!a || !b) return false;
    if (this.areStringsEqual(a, b)) return true;
    if (this.areThemeIconsEqual(a, b)) return true;
    if (this.areUrisEqual(a, b)) return true;
    if (this.areLightDarkIconSetsEqual(a, b)) return true;
    return false;
  }

  private applySimpleUpdates(
    target: Record<string, unknown>,
    updates: Array<[string, unknown, boolean?]>
  ): boolean {
    let changed = false;
    for (const [key, value, compareAsString] of updates) {
      if (this.updateIfChanged(target, key, value, compareAsString ?? false)) {
        changed = true;
      }
    }
    return changed;
  }

  private updateIfChanged(
    target: Record<string, unknown>,
    key: string,
    value: unknown,
    compareAsString: boolean
  ): boolean {
    const current = target[key];
    const equal = compareAsString
      ? String(current ?? "") === String(value ?? "")
      : current === value;
    if (equal) {
      return false;
    }
    target[key] = value;
    return true;
  }

  private areStringsEqual(a: IconPath, b: IconPath): boolean {
    return typeof a === "string" && typeof b === "string" && a === b;
  }

  private areThemeIconsEqual(a: IconPath, b: IconPath): boolean {
    if (!(a instanceof vscode.ThemeIcon) || !(b instanceof vscode.ThemeIcon)) {
      return false;
    }
    const colorA = a.color?.id ?? a.color?.toString();
    const colorB = b.color?.id ?? b.color?.toString();
    return a.id === b.id && colorA === colorB;
  }

  private areUrisEqual(a: IconPath, b: IconPath): boolean {
    return a instanceof vscode.Uri && b instanceof vscode.Uri && a.toString() === b.toString();
  }

  private areLightDarkIconSetsEqual(a: IconPath, b: IconPath): boolean {
    if (!this.isLightDarkIcon(a) || !this.isLightDarkIcon(b)) {
      return false;
    }
    return this.iconsEqual(a.light, b.light) && this.iconsEqual(a.dark, b.dark);
  }

  private isLightDarkIcon(value: IconPath): value is LightDarkIcon {
    return typeof value === "object" && !!value && "light" in value && "dark" in value;
  }

  private treeItemEquals(a?: vscode.TreeItem, b?: vscode.TreeItem): boolean {
    if (!a && !b) return true;
    if (!a || !b) return false;

    if (String(a.label) !== String(b.label)) return false;
    if (a.tooltip !== b.tooltip) return false;
    if (a.collapsibleState !== b.collapsibleState) return false;
    if (!this.iconsEqual(a.iconPath, b.iconPath)) return false;

    // Check link property for SshxLink and GottyLink nodes
    const aLink =
      "link" in a ? (a as c.ClabSshxLinkTreeNode | c.ClabGottyLinkTreeNode).link : undefined;
    const bLink =
      "link" in b ? (b as c.ClabSshxLinkTreeNode | c.ClabGottyLinkTreeNode).link : undefined;
    if (aLink || bLink) {
      return aLink === bLink;
    }

    return true;
  }

  /**
   * Convert detailed container data to the simpler format used by the existing code.
   * This maintains backward compatibility while adding new fields.
   */
  private convertDetailedToSimpleFormat(
    detailedData: Record<string, c.ClabDetailedJSON[]>
  ): Record<string, c.ClabJSON[]> {
    const result: Record<string, c.ClabJSON[]> = {};

    // Process each lab
    for (const labName in detailedData) {
      if (!Array.isArray(detailedData[labName])) continue;

      result[labName] = detailedData[labName].map((container) => {
        const status = this.computeContainerStatus(container);

        // Construct IPv4 and IPv6 addresses with prefix length
        let ipv4Address = "N/A";
        if (
          container.NetworkSettings.IPv4addr &&
          container.NetworkSettings.IPv4pLen !== undefined
        ) {
          ipv4Address = `${container.NetworkSettings.IPv4addr}/${container.NetworkSettings.IPv4pLen}`;
        }

        let ipv6Address = "N/A";
        if (
          container.NetworkSettings.IPv6addr &&
          container.NetworkSettings.IPv6pLen !== undefined
        ) {
          ipv6Address = `${container.NetworkSettings.IPv6addr}/${container.NetworkSettings.IPv6pLen}`;
        }

        // Extract name from Names array or Labels
        const name = container.Names[0] || container.Labels["clab-node-longname"];
        // Always get absolute lab path
        const absLabPath = container.Labels["clab-topo-file"];

        // Convert to the simpler format
        return {
          container_id: container.ShortID,
          image: container.Image,
          ipv4_address: ipv4Address,
          ipv6_address: ipv6Address,
          kind: container.Labels["clab-node-kind"],
          lab_name: labName,
          labPath: absLabPath,
          absLabPath: absLabPath,
          name: name,
          name_short: container.Labels["clab-node-name"],
          owner: container.Labels["clab-owner"],
          state: container.State,
          status: status,
          node_type: container.Labels["clab-node-type"] || undefined,
          node_group: container.Labels["clab-node-group"] || undefined,
          network_name: container.NetworkName || undefined,
          startedAt: container.StartedAt
        };
      });
    }

    return result;
  }

  private computeContainerStatus(container: c.ClabDetailedJSON): string {
    const rawStatus = container.Status?.trim() ?? "";

    if (container.State === "running") {
      const suffix = this.extractStatusSuffix(rawStatus);
      if (typeof container.StartedAt === "number") {
        const uptime = this.formatUptime(container.StartedAt);
        return suffix ? `${uptime} ${suffix}` : uptime;
      }
      return rawStatus || "Running";
    }

    return rawStatus || this.formatStateLabel(container.State);
  }

  private extractStatusSuffix(status: string): string | undefined {
    if (!status) {
      return undefined;
    }
    const trimmed = status.trim();
    const openIdx = trimmed.lastIndexOf("(");
    const closeIdx = trimmed.lastIndexOf(")");
    if (openIdx === -1 || closeIdx === -1 || closeIdx <= openIdx) {
      return undefined;
    }
    return trimmed.slice(openIdx, closeIdx + 1);
  }

  private formatStateLabel(state?: string): string {
    if (!state) {
      return "Unknown";
    }
    const normalized = state.replace(/[_-]+/g, " ");
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }

  private formatUptime(startedAt: number): string {
    const elapsedMs = Math.max(0, Date.now() - startedAt);
    if (elapsedMs < 60000) {
      return "Up less than a minute";
    }

    const totalMinutes = Math.floor(elapsedMs / 60000);
    if (totalMinutes < 60) {
      return `Up ${this.formatQuantity(totalMinutes, "minute")}`;
    }

    const totalHours = Math.floor(totalMinutes / 60);
    if (totalHours < 24) {
      const remainingMinutes = totalMinutes % 60;
      const hoursPart = this.formatQuantity(totalHours, "hour");
      if (remainingMinutes > 0) {
        return `Up ${hoursPart} ${this.formatQuantity(remainingMinutes, "minute")}`;
      }
      return `Up ${hoursPart}`;
    }

    const totalDays = Math.floor(totalHours / 24);
    const remainingHours = totalHours % 24;
    const daysPart = this.formatQuantity(totalDays, "day");
    if (remainingHours > 0) {
      return `Up ${daysPart} ${this.formatQuantity(remainingHours, "hour")}`;
    }
    return `Up ${daysPart}`;
  }

  private formatQuantity(value: number, unit: string): string {
    const quantity = Math.max(1, Math.floor(value));
    const suffix = quantity === 1 ? unit : `${unit}s`;
    return `${quantity} ${suffix}`;
  }

  public async discoverInspectLabs(): Promise<Record<string, c.ClabLabTreeNode> | undefined> {
    const inspectData = await this.getInspectData(); // This now properly handles both formats

    // --- Normalize inspectData into a flat list of containers ---
    const allContainers = this.normalizeInspectData(inspectData);

    if (!inspectData || !allContainers) {
      this.labsSnapshot = undefined;
      return undefined;
    }

    // If after normalization, we have no containers, return undefined
    if (allContainers.length === 0) {
      this.labsSnapshot = undefined;
      return undefined;
    }

    await this.refreshSessionLists(allContainers);

    // --- Process the flat allContainers list ---
    const labs = this.buildLabsFromContainers(allContainers);

    this.labsSnapshot = labs;
    return labs;
  }

  private normalizeInspectData(
    inspectData:
      | c.ClabJSON[]
      | Record<string, c.ClabJSON[]>
      | { containers: c.ClabJSON[] }
      | undefined
  ): c.ClabJSON[] | undefined {
    if (!inspectData) {
      outputChannel.info(
        "[RunningLabTreeDataProvider] Inspect data is empty or in an unexpected format."
      );
      return undefined;
    }

    const allContainers: c.ClabJSON[] = [];
    if (Array.isArray(inspectData)) {
      return inspectData;
    }
    if ("containers" in inspectData && Array.isArray(inspectData.containers)) {
      return inspectData.containers;
    }
    if (typeof inspectData === "object" && Object.keys(inspectData).length > 0) {
      for (const labName in inspectData) {
        const labContainers = (inspectData as Record<string, c.ClabJSON[]>)[labName];
        if (Array.isArray(labContainers)) allContainers.push(...labContainers);
      }
      return allContainers;
    }
    outputChannel.info(
      "[RunningLabTreeDataProvider] Inspect data is empty or in an unexpected format."
    );
    return undefined;
  }

  private async refreshSessionLists(allContainers: c.ClabJSON[]) {
    const sshxLabs = new Set(
      allContainers.filter((c) => (c.name || "").includes("sshx")).map((c) => c.lab_name)
    );
    const missingSessions = Array.from(sshxLabs).filter((lab) => !sshxSessions.has(lab));
    if (missingSessions.length > 0) await refreshSshxSessions();

    const gottyLabs = new Set(
      allContainers.filter((c) => (c.name || "").includes("gotty")).map((c) => c.lab_name)
    );
    const missingGottySessions = Array.from(gottyLabs).filter((lab) => !gottySessions.has(lab));
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

  private createLabNode(
    container: c.ClabJSON,
    allContainers: c.ClabJSON[],
    normPath: string
  ): c.ClabLabTreeNode {
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

  private getContainerHealth(containers: c.ClabContainerTreeNode[]): {
    running: number;
    unhealthy: number;
  } {
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
    if (running === total && total > 0 && unhealthy === 0) {
      return c.CtrStateIcons.RUNNING;
    }
    if (running > 0 && running < total && unhealthy === 0) {
      return c.CtrStateIcons.PARTIAL;
    }
    // Red/Stopped for all non-healthy states (all stopped, unhealthy, or unknown mix)
    return c.CtrStateIcons.STOPPED;
  }

  private decorateSharing(
    labNode: c.ClabLabTreeNode,
    relativePath: string,
    sshxLink?: string,
    gottyLink?: string
  ) {
    if (sshxLink) {
      labNode.sshxNode = new c.ClabSshxLinkTreeNode(labNode.name!, sshxLink);
      labNode.description = `${relativePath} (Shared)`;
    } else if (gottyLink) {
      labNode.gottyNode = new c.ClabGottyLinkTreeNode(labNode.name!, gottyLink);
      labNode.description = `${relativePath} (Shared)`;
    } else {
      labNode.description = relativePath;
    }
  }

  private async getInspectData(): Promise<c.ClabJSON[] | Record<string, c.ClabJSON[]> | undefined> {
    const parsedData = ins.rawInspectData;

    if (!parsedData) {
      return parsedData;
    }

    // Determine the format of the returned data
    // Check if it's an array (old flat format) or an object with lab keys (new grouped format)
    const isOldFlatFormat = Array.isArray(parsedData);
    const isNewGroupedFormat =
      !isOldFlatFormat &&
      typeof parsedData === "object" &&
      Object.keys(parsedData).length > 0 &&
      Object.values(parsedData).some((val) => Array.isArray(val));

    // Check if we have the detailed format (contains Labels property)
    let hasDetailedFormat = false;

    if (isOldFlatFormat) {
      // Check first item in array for Labels
      hasDetailedFormat =
        parsedData.length > 0 && "Labels" in (parsedData[0] as Record<string, unknown>);
    } else if (isNewGroupedFormat) {
      // Check first container in first lab
      const groupedData = parsedData as Record<string, unknown[]>;
      for (const labName in groupedData) {
        const labContainers = groupedData[labName];
        if (
          Array.isArray(labContainers) &&
          labContainers.length > 0 &&
          "Labels" in (labContainers[0] as Record<string, unknown>)
        ) {
          hasDetailedFormat = true;
          break;
        }
      }
    }

    // If we have detailed format, convert it to the standard format
    if (hasDetailedFormat) {
      if (isOldFlatFormat) {
        // Convert flat array to lab-grouped format first
        const grouped = this.convertFlatToGroupedFormat(parsedData as c.ClabDetailedJSON[]);
        return this.convertDetailedToSimpleFormat(grouped);
      } else {
        // Already lab-grouped, just convert the format
        return this.convertDetailedToSimpleFormat(
          parsedData as unknown as Record<string, c.ClabDetailedJSON[]>
        );
      }
    }

    // Return as-is if not detailed format (might already be in simple format)
    return parsedData as unknown as c.ClabJSON[] | Record<string, c.ClabJSON[]>;
  }

  /**
   * Convert a flat array of containers to a lab-grouped format
   */
  private convertFlatToGroupedFormat(
    flatContainers: c.ClabDetailedJSON[]
  ): Record<string, c.ClabDetailedJSON[]> {
    const result: Record<string, c.ClabDetailedJSON[]> = {};

    for (const container of flatContainers) {
      // Extract lab name from the container
      const labName = container.Labels["containerlab"] || "unknown";

      // Initialize array for this lab if it doesn't exist
      if (!result[labName]) {
        result[labName] = [];
      }

      // Add container to the lab group
      result[labName].push(container);
    }

    return result;
  }

  private buildTooltipParts(container: c.ClabJSON): string[] {
    const tooltipParts = [
      `Name: ${container.name_short || container.name}`,
      `State: ${container.state}`,
      `Status: ${container.status || "Unknown"}`,
      `Kind: ${container.kind}`,
      `Type: ${container.node_type || "Unknown"}`,
      `Image: ${container.image}`,
      `ID: ${container.container_id}`
    ];

    if (container.node_group && container.node_group.trim() !== "") {
      tooltipParts.push(`Group: ${container.node_group}`);
    }

    const v4Addr = container.ipv4_address?.split("/")[0];
    if (v4Addr && v4Addr !== "N/A") {
      tooltipParts.push(`IPv4: ${v4Addr}`);
    }

    const v6Addr = container.ipv6_address?.split("/")[0];
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
  private discoverContainers(
    containersForThisLab: c.ClabJSON[],
    absLabPath: string
  ): c.ClabContainerTreeNode[] {
    let containerNodes: c.ClabContainerTreeNode[] = [];

    containersForThisLab.forEach((container: c.ClabJSON) => {
      const name_short = container.name_short || container.name.replace(/^clab-[^-]+-/, "");
      const tooltipParts = this.buildTooltipParts(container);
      const icon = this.getContainerIcon(container);

      const interfaces = this.discoverContainerInterfaces(
        container.name,
        container.container_id
      ).sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));

      const collapsible =
        interfaces.length > 0
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
    return containerNodes.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  }

  private discoverContainerInterfaces(
    cName: string,
    cID: string,
    logToOutput: boolean = false
  ): c.ClabInterfaceTreeNode[] {
    if (logToOutput) {
      outputChannel.debug(`Inspecting interfaces for container: ${cName} (${cID})`);
    }
    const snapshot = ins.getInterfacesSnapshot(cID, cName);
    const interfaces = this.buildInterfaceNodes(snapshot, cName, cID);
    if (logToOutput) {
      outputChannel.debug(
        `Interface snapshot retrieved: ${cName} - ${interfaces.length} interfaces`
      );
    }
    return interfaces;
  }

  private buildInterfaceNodes(
    clabInsJSON: ClabInterfaceSnapshot[],
    cName: string,
    cID: string
  ): c.ClabInterfaceTreeNode[] {
    const interfaces: c.ClabInterfaceTreeNode[] = [];

    if (!(clabInsJSON && clabInsJSON.length > 0 && Array.isArray(clabInsJSON[0].interfaces))) {
      console.warn(
        `[RunningLabTreeDataProvider]: Unexpected JSON structure from inspect interfaces for ${cName}`
      );
      return interfaces;
    }

    clabInsJSON[0].interfaces.forEach((intf) => {
      if (intf.state === "unknown" || intf.name === "lo") return;

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
        case "up":
          iconLight = this.getResourceUri(c.IntfStateIcons.UP);
          iconDark = this.getResourceUri(c.IntfStateIcons.UP);
          break;
        case "down":
          iconLight = this.getResourceUri(c.IntfStateIcons.DOWN);
          iconDark = this.getResourceUri(c.IntfStateIcons.DOWN);
          break;
        default:
          iconLight = this.getResourceUri(c.IntfStateIcons.LIGHT);
          iconDark = this.getResourceUri(c.IntfStateIcons.DARK);
          break;
      }

      const stats = this.extractInterfaceStats(intf);

      const netemState = {
        delay: intf.netemDelay,
        jitter: intf.netemJitter,
        loss: intf.netemLoss,
        rate: intf.netemRate,
        corruption: intf.netemCorruption
      };

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
        contextValue,
        stats,
        netemState
      );

      // Note: Interface stats are not shown in tooltip because tooltips are
      // cached to prevent dismissal during tree refreshes, so stats would be stale

      node.tooltip = tooltipParts.join("\n");
      node.description = description;
      node.iconPath = { light: iconLight, dark: iconDark };

      interfaces.push(node);
    });

    return interfaces;
  }

  // getInterfaceContextValue remains unchanged
  private getInterfaceContextValue(state: string): string {
    return state === "up" ? "containerlabInterfaceUp" : "containerlabInterfaceDown";
  }

  private extractInterfaceStats(intf: ClabInterfaceSnapshotEntry): ClabInterfaceStats | undefined {
    const stats: ClabInterfaceStats = {};
    const assign = (key: keyof ClabInterfaceStats, value: number | undefined) => {
      if (typeof value === "number" && Number.isFinite(value)) {
        stats[key] = value;
      }
    };

    assign("rxBps", intf.rxBps);
    assign("rxPps", intf.rxPps);
    assign("rxBytes", intf.rxBytes);
    assign("rxPackets", intf.rxPackets);
    assign("txBps", intf.txBps);
    assign("txPps", intf.txPps);
    assign("txBytes", intf.txBytes);
    assign("txPackets", intf.txPackets);
    assign("statsIntervalSeconds", intf.statsIntervalSeconds);

    return Object.keys(stats).length > 0 ? stats : undefined;
  }

  // getResourceUri remains unchanged
  private getResourceUri(resource: string) {
    return vscode.Uri.file(this.context.asAbsolutePath(path.join("resources", resource)));
  }
}
