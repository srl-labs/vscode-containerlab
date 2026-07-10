import * as path from "path";

import * as vscode from "vscode";

import type { ApiEndpointManagerState } from "../apiEndpoints/protocol";
import {
  ApiContainerlabBackend,
  apiContainerlabBackendId
} from "../backends/api/apiContainerlabBackend";
import type { ApiTopologyEntry } from "../backends/api/apiOperations";
import { apiLabFavoriteKey, apiTopologySourcePathMatches } from "../backends/labIdentity";
import { getBackendById, listConnectedBackends } from "../backends/manager";
import { favoriteApiLabs } from "../globals";

import {
  ClabContainerGroupTreeNode,
  ClabContainerTreeNode,
  ClabFolderTreeNode,
  ClabLabTreeNode
} from "./common";
import type { ClabGottyLinkTreeNode, ClabInterfaceTreeNode, ClabSshxLinkTreeNode } from "./common";
import type { LocalLabTreeDataProvider } from "./localLabsProvider";
import type { RunningLabTreeDataProvider } from "./runningLabsProvider";

const LOCAL_BACKEND_COMMANDS = [
  "containerlab.editor.topoViewerEditor",
  "containerlab.lab.cloneRepo",
  "containerlab.install.edgeshark",
  "containerlab.uninstall.edgeshark",
  "containerlab.capture.killAllWiresharkVNC",
  "containerlab.set.sessionHostname"
] as const;

type DelegateTreeNode =
  | ClabLabTreeNode
  | ClabFolderTreeNode
  | ClabContainerTreeNode
  | ClabContainerGroupTreeNode
  | ClabInterfaceTreeNode
  | ClabSshxLinkTreeNode
  | ClabGottyLinkTreeNode;

class BackendRootTreeNode extends vscode.TreeItem {
  readonly contextValue: "containerlabEndpoint" | "containerlabLocalWorkspace";
  readonly supportedCommandIds?: readonly string[];

  constructor(
    readonly backendId: string,
    readonly endpointId: string | undefined,
    label: string,
    description: string,
    readonly state: "connected" | "session_expired" | "offline" | "saved",
    tooltip: string,
    supportedCommandIds?: readonly string[],
    contextValue: "containerlabEndpoint" | "containerlabLocalWorkspace" = "containerlabEndpoint"
  ) {
    super(label, vscode.TreeItemCollapsibleState.Collapsed);
    this.id = `backend-root:${backendId}`;
    this.description = description;
    this.tooltip = tooltip;
    this.supportedCommandIds = supportedCommandIds;
    this.contextValue = contextValue;
  }
}

class BackendSectionTreeNode extends vscode.TreeItem {
  readonly contextValue: "containerlabEndpointSectionRunning" | "containerlabEndpointSectionLocal";

  constructor(
    readonly backendId: string,
    readonly sectionKind: "running" | "undeployed",
    count: number
  ) {
    super(
      sectionKind === "running" ? `Running (${count})` : `Undeployed (${count})`,
      count > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
    );
    this.id = `backend-section:${backendId}:${sectionKind}`;
    this.contextValue =
      sectionKind === "running"
        ? "containerlabEndpointSectionRunning"
        : "containerlabEndpointSectionLocal";
  }
}

class BackendPlaceholderTreeNode extends vscode.TreeItem {
  readonly contextValue = "containerlabEndpointDisconnected";

  constructor(
    readonly backendId: string,
    label: string,
    tooltip?: string
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.id = `backend-placeholder:${backendId}:${label}`;
    this.tooltip = tooltip;
  }
}

type WorkspaceExplorerNode =
  | BackendRootTreeNode
  | BackendSectionTreeNode
  | BackendPlaceholderTreeNode
  | DelegateTreeNode;

interface WorkspaceExplorerProviderOptions {
  getEndpointState: () => Promise<ApiEndpointManagerState>;
  localProvider: LocalLabTreeDataProvider;
  runningProvider: RunningLabTreeDataProvider;
}

function backendLabName(node: ClabLabTreeNode): string {
  return node.labRef.labName?.trim() || node.name?.trim() || "";
}

function topologyMatchesFilter(entry: ApiTopologyEntry, filterText: string): boolean {
  const query = filterText.trim().toLowerCase();
  if (!query) return true;
  return `${entry.labName} ${entry.yamlFileName}`.toLowerCase().includes(query);
}

function runningNodeMatchesTopologyEntry(node: ClabLabTreeNode, entry: ApiTopologyEntry): boolean {
  if (backendLabName(node) === entry.labName) return true;
  if (
    node.labRef.sourceLabName === entry.labName &&
    node.labRef.sourcePath?.replaceAll("\\", "/") === entry.yamlFileName.replaceAll("\\", "/")
  ) {
    return true;
  }
  return apiTopologySourcePathMatches(node.labRef.remotePath, entry.labName, entry.yamlFileName);
}

function remoteTopologyNode(
  backend: ApiContainerlabBackend,
  entry: ApiTopologyEntry
): ClabLabTreeNode {
  const remotePath = entry.yamlFileName || `${entry.labName}.clab.yml`;
  const labRef = {
    backendId: backend.id,
    labName: entry.labName,
    remotePath,
    sourceLabName: entry.labName,
    sourcePath: remotePath
  };
  const isFavorite = favoriteApiLabs.has(apiLabFavoriteKey(labRef) ?? "");
  const node = new ClabLabTreeNode(
    path.basename(remotePath),
    vscode.TreeItemCollapsibleState.None,
    { absolute: "", relative: remotePath },
    entry.labName,
    undefined,
    undefined,
    isFavorite ? "containerlabLabUndeployedFavorite" : "containerlabLabUndeployed",
    isFavorite,
    undefined,
    undefined,
    labRef
  );
  node.description = remotePath;
  node.tooltip = `${remotePath}\nManaged by ${backend.getConnectionInfo().url}`;
  return node;
}

/**
 * Presents the VS Code workspace and all connected API servers as peer roots.
 * Existing local/running providers remain the data owners; this provider only
 * groups their nodes and adds the API topology-file inventory.
 */
export class WorkspaceExplorerTreeDataProvider
  implements vscode.TreeDataProvider<WorkspaceExplorerNode>, vscode.Disposable
{
  private readonly changeEmitter = new vscode.EventEmitter<WorkspaceExplorerNode | undefined>();
  private readonly disposables: vscode.Disposable[] = [];
  private readonly childrenById = new Map<string, WorkspaceExplorerNode[]>();
  private filterText = "";

  readonly onDidChangeTreeData = this.changeEmitter.event;

  constructor(private readonly options: WorkspaceExplorerProviderOptions) {
    this.disposables.push(
      options.runningProvider.onDidChangeTreeData(() => this.refresh()),
      options.localProvider.onDidChangeTreeData(() => this.refresh())
    );
  }

  getTreeItem(element: WorkspaceExplorerNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: WorkspaceExplorerNode): Promise<WorkspaceExplorerNode[]> {
    if (element === undefined) return await this.buildRoots();
    if (element.id && this.childrenById.has(element.id)) {
      return this.childrenById.get(element.id) ?? [];
    }
    if (
      element instanceof ClabLabTreeNode ||
      element instanceof ClabContainerTreeNode ||
      element instanceof ClabContainerGroupTreeNode
    ) {
      return (await this.options.runningProvider.getChildren(element)) ?? [];
    }
    if (element instanceof ClabFolderTreeNode) {
      return (await this.options.localProvider.getChildren(element)) ?? [];
    }
    return [];
  }

  setTreeFilter(filterText: string): void {
    this.filterText = filterText;
    this.options.runningProvider.setTreeFilter(filterText);
    this.options.localProvider.setTreeFilter(filterText);
    this.refresh();
  }

  clearTreeFilter(): void {
    this.filterText = "";
    this.options.runningProvider.clearTreeFilter();
    this.options.localProvider.clearTreeFilter();
    this.refresh();
  }

  refresh(): void {
    this.childrenById.clear();
    this.changeEmitter.fire(undefined);
  }

  dispose(): void {
    this.changeEmitter.dispose();
    for (const disposable of this.disposables) disposable.dispose();
  }

  private async buildRoots(): Promise<WorkspaceExplorerNode[]> {
    this.childrenById.clear();
    const apiBackends = listConnectedBackends().filter(
      (backend): backend is ApiContainerlabBackend => backend instanceof ApiContainerlabBackend
    );
    const topologyRequests = new Map(
      apiBackends.map((backend) => [backend.id, backend.operations.listTopologies()] as const)
    );
    const [endpointState, runningNodes, localNodes, topologyResults] = await Promise.all([
      this.options.getEndpointState(),
      this.options.runningProvider.getChildren(),
      this.options.localProvider.getChildren(undefined),
      Promise.all(
        apiBackends.map(async (backend) => {
          try {
            return {
              backend,
              entries: (await topologyRequests.get(backend.id)) ?? []
            };
          } catch (error) {
            return {
              backend,
              error: error instanceof Error ? error.message : String(error)
            };
          }
        })
      )
    ]);

    const running = ((runningNodes ?? []) as unknown[]).filter(
      (node): node is ClabLabTreeNode => node instanceof ClabLabTreeNode
    );
    const local = (localNodes ?? []) as WorkspaceExplorerNode[];
    const roots: WorkspaceExplorerNode[] = [this.buildLocalRoot(running, local)];
    const topologiesByBackend = new Map<string, { entries?: ApiTopologyEntry[]; error?: string }>();
    for (const result of topologyResults) {
      topologiesByBackend.set(result.backend.id, {
        ...(result.entries !== undefined ? { entries: result.entries } : {}),
        ...(result.error !== undefined ? { error: result.error } : {})
      });
    }

    const representedBackendIds = new Set<string>();
    for (const profile of endpointState.endpoints) {
      const backendId = apiContainerlabBackendId(profile.url, profile.username);
      representedBackendIds.add(backendId);
      roots.push(
        this.buildApiRoot(
          backendId,
          profile.id,
          profile.label,
          profile.url,
          profile.username,
          profile.status,
          running,
          topologiesByBackend.get(backendId)
        )
      );
    }

    for (const backend of apiBackends) {
      if (representedBackendIds.has(backend.id)) continue;
      const connection = backend.getConnectionInfo();
      roots.push(
        this.buildApiRoot(
          backend.id,
          undefined,
          new URL(connection.url).host,
          connection.url,
          connection.username,
          "connected",
          running,
          topologiesByBackend.get(backend.id)
        )
      );
    }

    return roots;
  }

  private buildLocalRoot(
    runningNodes: ClabLabTreeNode[],
    localNodes: WorkspaceExplorerNode[]
  ): BackendRootTreeNode {
    const root = new BackendRootTreeNode(
      "local",
      undefined,
      "Local Workspace",
      "",
      "connected",
      "Local workspace topology files and labs",
      LOCAL_BACKEND_COMMANDS,
      "containerlabLocalWorkspace"
    );
    const localRunning = runningNodes.filter((node) => node.labRef.backendId === "local");
    this.bindBackendChildren(root, localRunning, localNodes);
    return root;
  }

  private buildApiRoot(
    backendId: string,
    endpointId: string | undefined,
    label: string,
    url: string,
    username: string,
    state: "connected" | "session_expired" | "offline" | "saved",
    allRunningNodes: ClabLabTreeNode[],
    topologyResult?: { entries?: ApiTopologyEntry[]; error?: string }
  ): BackendRootTreeNode {
    const backend = getBackendById(backendId);
    const connectedBackend = backend instanceof ApiContainerlabBackend ? backend : undefined;
    const effectiveState = connectedBackend?.getConnectionState() ?? state;
    const root = new BackendRootTreeNode(
      backendId,
      endpointId,
      label,
      new URL(url).host,
      effectiveState,
      `${url}\nUsername: ${username}\nStatus: ${effectiveState.replaceAll("_", " ")}`
    );
    if (!connectedBackend) {
      this.childrenById.set(root.id ?? "", [
        new BackendPlaceholderTreeNode(
          backendId,
          effectiveState === "session_expired" ? "Session expired" : "Not connected"
        )
      ]);
      return root;
    }

    const running = allRunningNodes.filter((node) => node.labRef.backendId === backendId);
    const undeployed: WorkspaceExplorerNode[] = (topologyResult?.entries ?? [])
      .filter((entry) => !running.some((node) => runningNodeMatchesTopologyEntry(node, entry)))
      .filter((entry) => topologyMatchesFilter(entry, this.filterText))
      .map((entry) => remoteTopologyNode(connectedBackend, entry));
    if (topologyResult?.error) {
      undeployed.push(
        new BackendPlaceholderTreeNode(
          backendId,
          "Unable to load undeployed labs",
          topologyResult.error
        )
      );
    }
    this.bindBackendChildren(root, running, undeployed);
    return root;
  }

  private bindBackendChildren(
    root: BackendRootTreeNode,
    running: WorkspaceExplorerNode[],
    undeployed: WorkspaceExplorerNode[]
  ): void {
    const runningSection = new BackendSectionTreeNode(root.backendId, "running", running.length);
    const undeployedSection = new BackendSectionTreeNode(
      root.backendId,
      "undeployed",
      undeployed.length
    );
    this.childrenById.set(root.id ?? "", [runningSection, undeployedSection]);
    this.childrenById.set(runningSection.id ?? "", running);
    this.childrenById.set(undeployedSection.id ?? "", undeployed);
  }
}
