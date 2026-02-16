import type * as vscode from "vscode";

import type {
  HelpFeedbackProvider,
  LocalLabTreeDataProvider,
  RunningLabTreeDataProvider
} from "../../treeView";
import {
  EXPLORER_SECTION_LABELS,
  EXPLORER_SECTION_ORDER,
  type ExplorerAction,
  type ExplorerNode,
  type ExplorerSectionId,
  type ExplorerSectionSnapshot,
  type ExplorerSnapshotMessage
} from "../shared/explorer/types";

interface ExplorerTreeProvider {
  getChildren(element?: unknown): vscode.ProviderResult<vscode.TreeItem[] | undefined>;
}

type ExplorerTreeItemLike = vscode.TreeItem & {
  id?: string;
  contextValue?: string;
  command?: vscode.Command;
  state?: string;
  status?: string;
  link?: string;
};

export interface ExplorerSnapshotProviders {
  runningProvider: RunningLabTreeDataProvider;
  localProvider: LocalLabTreeDataProvider;
  helpProvider: HelpFeedbackProvider;
}

export interface ExplorerSnapshotOptions {
  hideNonOwnedLabs: boolean;
  isLocalCaptureAllowed: boolean;
}

export interface ExplorerActionInvocation {
  commandId: string;
  args: unknown[];
}

export interface ExplorerSnapshotBuildResult {
  snapshot: ExplorerSnapshotMessage;
  actionBindings: Map<string, ExplorerActionInvocation>;
}

const COMMAND_LABELS: Record<string, string> = {
  "containerlab.refresh": "Refresh",
  "containerlab.lab.openFile": "Edit Topology",
  "containerlab.editor.topoViewerEditor.open": "Edit Topology (TopoViewer)",
  "containerlab.lab.copyPath": "Copy File Path",
  "containerlab.lab.addToWorkspace": "Add To Workspace",
  "containerlab.lab.openFolderInNewWindow": "Open Folder In New Window",
  "containerlab.lab.toggleFavorite": "Toggle Favorite",
  "containerlab.lab.deploy": "Deploy",
  "containerlab.lab.deploy.cleanup": "Deploy (Cleanup)",
  "containerlab.lab.destroy": "Destroy",
  "containerlab.lab.destroy.cleanup": "Destroy (Cleanup)",
  "containerlab.lab.redeploy": "Redeploy",
  "containerlab.lab.redeploy.cleanup": "Redeploy (Cleanup)",
  "containerlab.lab.save": "Save Configs",
  "containerlab.lab.delete": "Delete Lab File",
  "containerlab.lab.sshToAllNodes": "SSH To All Nodes",
  "containerlab.inspectOneLab": "Inspect",
  "containerlab.lab.sshx.attach": "Attach SSHX Session",
  "containerlab.lab.sshx.detach": "Detach SSHX Session",
  "containerlab.lab.sshx.reattach": "Reattach SSHX Session",
  "containerlab.lab.gotty.attach": "Attach GoTTY Session",
  "containerlab.lab.gotty.detach": "Detach GoTTY Session",
  "containerlab.lab.gotty.reattach": "Reattach GoTTY Session",
  "containerlab.lab.sshx.copyLink": "Copy SSHX Link",
  "containerlab.lab.gotty.copyLink": "Copy GoTTY Link",
  "containerlab.lab.graph.topoViewer": "Open TopoViewer",
  "containerlab.lab.graph.drawio.horizontal": "Graph (draw.io, Horizontal)",
  "containerlab.lab.graph.drawio.vertical": "Graph (draw.io, Vertical)",
  "containerlab.lab.graph.drawio.interactive": "Graph (draw.io, Interactive)",
  "containerlab.node.start": "Start Node",
  "containerlab.node.stop": "Stop Node",
  "containerlab.node.pause": "Pause Node",
  "containerlab.node.unpause": "Unpause Node",
  "containerlab.node.save": "Save Node Config",
  "containerlab.node.attachShell": "Attach Shell",
  "containerlab.node.ssh": "SSH",
  "containerlab.node.telnet": "Telnet",
  "containerlab.node.showLogs": "Show Logs",
  "containerlab.node.manageImpairments": "Manage Impairments",
  "containerlab.node.openBrowser": "Open Browser",
  "containerlab.node.copyName": "Copy Node Name",
  "containerlab.node.copyID": "Copy Node ID",
  "containerlab.node.copyIPv4Address": "Copy IPv4 Address",
  "containerlab.node.copyIPv6Address": "Copy IPv6 Address",
  "containerlab.node.copyKind": "Copy Node Kind",
  "containerlab.node.copyImage": "Copy Node Image",
  "containerlab.interface.capture": "Capture",
  "containerlab.interface.captureWithEdgeshark": "Capture With Edgeshark",
  "containerlab.interface.captureWithEdgesharkVNC": "Capture With Edgeshark VNC",
  "containerlab.interface.setDelay": "Set Delay",
  "containerlab.interface.setJitter": "Set Jitter",
  "containerlab.interface.setLoss": "Set Loss",
  "containerlab.interface.setRate": "Set Rate",
  "containerlab.interface.setCorruption": "Set Corruption",
  "containerlab.interface.copyMACAddress": "Copy MAC Address",
  "containerlab.lab.fcli.bgpPeers": "Run fcli bgp-peers",
  "containerlab.lab.fcli.bgpRib": "Run fcli bgp-rib",
  "containerlab.lab.fcli.ipv4Rib": "Run fcli ipv4-rib",
  "containerlab.lab.fcli.lldp": "Run fcli lldp",
  "containerlab.lab.fcli.mac": "Run fcli mac",
  "containerlab.lab.fcli.ni": "Run fcli ni",
  "containerlab.lab.fcli.subif": "Run fcli subif",
  "containerlab.lab.fcli.sysInfo": "Run fcli sys-info",
  "containerlab.lab.fcli.custom": "Run Custom fcli",
  "containerlab.lab.deploy.specificFile": "Deploy Lab File",
  "containerlab.inspectAll": "Inspect All Labs",
  "containerlab.treeView.runningLabs.hideNonOwnedLabs": "Hide Non-Owned Labs",
  "containerlab.treeView.runningLabs.showNonOwnedLabs": "Show Non-Owned Labs",
  "containerlab.treeView.runningLabs.filter": "Filter Running Labs",
  "containerlab.treeView.runningLabs.clearFilter": "Clear Running Labs Filter",
  "containerlab.editor.topoViewerEditor": "New Topology File",
  "containerlab.lab.cloneRepo": "Clone Repository",
  "containerlab.treeView.localLabs.filter": "Filter Local Labs",
  "containerlab.treeView.localLabs.clearFilter": "Clear Local Labs Filter"
};

const DESTRUCTIVE_COMMANDS = new Set<string>([
  "containerlab.lab.delete",
  "containerlab.lab.destroy",
  "containerlab.lab.destroy.cleanup",
  "containerlab.lab.sshx.detach",
  "containerlab.lab.gotty.detach"
]);
const SECTION_BUILD_TIMEOUT_MS = 4000;
const TREE_ITEM_COLLAPSIBLE_NONE = 0;

function labelToText(label: string | vscode.TreeItemLabel | undefined): string {
  if (!label) {
    return "";
  }
  return typeof label === "string" ? label : label.label;
}

function descriptionToText(description: string | boolean | undefined): string | undefined {
  if (typeof description === "string" && description.trim().length > 0) {
    return description;
  }
  return undefined;
}

function tooltipToText(tooltip: vscode.MarkdownString | string | undefined): string | undefined {
  if (typeof tooltip === "string") {
    return tooltip;
  }
  if (
    tooltip &&
    typeof tooltip === "object" &&
    "value" in tooltip &&
    typeof (tooltip as { value?: unknown }).value === "string"
  ) {
    return (tooltip as { value: string }).value;
  }
  return undefined;
}

function commandLabel(commandId: string, fallback?: string): string {
  return fallback || COMMAND_LABELS[commandId] || commandId;
}

function isLabContext(contextValue: string | undefined): boolean {
  return typeof contextValue === "string" && contextValue.includes("containerlabLab");
}

function isDeployedLab(contextValue: string | undefined): boolean {
  return typeof contextValue === "string" && contextValue.includes("containerlabLabDeployed");
}

function isUndeployedLab(contextValue: string | undefined): boolean {
  return typeof contextValue === "string" && contextValue.includes("containerlabLabUndeployed");
}

function isFavoriteLab(contextValue: string | undefined): boolean {
  return typeof contextValue === "string" && contextValue.includes("Favorite");
}

function shouldHideNodeDescription(contextValue: string | undefined): boolean {
  return isLabContext(contextValue);
}

function labStatusIndicatorFromChildren(children: ExplorerNode[]): ExplorerNode["statusIndicator"] {
  const containers = children.filter((child) => child.contextValue === "containerlabContainer");
  if (containers.length === 0) {
    return undefined;
  }

  let healthyRunning = 0;
  let notRunning = 0;
  let unhealthyRunning = 0;

  for (const container of containers) {
    if (container.statusIndicator === "green") {
      healthyRunning += 1;
      continue;
    }
    if (container.statusIndicator === "yellow") {
      unhealthyRunning += 1;
      continue;
    }
    notRunning += 1;
  }

  if (healthyRunning === containers.length) {
    return "green";
  }
  if (healthyRunning > 0 && notRunning > 0 && unhealthyRunning === 0) {
    return "yellow";
  }
  return "red";
}

function getStatusIndicator(item: ExplorerTreeItemLike): ExplorerNode["statusIndicator"] {
  const context = item.contextValue;
  if (context === "containerlabInterfaceUp") {
    return "green";
  }
  if (context === "containerlabInterfaceDown") {
    return "red";
  }
  if (context === "containerlabContainer") {
    const state = String(item.state ?? "").toLowerCase();
    const status = String(item.status ?? "").toLowerCase();
    if (state === "running" && (status.includes("unhealthy") || status.includes("health: starting"))) {
      return "yellow";
    }
    if (state === "running") {
      return "green";
    }
    return "red";
  }
  return undefined;
}

class ExplorerActionRegistry {
  private counter = 0;
  private readonly bindings = new Map<string, ExplorerActionInvocation>();

  public createAction(
    commandId: string,
    label: string,
    args: unknown[] = [],
    destructive = false
  ): ExplorerAction {
    const actionRef = `action:${this.counter++}`;
    this.bindings.set(actionRef, { commandId, args });
    return {
      id: `${commandId}:${label}:${actionRef}`,
      actionRef,
      label,
      commandId,
      destructive
    };
  }

  public getBindings(): Map<string, ExplorerActionInvocation> {
    return this.bindings;
  }
}

function pushAction(
  actions: ExplorerAction[],
  seen: Set<string>,
  registry: ExplorerActionRegistry,
  commandId: string,
  args: unknown[] = [],
  label?: string,
  destructive?: boolean
): void {
  const resolvedLabel = commandLabel(commandId, label);
  const key = `${commandId}:${resolvedLabel}`;
  if (seen.has(key)) {
    return;
  }

  seen.add(key);
  actions.push(
    registry.createAction(
      commandId,
      resolvedLabel,
      args,
      destructive ?? DESTRUCTIVE_COMMANDS.has(commandId)
    )
  );
}

function primaryActionFromTreeItem(
  item: ExplorerTreeItemLike,
  registry: ExplorerActionRegistry
): ExplorerAction | undefined {
  const command = item.command;
  if (!command?.command) {
    return undefined;
  }

  const args = Array.isArray(command.arguments) ? command.arguments : [];
  return registry.createAction(
    command.command,
    commandLabel(command.command, command.title || undefined),
    args,
    DESTRUCTIVE_COMMANDS.has(command.command)
  );
}

function getLinkArgument(item: ExplorerTreeItemLike): string | undefined {
  const link = item.link;
  if (typeof link === "string" && link.length > 0) {
    return link;
  }
  return undefined;
}

function appendLabActions(
  actions: ExplorerAction[],
  seen: Set<string>,
  registry: ExplorerActionRegistry,
  sectionId: ExplorerSectionId,
  item: ExplorerTreeItemLike
): void {
  const contextValue = item.contextValue;
  const isDeployed = isDeployedLab(contextValue);
  const isUndeployed = isUndeployedLab(contextValue);
  const isFavorite = isFavoriteLab(contextValue);

  pushAction(actions, seen, registry, "containerlab.lab.openFile", [item]);
  pushAction(actions, seen, registry, "containerlab.lab.copyPath", [item]);
  pushAction(actions, seen, registry, "containerlab.lab.openFolderInNewWindow", [item]);

  if (isUndeployed) {
    pushAction(
      actions,
      seen,
      registry,
      "containerlab.editor.topoViewerEditor.open",
      [item],
      "Edit Topology (TopoViewer)"
    );
  }

  if (contextValue === "containerlabLabDeployed") {
    pushAction(actions, seen, registry, "containerlab.lab.addToWorkspace", [item]);
  }

  pushAction(
    actions,
    seen,
    registry,
    "containerlab.lab.toggleFavorite",
    [item],
    isFavorite ? "Remove From Favorites" : "Add To Favorites"
  );

  if (isUndeployed) {
    pushAction(actions, seen, registry, "containerlab.lab.deploy", [item]);
    pushAction(actions, seen, registry, "containerlab.lab.deploy.cleanup", [item]);
    pushAction(actions, seen, registry, "containerlab.lab.delete", [item], undefined, true);
  }

  if (isDeployed) {
    pushAction(actions, seen, registry, "containerlab.lab.destroy", [item], undefined, true);
    pushAction(actions, seen, registry, "containerlab.lab.destroy.cleanup", [item], undefined, true);
    pushAction(actions, seen, registry, "containerlab.lab.redeploy", [item]);
    pushAction(actions, seen, registry, "containerlab.lab.redeploy.cleanup", [item]);
    pushAction(actions, seen, registry, "containerlab.lab.save", [item]);
    pushAction(actions, seen, registry, "containerlab.inspectOneLab", [item]);
    pushAction(actions, seen, registry, "containerlab.lab.sshToAllNodes", [item]);
    pushAction(actions, seen, registry, "containerlab.lab.sshx.attach", [item]);
    pushAction(actions, seen, registry, "containerlab.lab.sshx.detach", [item], undefined, true);
    pushAction(actions, seen, registry, "containerlab.lab.sshx.reattach", [item]);
    pushAction(actions, seen, registry, "containerlab.lab.gotty.attach", [item]);
    pushAction(actions, seen, registry, "containerlab.lab.gotty.detach", [item], undefined, true);
    pushAction(actions, seen, registry, "containerlab.lab.gotty.reattach", [item]);
    pushAction(actions, seen, registry, "containerlab.lab.fcli.bgpPeers", [item]);
    pushAction(actions, seen, registry, "containerlab.lab.fcli.bgpRib", [item]);
    pushAction(actions, seen, registry, "containerlab.lab.fcli.ipv4Rib", [item]);
    pushAction(actions, seen, registry, "containerlab.lab.fcli.lldp", [item]);
    pushAction(actions, seen, registry, "containerlab.lab.fcli.mac", [item]);
    pushAction(actions, seen, registry, "containerlab.lab.fcli.ni", [item]);
    pushAction(actions, seen, registry, "containerlab.lab.fcli.subif", [item]);
    pushAction(actions, seen, registry, "containerlab.lab.fcli.sysInfo", [item]);
    pushAction(actions, seen, registry, "containerlab.lab.fcli.custom", [item]);
  }

  pushAction(actions, seen, registry, "containerlab.lab.graph.drawio.horizontal", [item]);
  pushAction(actions, seen, registry, "containerlab.lab.graph.drawio.vertical", [item]);
  pushAction(actions, seen, registry, "containerlab.lab.graph.drawio.interactive", [item]);
  pushAction(actions, seen, registry, "containerlab.lab.graph.topoViewer", [item]);

  if (sectionId === "localLabs" && !isDeployed && !isUndeployed) {
    // Keep local section behavior consistent for edge nodes without known lab context.
    pushAction(actions, seen, registry, "containerlab.lab.openFile", [item]);
  }
}

function appendContainerActions(
  actions: ExplorerAction[],
  seen: Set<string>,
  registry: ExplorerActionRegistry,
  item: ExplorerTreeItemLike
): void {
  pushAction(actions, seen, registry, "containerlab.node.showLogs", [item]);
  pushAction(actions, seen, registry, "containerlab.node.attachShell", [item]);
  pushAction(actions, seen, registry, "containerlab.node.ssh", [item]);
  pushAction(actions, seen, registry, "containerlab.node.telnet", [item]);
  pushAction(actions, seen, registry, "containerlab.node.openBrowser", [item]);
  pushAction(actions, seen, registry, "containerlab.node.start", [item]);
  pushAction(actions, seen, registry, "containerlab.node.stop", [item]);
  pushAction(actions, seen, registry, "containerlab.node.pause", [item]);
  pushAction(actions, seen, registry, "containerlab.node.unpause", [item]);
  pushAction(actions, seen, registry, "containerlab.node.save", [item]);
  pushAction(actions, seen, registry, "containerlab.node.manageImpairments", [item]);
  pushAction(actions, seen, registry, "containerlab.node.copyName", [item]);
  pushAction(actions, seen, registry, "containerlab.node.copyID", [item]);
  pushAction(actions, seen, registry, "containerlab.node.copyIPv4Address", [item]);
  pushAction(actions, seen, registry, "containerlab.node.copyIPv6Address", [item]);
  pushAction(actions, seen, registry, "containerlab.node.copyKind", [item]);
  pushAction(actions, seen, registry, "containerlab.node.copyImage", [item]);
}

function appendInterfaceActions(
  actions: ExplorerAction[],
  seen: Set<string>,
  registry: ExplorerActionRegistry,
  item: ExplorerTreeItemLike,
  isLocalCaptureAllowed: boolean
): void {
  if (isLocalCaptureAllowed) {
    pushAction(actions, seen, registry, "containerlab.interface.capture", [item]);
  }
  pushAction(actions, seen, registry, "containerlab.interface.captureWithEdgeshark", [item]);
  pushAction(actions, seen, registry, "containerlab.interface.captureWithEdgesharkVNC", [item]);
  pushAction(actions, seen, registry, "containerlab.interface.setDelay", [item]);
  pushAction(actions, seen, registry, "containerlab.interface.setJitter", [item]);
  pushAction(actions, seen, registry, "containerlab.interface.setLoss", [item]);
  pushAction(actions, seen, registry, "containerlab.interface.setRate", [item]);
  pushAction(actions, seen, registry, "containerlab.interface.setCorruption", [item]);
  pushAction(actions, seen, registry, "containerlab.interface.copyMACAddress", [item]);
}

function appendLinkActions(
  actions: ExplorerAction[],
  seen: Set<string>,
  registry: ExplorerActionRegistry,
  item: ExplorerTreeItemLike
): void {
  const linkArg = getLinkArgument(item);
  if (item.contextValue === "containerlabSSHXLink" && linkArg) {
    pushAction(actions, seen, registry, "containerlab.lab.sshx.copyLink", [linkArg]);
  } else if (item.contextValue === "containerlabGottyLink" && linkArg) {
    pushAction(actions, seen, registry, "containerlab.lab.gotty.copyLink", [linkArg]);
  }
}

function getNodeActions(
  sectionId: ExplorerSectionId,
  item: ExplorerTreeItemLike,
  registry: ExplorerActionRegistry,
  options: ExplorerSnapshotOptions
): ExplorerAction[] {
  const actions: ExplorerAction[] = [];
  const seen = new Set<string>();
  const primaryAction = primaryActionFromTreeItem(item, registry);
  if (primaryAction) {
    actions.push(primaryAction);
    seen.add(`${primaryAction.commandId}:${primaryAction.label}`);
  }

  const contextValue = item.contextValue;
  if (isLabContext(contextValue)) {
    appendLabActions(actions, seen, registry, sectionId, item);
    return actions;
  }

  if (contextValue === "containerlabContainer") {
    appendContainerActions(actions, seen, registry, item);
    return actions;
  }

  if (contextValue === "containerlabInterfaceUp") {
    appendInterfaceActions(actions, seen, registry, item, options.isLocalCaptureAllowed);
    return actions;
  }

  if (contextValue === "containerlabSSHXLink" || contextValue === "containerlabGottyLink") {
    appendLinkActions(actions, seen, registry, item);
  }

  return actions;
}

async function getProviderChildren(
  provider: ExplorerTreeProvider,
  element?: ExplorerTreeItemLike
): Promise<ExplorerTreeItemLike[]> {
  const result = await Promise.resolve(provider.getChildren(element));
  if (!Array.isArray(result)) {
    return [];
  }
  return result as ExplorerTreeItemLike[];
}

function shouldResolveChildren(item: ExplorerTreeItemLike): boolean {
  return item.collapsibleState !== TREE_ITEM_COLLAPSIBLE_NONE;
}

async function buildNode(
  provider: ExplorerTreeProvider,
  item: ExplorerTreeItemLike,
  sectionId: ExplorerSectionId,
  options: ExplorerSnapshotOptions,
  registry: ExplorerActionRegistry,
  pathId: string
): Promise<ExplorerNode> {
  const label = labelToText(item.label);
  const contextValue = item.contextValue;
  const description = shouldHideNodeDescription(contextValue)
    ? undefined
    : descriptionToText(item.description);
  const tooltip = tooltipToText(item.tooltip);
  const childrenItems = shouldResolveChildren(item)
    ? await getProviderChildren(provider, item)
    : [];
  const children = await Promise.all(
    childrenItems.map((child, index) =>
      buildNode(provider, child, sectionId, options, registry, `${pathId}/${index}`)
    )
  );
  const nodeActions = getNodeActions(sectionId, item, registry, options);
  const primaryAction = nodeActions.length > 0 ? nodeActions[0] : undefined;
  const statusIndicator = isDeployedLab(contextValue)
    ? labStatusIndicatorFromChildren(children)
    : getStatusIndicator(item);

  return {
    id: item.id || pathId,
    label,
    description,
    tooltip,
    contextValue,
    statusIndicator,
    statusDescription: description,
    primaryAction,
    actions: nodeActions,
    children
  };
}

async function buildSectionNodes(
  provider: ExplorerTreeProvider,
  sectionId: ExplorerSectionId,
  options: ExplorerSnapshotOptions,
  registry: ExplorerActionRegistry
): Promise<ExplorerNode[]> {
  const roots = await getProviderChildren(provider);
  return Promise.all(
    roots.map((item, index) => buildNode(provider, item, sectionId, options, registry, `${sectionId}/${index}`))
  );
}

function countNodes(nodes: ExplorerNode[], predicate: (node: ExplorerNode) => boolean): number {
  let total = 0;
  for (const node of nodes) {
    if (predicate(node)) {
      total += 1;
    }
    total += countNodes(node.children, predicate);
  }
  return total;
}

function countForSection(sectionId: ExplorerSectionId, nodes: ExplorerNode[]): number {
  if (sectionId === "runningLabs") {
    return countNodes(nodes, (node) => isDeployedLab(node.contextValue));
  }
  if (sectionId === "localLabs") {
    return countNodes(nodes, (node) => isUndeployedLab(node.contextValue));
  }
  return nodes.length;
}

function toolbarActionsForSection(
  sectionId: ExplorerSectionId,
  registry: ExplorerActionRegistry,
  options: ExplorerSnapshotOptions
): ExplorerAction[] {
  const actions: ExplorerAction[] = [];
  const seen = new Set<string>();

  if (sectionId === "runningLabs") {
    pushAction(actions, seen, registry, "containerlab.lab.deploy.specificFile");
    pushAction(actions, seen, registry, "containerlab.inspectAll");
    if (options.hideNonOwnedLabs) {
      pushAction(actions, seen, registry, "containerlab.treeView.runningLabs.showNonOwnedLabs");
    } else {
      pushAction(actions, seen, registry, "containerlab.treeView.runningLabs.hideNonOwnedLabs");
    }
    return actions;
  }

  if (sectionId === "localLabs") {
    pushAction(actions, seen, registry, "containerlab.editor.topoViewerEditor");
    pushAction(actions, seen, registry, "containerlab.lab.cloneRepo");
  }

  return actions;
}

async function buildSectionSnapshot(
  sectionId: ExplorerSectionId,
  provider: ExplorerTreeProvider,
  options: ExplorerSnapshotOptions,
  registry: ExplorerActionRegistry
): Promise<ExplorerSectionSnapshot> {
  const nodes = await buildSectionNodes(provider, sectionId, options, registry);
  return {
    id: sectionId,
    label: EXPLORER_SECTION_LABELS[sectionId],
    count: countForSection(sectionId, nodes),
    nodes,
    toolbarActions: toolbarActionsForSection(sectionId, registry, options)
  };
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);

    promise.then(
      (result) => {
        clearTimeout(timer);
        resolve(result);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

async function buildSectionSnapshotSafe(
  sectionId: ExplorerSectionId,
  provider: ExplorerTreeProvider,
  options: ExplorerSnapshotOptions,
  registry: ExplorerActionRegistry
): Promise<ExplorerSectionSnapshot> {
  try {
    return await withTimeout(
      buildSectionSnapshot(sectionId, provider, options, registry),
      SECTION_BUILD_TIMEOUT_MS,
      `Timed out while building section '${sectionId}'`
    );
  } catch (error: unknown) {
    console.error(`[containerlab explorer] failed to build section '${sectionId}'`, error);
    return {
      id: sectionId,
      label: EXPLORER_SECTION_LABELS[sectionId],
      count: 0,
      nodes: [],
      toolbarActions: toolbarActionsForSection(sectionId, registry, options)
    };
  }
}

export async function buildExplorerSnapshot(
  providers: ExplorerSnapshotProviders,
  filterText: string,
  options: ExplorerSnapshotOptions
): Promise<ExplorerSnapshotBuildResult> {
  const registry = new ExplorerActionRegistry();
  const providersBySection: Record<ExplorerSectionId, ExplorerTreeProvider> = {
    runningLabs: providers.runningProvider,
    localLabs: providers.localProvider,
    helpFeedback: providers.helpProvider
  };

  const sections = await Promise.all(
    EXPLORER_SECTION_ORDER.map((sectionId) =>
      buildSectionSnapshotSafe(sectionId, providersBySection[sectionId], options, registry)
    )
  );

  return {
    snapshot: {
      command: "snapshot",
      filterText,
      sections
    },
    actionBindings: registry.getBindings()
  };
}
