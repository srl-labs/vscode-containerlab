import * as vscode from "vscode"
import * as utils from "../utils"
import { CtrStateIcons } from "./common";
import path = require("path");

const CLAB_GLOB_PATTERN = "{**/*.clab.yml,**/*.clab.yaml}";
const IGNORE_GLOB_PATTERN = "**/node_modules/**";

// Tree node for a lab
export class ClabLabTreeNode extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly labPath: LabPath,
    public readonly name?: string,
    public readonly owner?: string,
    contextValue?: string,
  ) {
    super(label, collapsibleState);
    this.contextValue = contextValue;
  }
}

// LabPath interface
export interface LabPath {
  absolute: string,
  relative: string
}

export class LocalLabTreeDataProvider implements vscode.TreeDataProvider<ClabLabTreeNode | undefined> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void | ClabLabTreeNode | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private watcher = vscode.workspace.createFileSystemWatcher(CLAB_GLOB_PATTERN, false, false, false);

  private refreshInterval: number = 10000; // Default to 10 seconds

  constructor(private context: vscode.ExtensionContext) {
    // Get the refresh interval from configuration
    const config = vscode.workspace.getConfiguration('containerlab');
    this.refreshInterval = config.get<number>('refreshInterval', 10000);

    this.watcher.onDidCreate(() => {this.refresh();});
    this.watcher.onDidDelete(() => {this.refresh();});

  }

  refresh(element?: ClabLabTreeNode): void {
    if (!element) {
      this._onDidChangeTreeData.fire();
    } else {
      // Selective refresh - only refresh this element
      this._onDidChangeTreeData.fire(element);
    }
  }

  getTreeItem(element: ClabLabTreeNode): vscode.TreeItem {
    return element;
  }

  // Populate the tree
  async getChildren(element?: ClabLabTreeNode): Promise<any> {
    // Discover labs to populate tree
    if (!element) { return this.discoverLabs(); }
    return undefined;
  }

  private async discoverLabs(): Promise<ClabLabTreeNode[]> {
    console.log("[LocalLabTreeDataProvider]:\tDiscovering labs");

    const localLabs = await this.discoverLocalLabs();

    // --- Combine local and global labs ---
    // Initialize with global labs (deployed)
    const labs: Record<string, ClabLabTreeNode> = localLabs ? { ...localLabs } : {};

    // Convert the dict to an array and sort by:
    // 1. Deployed labs first
    // 2. Then by absolute path
    const sortedLabs = Object.values(labs).sort((a, b) => {
        // sort by labPath
        return a.labPath.absolute.localeCompare(b.labPath.absolute);
    });

    console.log(`[discovery]:\tDiscovered ${sortedLabs.length} labs.`);
    return sortedLabs;
  }

  private async discoverLocalLabs(): Promise<Record<string, ClabLabTreeNode> | undefined> {
    console.log("[discovery]:\tDiscovering local labs...");

    const uris = await vscode.workspace.findFiles(CLAB_GLOB_PATTERN, IGNORE_GLOB_PATTERN);

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
          "containerlabLabUndeployed"
        );

        labNode.description = utils.getRelLabFolderPath(uri.fsPath);

        const icon = this.getResourceUri(CtrStateIcons.UNDEPLOYED);
        labNode.iconPath = { light: icon, dark: icon };

        labs[normPath] = labNode;
      }
    });

    return labs;
  }

  // getResourceUri remains unchanged
  private getResourceUri(resource: string) {
    return vscode.Uri.file(this.context.asAbsolutePath(path.join("resources", resource)));
  }
}