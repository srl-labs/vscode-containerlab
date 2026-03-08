import * as vscode from "vscode";

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
  state?: string;
  status?: string;
  link?: string;
};

interface LabShareInfo {
  kind: "sshx" | "gotty";
  url: string;
}

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
  "containerlab.editor.topoViewerEditor": "New Topology File",
  "containerlab.lab.cloneRepo": "Clone Repository"
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
const CONTAINER_NODE_CONTEXT_MENU_ID = "containerlab/node/context";
const LEGACY_VIEW_ITEM_CONTEXT_MENU_ID = "view/item/context";
const LEGACY_NODE_CONTEXT_WHEN_REGEX =
  /\bviewItem\s*==\s*["']?containerlabContainer(?:Group)?["']?\b/;
const BUILTIN_CONTAINER_ACTION_COMMANDS: readonly string[] = [
  "containerlab.node.showLogs",
  "containerlab.node.attachShell",
  "containerlab.node.ssh",
  "containerlab.node.telnet",
  "containerlab.node.openBrowser",
  "containerlab.node.start",
  "containerlab.node.stop",
  "containerlab.node.pause",
  "containerlab.node.unpause",
  "containerlab.node.save",
  "containerlab.node.manageImpairments",
  "containerlab.node.copyName",
  "containerlab.node.copyID",
  "containerlab.node.copyIPv4Address",
  "containerlab.node.copyIPv6Address",
  "containerlab.node.copyKind",
  "containerlab.node.copyImage"
];

interface ContributedMenuItem {
  commandId: string;
  when?: string;
  label?: string;
  iconId?: string;
}

interface ContributedContainerActions {
  commands: ContributedMenuItem[];
  commandLabels: Map<string, string>;
  commandIcons: Map<string, string>;
}

interface ExtensionContributes {
  menus?: unknown;
  commands?: unknown;
}

let contributedContainerActionsCache: ContributedContainerActions | undefined;
let contributedContainerActionsCachePromise: Promise<ContributedContainerActions> | undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function extractCommandId(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (!isRecord(value)) {
    return undefined;
  }

  const id = asNonEmptyString(value.id);
  if (id !== undefined) {
    return id;
  }

  return asNonEmptyString(value.command);
}

function extractCommandLabel(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (!isRecord(value)) {
    return undefined;
  }

  const title = asNonEmptyString(value.title);
  if (title !== undefined) {
    return title;
  }

  return asNonEmptyString(value.value);
}

function parseThemeIconId(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  const match = /^\$\(([^)]+)\)$/u.exec(trimmed);
  if (!match) {
    return undefined;
  }

  const iconWithModifiers = match[1];
  if (iconWithModifiers.length === 0) {
    return undefined;
  }

  const [iconId] = iconWithModifiers.split("~");
  return iconId.length > 0 ? iconId : undefined;
}

function extractCommandIconId(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const icon = value.icon;
  if (typeof icon === "string") {
    return parseThemeIconId(icon);
  }

  if (isRecord(icon)) {
    return asNonEmptyString(icon.id);
  }

  return undefined;
}

function parseContributedMenuItem(value: unknown): ContributedMenuItem | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const commandField = value.command;
  const commandId = extractCommandId(commandField);
  if (commandId === undefined) {
    return undefined;
  }

  let label = extractCommandLabel(value.title);
  if (label === undefined && isRecord(commandField)) {
    label = extractCommandLabel(commandField.title);
  }
  const iconId = isRecord(commandField)
    ? (extractCommandIconId(commandField) ?? extractCommandIconId(value))
    : extractCommandIconId(value);

  return {
    commandId,
    when: asNonEmptyString(value.when),
    label,
    iconId
  };
}

function parseContributedMenuItems(value: unknown): ContributedMenuItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const items: ContributedMenuItem[] = [];
  for (const candidate of value) {
    const item = parseContributedMenuItem(candidate);
    if (item !== undefined) {
      items.push(item);
    }
  }
  return items;
}

function getExtensionContributes(
  extension: vscode.Extension<unknown>
): ExtensionContributes | undefined {
  const packageJson: unknown = extension.packageJSON;
  if (!isRecord(packageJson)) {
    return undefined;
  }

  const contributes = packageJson.contributes;
  if (!isRecord(contributes)) {
    return undefined;
  }

  return contributes as ExtensionContributes;
}

function getPackageContributionItems(menuId: string): ContributedMenuItem[] {
  const items: ContributedMenuItem[] = [];

  for (const extension of vscode.extensions.all) {
    const contributes = getExtensionContributes(extension);
    if (contributes === undefined || !isRecord(contributes.menus)) {
      continue;
    }

    const menuItems = parseContributedMenuItems(contributes.menus[menuId]);
    if (menuItems.length > 0) {
      items.push(...menuItems);
    }
  }

  return items;
}

async function getContributedMenuItems(menuId: string): Promise<ContributedMenuItem[]> {
  try {
    const result = await vscode.commands.executeCommand<unknown>(
      "_builtin.getContributedMenuItems",
      menuId
    );
    const parsed = parseContributedMenuItems(result);
    if (parsed.length > 0) {
      return parsed;
    }
  } catch {
    // Fall back to extension package contributions when the internal command is unavailable.
  }

  return getPackageContributionItems(menuId);
}

function buildCommandMetadataMaps(): { labels: Map<string, string>; icons: Map<string, string> } {
  const labels = new Map<string, string>();
  const icons = new Map<string, string>();

  for (const extension of vscode.extensions.all) {
    const contributes = getExtensionContributes(extension);
    if (contributes === undefined) {
      continue;
    }

    let commands: unknown[] = [];
    const commandsContribution = contributes.commands;
    if (Array.isArray(commandsContribution)) {
      commands = commandsContribution;
    } else if (commandsContribution !== undefined) {
      commands = [commandsContribution];
    }

    for (const commandContribution of commands) {
      if (!isRecord(commandContribution)) {
        continue;
      }

      const commandId = asNonEmptyString(commandContribution.command);
      if (commandId === undefined) {
        continue;
      }

      const label = extractCommandLabel(commandContribution.title);
      if (label !== undefined && !labels.has(commandId)) {
        labels.set(commandId, label);
      }

      const iconId = extractCommandIconId(commandContribution);
      if (iconId !== undefined && !icons.has(commandId)) {
        icons.set(commandId, iconId);
      }
    }
  }

  return { labels, icons };
}

function dedupeMenuItems(items: ContributedMenuItem[]): ContributedMenuItem[] {
  const deduped: ContributedMenuItem[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    if (seen.has(item.commandId)) {
      continue;
    }
    seen.add(item.commandId);
    deduped.push(item);
  }

  return deduped;
}

function legacyViewItemMatchesContainer(when: string | undefined): boolean {
  if (when === undefined) {
    return false;
  }

  return LEGACY_NODE_CONTEXT_WHEN_REGEX.test(when);
}

async function computeContributedContainerActions(): Promise<ContributedContainerActions> {
  const { labels: commandLabels, icons: commandIcons } = buildCommandMetadataMaps();
  const menuItems = await getContributedMenuItems(CONTAINER_NODE_CONTEXT_MENU_ID);
  const legacyMenuItems = (await getContributedMenuItems(LEGACY_VIEW_ITEM_CONTEXT_MENU_ID)).filter(
    (item) => legacyViewItemMatchesContainer(item.when)
  );
  const commands = dedupeMenuItems([...menuItems, ...legacyMenuItems]);

  for (const item of commands) {
    if (item.label !== undefined && !commandLabels.has(item.commandId)) {
      commandLabels.set(item.commandId, item.label);
    }
    if (item.iconId !== undefined && !commandIcons.has(item.commandId)) {
      commandIcons.set(item.commandId, item.iconId);
    }
  }

  return {
    commands,
    commandLabels,
    commandIcons
  };
}

async function getContributedContainerActions(): Promise<ContributedContainerActions> {
  if (contributedContainerActionsCache !== undefined) {
    return contributedContainerActionsCache;
  }

  contributedContainerActionsCachePromise ??= computeContributedContainerActions()
    .catch((error: unknown) => {
      console.error("[containerlab explorer] failed to resolve contributed node actions", error);
      return {
        commands: [],
        commandLabels: new Map<string, string>(),
        commandIcons: new Map<string, string>()
      };
    })
    .finally(() => {
      contributedContainerActionsCachePromise = undefined;
    });

  contributedContainerActionsCache = await contributedContainerActionsCachePromise;
  return contributedContainerActionsCache;
}

export function invalidateExplorerContributionCache(): void {
  contributedContainerActionsCache = undefined;
  contributedContainerActionsCachePromise = undefined;
}

function labelToText(label: string | vscode.TreeItemLabel | undefined): string {
  if (label === undefined) {
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
  return (fallback ?? COMMAND_LABELS[commandId]) || commandId;
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

function collectContainerIndicators(children: ExplorerNode[]): ExplorerNode["statusIndicator"][] {
  const indicators: ExplorerNode["statusIndicator"][] = [];
  for (const child of children) {
    if (child.contextValue === "containerlabContainer") {
      indicators.push(child.statusIndicator);
    } else if (child.contextValue === "containerlabContainerGroup") {
      // Recurse into group children to get actual container indicators
      indicators.push(...collectContainerIndicators(child.children));
    }
  }
  return indicators;
}

function aggregateStatusFromIndicators(
  indicators: ExplorerNode["statusIndicator"][]
): ExplorerNode["statusIndicator"] {
  if (indicators.length === 0) {
    return undefined;
  }

  let healthyRunning = 0;
  let notRunning = 0;
  let unhealthyRunning = 0;

  for (const indicator of indicators) {
    if (indicator === "green") {
      healthyRunning += 1;
      continue;
    }
    if (indicator === "yellow") {
      unhealthyRunning += 1;
      continue;
    }
    notRunning += 1;
  }

  if (healthyRunning === indicators.length) {
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
    if (
      state === "running" &&
      (status.includes("unhealthy") || status.includes("health: starting"))
    ) {
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
    destructive = false,
    iconId?: string
  ): ExplorerAction {
    const actionRef = `action:${this.counter++}`;
    this.bindings.set(actionRef, { commandId, args });
    return {
      id: `${commandId}:${label}:${actionRef}`,
      actionRef,
      label,
      commandId,
      iconId,
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
  destructive?: boolean,
  iconId?: string
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
      destructive ?? DESTRUCTIVE_COMMANDS.has(commandId),
      iconId
    )
  );
}

function getLinkArgument(item: ExplorerTreeItemLike): string | undefined {
  const link = item.link;
  if (typeof link === "string" && link.length > 0) {
    return link;
  }
  return undefined;
}

function isShareLinkNode(contextValue: string | undefined): boolean {
  return contextValue === "containerlabSSHXLink" || contextValue === "containerlabGottyLink";
}

function getLabShareInfo(childrenItems: ExplorerTreeItemLike[]): LabShareInfo | undefined {
  let sshxUrl: string | undefined;
  let gottyUrl: string | undefined;

  for (const child of childrenItems) {
    const contextValue = child.contextValue;
    if (contextValue === "containerlabSSHXLink") {
      sshxUrl = getLinkArgument(child);
      continue;
    }
    if (contextValue === "containerlabGottyLink") {
      gottyUrl = getLinkArgument(child);
    }
  }

  if (sshxUrl !== undefined && sshxUrl.length > 0) {
    return { kind: "sshx", url: sshxUrl };
  }
  if (gottyUrl !== undefined && gottyUrl.length > 0) {
    return { kind: "gotty", url: gottyUrl };
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
    pushAction(
      actions,
      seen,
      registry,
      "containerlab.lab.destroy.cleanup",
      [item],
      undefined,
      true
    );
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
  item: ExplorerTreeItemLike,
  contributedActions: ContributedMenuItem[],
  commandLabels: ReadonlyMap<string, string>,
  commandIcons: ReadonlyMap<string, string>
): void {
  for (const commandId of BUILTIN_CONTAINER_ACTION_COMMANDS) {
    pushAction(actions, seen, registry, commandId, [item]);
  }

  const existingCommands = new Set(actions.map((action) => action.commandId));
  for (const contributedAction of contributedActions) {
    if (existingCommands.has(contributedAction.commandId)) {
      continue;
    }

    pushAction(
      actions,
      seen,
      registry,
      contributedAction.commandId,
      [item],
      commandLabels.get(contributedAction.commandId),
      undefined,
      commandIcons.get(contributedAction.commandId)
    );
    existingCommands.add(contributedAction.commandId);
  }
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
  if (item.contextValue === "containerlabSSHXLink" && linkArg !== undefined && linkArg.length > 0) {
    pushAction(actions, seen, registry, "containerlab.lab.sshx.copyLink", [linkArg]);
  } else if (
    item.contextValue === "containerlabGottyLink" &&
    linkArg !== undefined &&
    linkArg.length > 0
  ) {
    pushAction(actions, seen, registry, "containerlab.lab.gotty.copyLink", [linkArg]);
  }
}

function appendHelpFeedbackActions(
  actions: ExplorerAction[],
  seen: Set<string>,
  registry: ExplorerActionRegistry,
  item: ExplorerTreeItemLike
): void {
  const linkArg = getLinkArgument(item);
  if (linkArg === undefined || linkArg.length === 0) {
    return;
  }
  pushAction(actions, seen, registry, "containerlab.openLink", [linkArg], "Open Link");
}

function getNodeActions(
  sectionId: ExplorerSectionId,
  item: ExplorerTreeItemLike,
  registry: ExplorerActionRegistry,
  options: ExplorerSnapshotOptions,
  contributedActions: ContributedMenuItem[],
  commandLabels: ReadonlyMap<string, string>,
  commandIcons: ReadonlyMap<string, string>
): ExplorerAction[] {
  const actions: ExplorerAction[] = [];
  const seen = new Set<string>();

  const contextValue = item.contextValue;
  if (sectionId === "helpFeedback") {
    appendHelpFeedbackActions(actions, seen, registry, item);
    return actions;
  }

  if (isLabContext(contextValue)) {
    appendLabActions(actions, seen, registry, sectionId, item);
    return actions;
  }

  if (contextValue === "containerlabContainer" || contextValue === "containerlabContainerGroup") {
    appendContainerActions(
      actions,
      seen,
      registry,
      item,
      contributedActions,
      commandLabels,
      commandIcons
    );
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

function resolvePrimaryAction(
  contextValue: string | undefined,
  nodeActions: ExplorerAction[]
): ExplorerAction | undefined {
  if (isLabContext(contextValue)) {
    return nodeActions.find((action) => action.commandId === "containerlab.lab.graph.topoViewer");
  }

  if (
    contextValue === "containerlabContainer" ||
    contextValue === "containerlabContainerGroup" ||
    contextValue === "containerlabInterfaceUp" ||
    contextValue === "containerlabInterfaceDown" ||
    isShareLinkNode(contextValue)
  ) {
    return undefined;
  }

  return nodeActions.length > 0 ? nodeActions[0] : undefined;
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
  contributedActions: ContributedMenuItem[],
  commandLabels: ReadonlyMap<string, string>,
  commandIcons: ReadonlyMap<string, string>,
  pathId: string
): Promise<ExplorerNode> {
  const contextValue = item.contextValue;
  const rawLabel = labelToText(item.label);
  const label = isLabContext(contextValue) ? rawLabel.replace(/^🔗\s*/u, "") : rawLabel;
  const description = shouldHideNodeDescription(contextValue)
    ? undefined
    : descriptionToText(item.description);
  const tooltip = tooltipToText(item.tooltip);
  const rawChildrenItems = shouldResolveChildren(item)
    ? await getProviderChildren(provider, item)
    : [];
  const shareInfo = isLabContext(contextValue) ? getLabShareInfo(rawChildrenItems) : undefined;
  const childrenItems = isLabContext(contextValue)
    ? rawChildrenItems.filter((child) => !isShareLinkNode(child.contextValue))
    : rawChildrenItems;
  const children = await Promise.all(
    childrenItems.map((child, index) =>
      buildNode(
        provider,
        child,
        sectionId,
        options,
        registry,
        contributedActions,
        commandLabels,
        commandIcons,
        `${pathId}/${index}`
      )
    )
  );
  const nodeActions = getNodeActions(
    sectionId,
    item,
    registry,
    options,
    contributedActions,
    commandLabels,
    commandIcons
  );
  if (shareInfo) {
    const copyCommandId =
      shareInfo.kind === "sshx"
        ? "containerlab.lab.sshx.copyLink"
        : "containerlab.lab.gotty.copyLink";
    const hasCopyAction = nodeActions.some((action) => action.commandId === copyCommandId);
    if (!hasCopyAction) {
      nodeActions.push(
        registry.createAction(
          copyCommandId,
          commandLabel(copyCommandId),
          [shareInfo.url],
          DESTRUCTIVE_COMMANDS.has(copyCommandId)
        )
      );
    }
  }
  let shareAction: ExplorerAction | undefined;
  if (shareInfo) {
    const label = shareInfo.kind === "sshx" ? "Open Shared Terminal" : "Open Web Terminal";
    shareAction = registry.createAction("containerlab.openLink", label, [shareInfo.url]);
  } else {
    shareAction = undefined;
  }
  const primaryAction = resolvePrimaryAction(contextValue, nodeActions);
  const statusIndicator =
    isDeployedLab(contextValue) || contextValue === "containerlabContainerGroup"
      ? aggregateStatusFromIndicators(collectContainerIndicators(children))
      : getStatusIndicator(item);

  return {
    id: item.id ?? pathId,
    label,
    description,
    tooltip,
    contextValue,
    statusIndicator,
    statusDescription: description,
    primaryAction,
    shareAction,
    actions: nodeActions,
    children
  };
}

async function buildSectionNodes(
  provider: ExplorerTreeProvider,
  sectionId: ExplorerSectionId,
  options: ExplorerSnapshotOptions,
  registry: ExplorerActionRegistry,
  contributedActions: ContributedMenuItem[],
  commandLabels: ReadonlyMap<string, string>,
  commandIcons: ReadonlyMap<string, string>
): Promise<ExplorerNode[]> {
  const roots = await getProviderChildren(provider);
  return Promise.all(
    roots.map((item, index) =>
      buildNode(
        provider,
        item,
        sectionId,
        options,
        registry,
        contributedActions,
        commandLabels,
        commandIcons,
        `${sectionId}/${index}`
      )
    )
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
  registry: ExplorerActionRegistry,
  contributedActions: ContributedMenuItem[],
  commandLabels: ReadonlyMap<string, string>,
  commandIcons: ReadonlyMap<string, string>
): Promise<ExplorerSectionSnapshot> {
  const nodes = await buildSectionNodes(
    provider,
    sectionId,
    options,
    registry,
    contributedActions,
    commandLabels,
    commandIcons
  );
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
  registry: ExplorerActionRegistry,
  contributedActions: ContributedMenuItem[],
  commandLabels: ReadonlyMap<string, string>,
  commandIcons: ReadonlyMap<string, string>
): Promise<ExplorerSectionSnapshot> {
  try {
    return await withTimeout(
      buildSectionSnapshot(
        sectionId,
        provider,
        options,
        registry,
        contributedActions,
        commandLabels,
        commandIcons
      ),
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
  const {
    commands: contributedActions,
    commandLabels,
    commandIcons
  } = await getContributedContainerActions();
  const providersBySection: Record<ExplorerSectionId, ExplorerTreeProvider> = {
    runningLabs: providers.runningProvider,
    localLabs: providers.localProvider,
    helpFeedback: providers.helpProvider
  };

  const sections = await Promise.all(
    EXPLORER_SECTION_ORDER.map((sectionId) =>
      buildSectionSnapshotSafe(
        sectionId,
        providersBySection[sectionId],
        options,
        registry,
        contributedActions,
        commandLabels,
        commandIcons
      )
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
