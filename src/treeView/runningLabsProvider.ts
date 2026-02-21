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
  outputChannel,
} from "../globals";
import { refreshSshxSessions, refreshGottySessions } from "../services/sessionRefresh";
import { getCurrentTopoViewer } from "../commands/graph";
import type {
  ClabInterfaceSnapshot,
  ClabInterfaceSnapshotEntry,
  ClabInterfaceStats,
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

type RunningTreeNode =
  | c.ClabLabTreeNode
  | c.ClabContainerTreeNode
  | c.ClabContainerGroupTreeNode
  | c.ClabInterfaceTreeNode;

interface LabDiscoveryResult {
  rootChanged: boolean;
  labsToRefresh: Set<c.ClabLabTreeNode>;
  containersToRefresh: Set<c.ClabContainerTreeNode>;
}

type ContainerListEntry = c.ClabContainerTreeNode | c.ClabContainerGroupTreeNode;

interface ContainerMergeState {
  orderedEntries: ContainerListEntry[];
  containersToRefresh: Set<c.ClabContainerTreeNode>;
  branchStructureChanged: boolean;
}

type LinkTreeNode = c.ClabSshxLinkTreeNode | c.ClabGottyLinkTreeNode;

function hasNonEmptyString(value: string | undefined): value is string {
  return value !== undefined && value !== "";
}

function isLinkTreeNode(item: vscode.TreeItem): item is LinkTreeNode {
  return "link" in item && typeof item.link === "string";
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
    ).sort((a, b) => a.name.localeCompare(b.name));

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
      const entries = lab.containers ?? [];
      const found = this.flattenContainerNodes(entries).find(
        (container) => container.cID === containerShortId
      );
      if (found) {
        return found;
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
    if (element instanceof c.ClabContainerGroupTreeNode) return element.children;
    if (element instanceof c.ClabContainerTreeNode) return this.getContainerChildren(element);
    return undefined;
  }

  async getRootChildrenCount(): Promise<number> {
    if (!this.treeItems.length) {
      await this.discoverLabs();
    }
    return this.getRootChildren().length;
  }

  private getRootChildren(): RunningTreeNode[] {
    const labs = hideNonOwnedLabsState
      ? this.treeItems.filter((labNode) => labNode.owner == username)
      : this.treeItems;

    return this.treeFilter ? this.filterLabs(labs, this.treeFilter) : labs;
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
    const containers = lab.containers ?? [];
    return containers.some((cn) => {
      if (cn instanceof c.ClabContainerGroupTreeNode) {
        return (
          filter(String(cn.label)) ||
          cn.children.some(
            (child) =>
              filter(String(child.label)) || child.interfaces.some((it) => filter(String(it.label)))
          )
        );
      }
      return filter(String(cn.label)) || cn.interfaces.some((it) => filter(String(it.label)));
    });
  }

  private getLabChildren(element: c.ClabLabTreeNode) {
    let containers: (
      | c.ClabContainerTreeNode
      | c.ClabContainerGroupTreeNode
      | c.ClabSshxLinkTreeNode
      | c.ClabGottyLinkTreeNode
    )[] = element.containers ?? [];
    if (element.sshxNode) containers = [element.sshxNode, ...containers];
    if (element.gottyNode) containers = [element.gottyNode, ...containers];
    if (!this.treeFilter) return containers;

    const filter = FilterUtils.createFilter(this.treeFilter);
    const labMatch = filter(String(element.label));
    if (labMatch) return containers;

    return containers.filter((cn) => {
      if (cn instanceof c.ClabContainerGroupTreeNode) {
        return this.groupMatchesFilter(cn, filter);
      }
      if (cn instanceof c.ClabContainerTreeNode) {
        return this.containerMatchesFilter(cn, filter);
      }
      // Keep link nodes when filtering
      return true;
    });
  }

  private groupMatchesFilter(
    group: c.ClabContainerGroupTreeNode,
    filter: ReturnType<typeof FilterUtils.createFilter>
  ): boolean {
    if (filter(String(group.label))) return true;
    return group.children.some((cn) => this.containerMatchesFilter(cn, filter));
  }

  private containerMatchesFilter(
    cn: c.ClabContainerTreeNode,
    filter: ReturnType<typeof FilterUtils.createFilter>
  ): boolean {
    if (filter(String(cn.label))) return true; // Keep entire container with all interfaces
    const ifaces = cn.interfaces;
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
      const isADeployed = a.contextValue?.startsWith("containerlabLabDeployed") === true;
      const isBDeployed = b.contextValue?.startsWith("containerlabLabDeployed") === true;

      if (isADeployed && !isBDeployed) {
        return -1;
      }
      if (!isADeployed && isBDeployed) {
        return 1;
      }

      const aPath = a.labPath.absolute;
      const bPath = b.labPath.absolute;
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
    if (target.favorite !== source.favorite) {
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
      containersToRefresh: Array.from(containersToRefresh),
    };
  }

  private mergeContainerLists(
    targetLab: c.ClabLabTreeNode,
    sourceLab: c.ClabLabTreeNode
  ): {
    containersToRefresh: c.ClabContainerTreeNode[];
    branchStructureChanged: boolean;
  } {
    const { existingContainers, existingGroups } = this.buildExistingContainerMaps(
      targetLab.containers ?? []
    );
    const state = this.createContainerMergeState();

    for (const incoming of sourceLab.containers ?? []) {
      this.mergeIncomingContainerEntry(incoming, existingContainers, existingGroups, state);
    }

    if (existingContainers.size > 0 || existingGroups.size > 0) {
      state.branchStructureChanged = true;
    }

    targetLab.containers = state.orderedEntries;

    return {
      containersToRefresh: Array.from(state.containersToRefresh),
      branchStructureChanged: state.branchStructureChanged,
    };
  }

  private buildExistingContainerMaps(entries: ContainerListEntry[]): {
    existingContainers: Map<string, c.ClabContainerTreeNode>;
    existingGroups: Map<string, c.ClabContainerGroupTreeNode>;
  } {
    const existingContainers = new Map<string, c.ClabContainerTreeNode>();
    const existingGroups = new Map<string, c.ClabContainerGroupTreeNode>();

    for (const entry of entries) {
      if (entry instanceof c.ClabContainerGroupTreeNode) {
        existingGroups.set(entry.rootNodeName, entry);
      } else {
        existingContainers.set(this.getNodeKey(entry), entry);
      }
    }

    return { existingContainers, existingGroups };
  }

  private createContainerMergeState(): ContainerMergeState {
    return {
      orderedEntries: [],
      containersToRefresh: new Set<c.ClabContainerTreeNode>(),
      branchStructureChanged: false,
    };
  }

  private mergeIncomingContainerEntry(
    incoming: ContainerListEntry,
    existingContainers: Map<string, c.ClabContainerTreeNode>,
    existingGroups: Map<string, c.ClabContainerGroupTreeNode>,
    state: ContainerMergeState
  ): void {
    if (incoming instanceof c.ClabContainerGroupTreeNode) {
      this.mergeIncomingGroup(incoming, existingGroups, state);
      return;
    }

    this.mergeIncomingContainer(incoming, existingContainers, state);
  }

  private mergeIncomingGroup(
    incoming: c.ClabContainerGroupTreeNode,
    existingGroups: Map<string, c.ClabContainerGroupTreeNode>,
    state: ContainerMergeState
  ): void {
    const existingGroup = existingGroups.get(incoming.rootNodeName);
    if (!existingGroup) {
      state.branchStructureChanged = true;
      state.orderedEntries.push(incoming);
      return;
    }

    const groupMerge = this.mergeGroupChildren(existingGroup, incoming);
    if (groupMerge.changed) {
      state.branchStructureChanged = true;
    }
    groupMerge.containersToRefresh.forEach((container) => state.containersToRefresh.add(container));

    // Keep existing group node identity while updating display attributes.
    existingGroup.iconPath = incoming.iconPath;
    state.orderedEntries.push(existingGroup);
    existingGroups.delete(incoming.rootNodeName);
  }

  private mergeIncomingContainer(
    incoming: c.ClabContainerTreeNode,
    existingContainers: Map<string, c.ClabContainerTreeNode>,
    state: ContainerMergeState
  ): void {
    const key = this.getNodeKey(incoming);
    const existing = existingContainers.get(key);
    if (!existing) {
      state.branchStructureChanged = true;
      state.orderedEntries.push(incoming);
      return;
    }

    const result = this.updateContainerNode(existing, incoming);
    if (result.changed || result.structureChanged) {
      state.containersToRefresh.add(existing);
    }
    state.orderedEntries.push(existing);
    existingContainers.delete(key);
  }

  private mergeGroupChildren(
    target: c.ClabContainerGroupTreeNode,
    source: c.ClabContainerGroupTreeNode
  ): {
    changed: boolean;
    containersToRefresh: c.ClabContainerTreeNode[];
  } {
    const existingChildren = new Map<string, c.ClabContainerTreeNode>(
      target.children.map((child) => [this.getNodeKey(child), child])
    );
    const orderedChildren: c.ClabContainerTreeNode[] = [];
    const containersToRefresh: Set<c.ClabContainerTreeNode> = new Set();
    let changed = false;

    for (const incoming of source.children) {
      const key = this.getNodeKey(incoming);
      const existing = existingChildren.get(key);

      if (existing) {
        const result = this.updateContainerNode(existing, incoming);
        if (result.changed || result.structureChanged) {
          containersToRefresh.add(existing);
        }
        orderedChildren.push(existing);
        existingChildren.delete(key);
      } else {
        changed = true;
        orderedChildren.push(incoming);
      }
    }

    if (existingChildren.size > 0) {
      changed = true;
    }

    target.children = orderedChildren;

    return {
      changed,
      containersToRefresh: Array.from(containersToRefresh),
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
      this.applySimpleUpdates(target, [
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
        ["nodeGroup", source.nodeGroup],
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
      target.interfaces.map((intf) => [intf.name, intf])
    );
    const orderedInterfaces: c.ClabInterfaceTreeNode[] = [];
    let changed = false;
    let structureChanged = false;

    for (const incoming of source.interfaces) {
      const key = this.getNodeKey(incoming);
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
      this.applySimpleUpdates(target, [
        ["label", source.label, true],
        ["description", source.description, true],
        ["contextValue", source.contextValue],
        ["cID", source.cID],
        ["state", source.state],
        ["type", source.type],
        ["alias", source.alias],
        ["mac", source.mac],
        ["mtu", source.mtu],
        ["ifIndex", source.ifIndex],
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

  private getNodeKey(node: { name?: string; label?: vscode.TreeItemLabel | string }): string {
    return node.name ?? String(node.label ?? "");
  }

  private areObjectValuesEqual<T extends object>(a: T | undefined, b: T | undefined): boolean {
    if (a === undefined && b === undefined) return true;
    if (a === undefined || b === undefined) return false;
    const aEntries = Object.entries(a);
    const bEntries = new Map(Object.entries(b));
    if (aEntries.length !== bEntries.size) {
      return false;
    }
    for (const [key, value] of aEntries) {
      if (!bEntries.has(key) || bEntries.get(key) !== value) {
        return false;
      }
    }
    return true;
  }

  private iconsEqual(a: IconPath, b: IconPath): boolean {
    if (a === b) return true;
    if (a === undefined || b === undefined) return false;
    if (this.areStringsEqual(a, b)) return true;
    if (this.areThemeIconsEqual(a, b)) return true;
    if (this.areUrisEqual(a, b)) return true;
    if (this.areLightDarkIconSetsEqual(a, b)) return true;
    return false;
  }

  private applySimpleUpdates(target: object, updates: Array<[string, unknown, boolean?]>): boolean {
    let changed = false;
    for (const [key, value, compareAsString] of updates) {
      if (this.updateIfChanged(target, key, value, compareAsString ?? false)) {
        changed = true;
      }
    }
    return changed;
  }

  private updateIfChanged(
    target: object,
    key: string,
    value: unknown,
    compareAsString: boolean
  ): boolean {
    const current = Reflect.get(target, key) as unknown;
    const equal = compareAsString
      ? String(current ?? "") === String(value ?? "")
      : current === value;
    if (equal) {
      return false;
    }
    Reflect.set(target, key, value);
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
    return typeof value === "object" && "light" in value && "dark" in value;
  }

  private treeItemEquals(a?: vscode.TreeItem, b?: vscode.TreeItem): boolean {
    if (!a && !b) return true;
    if (!a || !b) return false;

    if (String(a.label) !== String(b.label)) return false;
    if (a.tooltip !== b.tooltip) return false;
    if (a.collapsibleState !== b.collapsibleState) return false;
    if (!this.iconsEqual(a.iconPath, b.iconPath)) return false;

    // Check link property for SshxLink and GottyLink nodes
    const aLink = isLinkTreeNode(a) ? a.link : undefined;
    const bLink = isLinkTreeNode(b) ? b.link : undefined;
    if (hasNonEmptyString(aLink) || hasNonEmptyString(bLink)) {
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
        const ipv4 = container.NetworkSettings.IPv4addr;
        if (hasNonEmptyString(ipv4) && container.NetworkSettings.IPv4pLen !== undefined) {
          ipv4Address = `${ipv4}/${container.NetworkSettings.IPv4pLen}`;
        }

        let ipv6Address = "N/A";
        const ipv6 = container.NetworkSettings.IPv6addr;
        if (hasNonEmptyString(ipv6) && container.NetworkSettings.IPv6pLen !== undefined) {
          ipv6Address = `${ipv6}/${container.NetworkSettings.IPv6pLen}`;
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
          node_type: container.Labels["clab-node-type"] ?? undefined,
          node_group: container.Labels["clab-node-group"] ?? undefined,
          root_node_name: container.Labels["clab-root-node-name"] ?? undefined,
          network_name: container.NetworkName ?? undefined,
          startedAt: container.StartedAt,
        };
      });
    }

    return result;
  }

  private computeContainerStatus(container: c.ClabDetailedJSON): string {
    const rawStatus = container.Status.trim();

    if (container.State === "running") {
      const suffix = this.extractStatusSuffix(rawStatus);
      if (typeof container.StartedAt === "number") {
        const uptime = this.formatUptime(container.StartedAt);
        return suffix !== undefined ? `${uptime} ${suffix}` : uptime;
      }
      return rawStatus === "" ? "Running" : rawStatus;
    }

    return rawStatus === "" ? this.formatStateLabel(container.State) : rawStatus;
  }

  private extractStatusSuffix(status: string): string | undefined {
    if (status === "") {
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
    if (state === undefined || state === "") {
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

    if (inspectData === undefined || allContainers === undefined) {
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
    if (inspectData === undefined) {
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
      for (const [, labContainers] of Object.entries(inspectData)) {
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
      allContainers.filter((container) => container.name.includes("sshx")).map((c) => c.lab_name)
    );
    const missingSessions = Array.from(sshxLabs).filter((lab) => !sshxSessions.has(lab));
    if (missingSessions.length > 0) await refreshSshxSessions();

    const gottyLabs = new Set(
      allContainers.filter((container) => container.name.includes("gotty")).map((c) => c.lab_name)
    );
    const missingGottySessions = Array.from(gottyLabs).filter((lab) => !gottySessions.has(lab));
    if (missingGottySessions.length > 0) await refreshGottySessions();
  }

  private buildLabsFromContainers(allContainers: c.ClabJSON[]): Record<string, c.ClabLabTreeNode> {
    const labs: Record<string, c.ClabLabTreeNode> = {};
    allContainers.forEach((container: c.ClabJSON) => {
      const normPath = container.absLabPath ?? utils.normalizeLabPath(container.labPath);
      if (!(normPath in labs)) {
        labs[normPath] = this.createLabNode(container, allContainers, normPath);
      }
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
      relative: utils.getRelativeFolderPath(normPath),
    };
    const containersForThisLab = allContainers.filter(
      (c: c.ClabJSON) => (c.absLabPath ?? utils.normalizeLabPath(c.labPath)) === normPath
    );
    const discoveredContainers = this.discoverContainers(containersForThisLab, labPathObj.absolute);
    const flatContainers = this.flattenContainerNodes(discoveredContainers);
    const { running, unhealthy } = this.getContainerHealthFromNodes(flatContainers);
    const icon = this.determineIcon(flatContainers.length, running, unhealthy);
    const isFav = favoriteLabs.has(normPath);
    const contextVal = isFav ? "containerlabLabDeployedFavorite" : "containerlabLabDeployed";
    const sshxLink = sshxSessions.get(container.lab_name);
    const gottyLink = gottySessions.get(container.lab_name);
    let labLabel = label;
    if (hasNonEmptyString(sshxLink) || hasNonEmptyString(gottyLink)) {
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

  private getContainerHealthFromNodes(containers: c.ClabContainerTreeNode[]): {
    running: number;
    unhealthy: number;
  } {
    let running = 0;
    let unhealthy = 0;
    for (const ctr of containers) {
      if (ctr.state === "running") {
        running++;
        const status = ctr.status?.toLowerCase() ?? "";
        if (status.includes("health: starting") || status.includes("unhealthy")) {
          unhealthy++;
        }
      }
    }
    return { running, unhealthy };
  }

  /**
   * Flatten a mixed list of container and group nodes into a flat list of container nodes.
   */
  private flattenContainerNodes(
    nodes: (c.ClabContainerTreeNode | c.ClabContainerGroupTreeNode)[]
  ): c.ClabContainerTreeNode[] {
    const result: c.ClabContainerTreeNode[] = [];
    for (const node of nodes) {
      if (node instanceof c.ClabContainerGroupTreeNode) {
        result.push(...node.children);
      } else {
        result.push(node);
      }
    }
    return result;
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
    if (hasNonEmptyString(sshxLink)) {
      labNode.sshxNode = new c.ClabSshxLinkTreeNode(labNode.name!, sshxLink);
      labNode.description = `${relativePath} (Shared)`;
    } else if (hasNonEmptyString(gottyLink)) {
      labNode.gottyNode = new c.ClabGottyLinkTreeNode(labNode.name!, gottyLink);
      labNode.description = `${relativePath} (Shared)`;
    } else {
      labNode.description = relativePath;
    }
  }

  private async getInspectData(): Promise<c.ClabJSON[] | Record<string, c.ClabJSON[]> | undefined> {
    const parsedData = ins.rawInspectData;

    if (parsedData === undefined) {
      return undefined;
    }
    return this.convertDetailedToSimpleFormat(parsedData);
  }

  private buildTooltipParts(container: c.ClabJSON): string[] {
    const tooltipParts = [
      `Name: ${container.name_short ?? container.name}`,
      `State: ${container.state}`,
      `Status: ${container.status ?? "Unknown"}`,
      `Kind: ${container.kind}`,
      `Type: ${container.node_type ?? "Unknown"}`,
      `Image: ${container.image}`,
      `ID: ${container.container_id}`,
    ];

    if (container.node_group !== undefined && container.node_group.trim() !== "") {
      tooltipParts.push(`Group: ${container.node_group}`);
    }

    const v4Addr = container.ipv4_address.split("/")[0];
    if (v4Addr !== "" && v4Addr !== "N/A") {
      tooltipParts.push(`IPv4: ${v4Addr}`);
    }

    const v6Addr = container.ipv6_address.split("/")[0];
    if (v6Addr !== "" && v6Addr !== "N/A") {
      tooltipParts.push(`IPv6: ${v6Addr}`);
    }

    return tooltipParts;
  }

  private getContainerIcon(container: c.ClabJSON): string {
    if (container.state === "running") {
      const status = container.status?.toLowerCase() ?? "";
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
  ): (c.ClabContainerTreeNode | c.ClabContainerGroupTreeNode)[] {
    let containerNodes: c.ClabContainerTreeNode[] = [];

    containersForThisLab.forEach((container: c.ClabJSON) => {
      const name_short = container.name_short ?? container.name.replace(/^clab-[^-]+-/, "");
      const tooltipParts = this.buildTooltipParts(container);
      const icon = this.getContainerIcon(container);

      const interfaces = this.discoverContainerInterfaces(
        container.name,
        container.container_id
      ).sort((a, b) => a.name.localeCompare(b.name));

      const collapsible =
        interfaces.length > 0
          ? vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.None;

      const label = container.name_short ?? container.name;

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

      node.rootNodeName = container.root_node_name;
      node.description =
        container.status !== undefined && container.status !== "" ? ` ${container.status}` : "";
      node.tooltip = tooltipParts.join("\n");

      const iconPath = this.getResourceUri(icon);
      node.iconPath = { light: iconPath, dark: iconPath };

      containerNodes.push(node);
    });

    // Sort container nodes alphabetically by name
    containerNodes.sort((a, b) => a.name.localeCompare(b.name));

    // Group sub-containers under their root node
    return this.groupContainers(containerNodes, absLabPath);
  }

  /**
   * Group sub-containers (those with rootNodeName) under virtual ClabContainerGroupTreeNode parents.
   * Containers without rootNodeName remain as top-level entries.
   */
  private groupContainers(
    containerNodes: c.ClabContainerTreeNode[],
    absLabPath: string
  ): (c.ClabContainerTreeNode | c.ClabContainerGroupTreeNode)[] {
    const groups = new Map<string, c.ClabContainerTreeNode[]>();
    const ungrouped: c.ClabContainerTreeNode[] = [];

    for (const node of containerNodes) {
      if (node.rootNodeName !== undefined && node.rootNodeName !== "") {
        const existing = groups.get(node.rootNodeName) ?? [];
        existing.push(node);
        groups.set(node.rootNodeName, existing);
      } else {
        ungrouped.push(node);
      }
    }

    const result: (c.ClabContainerTreeNode | c.ClabContainerGroupTreeNode)[] = [...ungrouped];
    for (const [rootName, children] of groups) {
      const labPath: c.LabPath = {
        absolute: absLabPath,
        relative: utils.getRelLabFolderPath(absLabPath),
      };
      const groupNode = new c.ClabContainerGroupTreeNode(rootName, labPath, children);

      // Only show interfaces on the primary (0th) sub-container
      for (let i = 1; i < children.length; i++) {
        children[i].interfaces = [];
        children[i].collapsibleState = vscode.TreeItemCollapsibleState.None;
      }

      // Inherit IP details and identity from the primary (0th) sub-container
      const primary = children[0];
      const namePrefix = primary.name.slice(0, primary.name.length - primary.name_short.length);
      groupNode.name = namePrefix + rootName;
      groupNode.name_short = rootName;
      groupNode.state = primary.state;
      groupNode.kind = primary.kind;
      groupNode.image = primary.image;
      groupNode.v4Address = primary.v4Address;
      groupNode.v6Address = primary.v6Address;
      groupNode.nodeType = primary.nodeType;
      groupNode.nodeGroup = primary.nodeGroup;
      groupNode.status = primary.status;
      groupNode.tooltip = primary.tooltip;
      groupNode.description = primary.description;

      // Compute aggregate status description and icon from children
      const { running, unhealthy } = this.getContainerHealthFromNodes(children);
      const icon = this.determineIcon(children.length, running, unhealthy);
      const iconUri = this.getResourceUri(icon);
      groupNode.iconPath = { light: iconUri, dark: iconUri };

      result.push(groupNode);
    }

    return result.sort((a, b) => String(a.label).localeCompare(String(b.label)));
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

    if (clabInsJSON.length === 0 || !Array.isArray(clabInsJSON[0].interfaces)) {
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
        `MTU: ${intf.mtu}`,
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
        corruption: intf.netemCorruption,
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
