import * as vscode from "vscode";

import { ApiContainerlabBackend } from "../backends/api/apiContainerlabBackend";
import type { ApiWorkspaceFileEntry } from "../backends/api/apiOperations";
import { listConnectedBackends, onActiveBackendDataChanged } from "../backends/manager";

const TOPOLOGY_FILE_PATTERN = /\.clab\.ya?ml$/iu;

function workspaceContextValue(resourcePath: string, resourceKind: "file" | "directory"): string {
  if (resourcePath === "") return "containerlabFileExplorerRoot";
  if (resourceKind === "directory") return "containerlabFileFolder";
  return TOPOLOGY_FILE_PATTERN.test(resourcePath) ? "containerlabFileTopology" : "containerlabFile";
}

export class ApiWorkspaceFileTreeNode extends vscode.TreeItem {
  readonly contextValue: string;

  constructor(
    readonly backendId: string,
    readonly endpointId: string,
    label: string,
    readonly resourcePath: string,
    readonly resourceKind: "file" | "directory",
    readonly hasChildren: boolean,
    tooltip?: string
  ) {
    super(
      label,
      resourceKind === "directory"
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None
    );
    this.id = `api-workspace:${backendId}:${resourcePath || "/"}`;
    this.contextValue = workspaceContextValue(resourcePath, resourceKind);
    this.tooltip = tooltip ?? resourcePath;
  }
}

function entryNode(
  backend: ApiContainerlabBackend,
  entry: ApiWorkspaceFileEntry
): ApiWorkspaceFileTreeNode {
  return new ApiWorkspaceFileTreeNode(
    backend.id,
    backend.id,
    entry.name,
    entry.path,
    entry.kind,
    entry.hasChildren === true,
    `${entry.path}${entry.modifiedAt ? `\nModified: ${entry.modifiedAt}` : ""}`
  );
}

export class ApiWorkspaceFileTreeDataProvider
  implements vscode.TreeDataProvider<ApiWorkspaceFileTreeNode>, vscode.Disposable
{
  private readonly changeEmitter = new vscode.EventEmitter<ApiWorkspaceFileTreeNode | undefined>();
  private readonly disposeBackendListener: () => void;
  private filterText = "";

  readonly onDidChangeTreeData = this.changeEmitter.event;

  constructor() {
    this.disposeBackendListener = onActiveBackendDataChanged(() => this.refresh());
  }

  getTreeItem(element: ApiWorkspaceFileTreeNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: ApiWorkspaceFileTreeNode): Promise<ApiWorkspaceFileTreeNode[]> {
    if (!element) {
      return listConnectedBackends()
        .filter(
          (backend): backend is ApiContainerlabBackend => backend instanceof ApiContainerlabBackend
        )
        .map((backend) => {
          const connection = backend.getConnectionInfo();
          return new ApiWorkspaceFileTreeNode(
            backend.id,
            backend.id,
            new URL(connection.url).host,
            "",
            "directory",
            true,
            `${connection.url}\nRemote lab workspace`
          );
        });
    }

    if (element.resourceKind !== "directory") return [];
    const backend = listConnectedBackends().find(
      (candidate): candidate is ApiContainerlabBackend =>
        candidate.id === element.backendId && candidate instanceof ApiContainerlabBackend
    );
    if (!backend) return [];
    const entries = await backend.operations.listWorkspaceTree(element.resourcePath);
    const query = this.filterText.trim().toLowerCase();
    return entries
      .filter((entry) => !query || `${entry.name} ${entry.path}`.toLowerCase().includes(query))
      .map((entry) => entryNode(backend, entry));
  }

  setTreeFilter(filterText: string): void {
    this.filterText = filterText;
    this.refresh();
  }

  clearTreeFilter(): void {
    this.filterText = "";
    this.refresh();
  }

  refresh(): void {
    this.changeEmitter.fire(undefined);
  }

  dispose(): void {
    this.disposeBackendListener();
    this.changeEmitter.dispose();
  }
}
