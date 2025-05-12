import * as vscode from "vscode"
import * as utils from "../utils"
import {CtrStateIcons, ClabLabTreeNode} from "./common";
import path = require("path");

const CLAB_GLOB_PATTERN = "{**/*.clab.yml,**/*.clab.yaml}";
const IGNORE_GLOB_PATTERN = "**/node_modules/**";

export class LocalLabTreeDataProvider implements vscode.TreeDataProvider<ClabLabTreeNode | undefined> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void | ClabLabTreeNode | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  // glob everything so we can events when folders are deleted
  private watcher = vscode.workspace.createFileSystemWatcher("**", false, false, false);

  constructor(private context: vscode.ExtensionContext) {
    this.watcher.onDidCreate(() => {this.refresh();});
    this.watcher.onDidDelete(() => {this.refresh();});
    this.watcher.onDidChange(() => {this.refresh();});
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: ClabLabTreeNode): vscode.TreeItem {
    return element;
  }

  // Populate the tree
  async getChildren(): Promise<any> {
    return this.discoverLabs();
  }

  private async discoverLabs(): Promise<ClabLabTreeNode[] | undefined> {
    console.log("[LocalTreeDataProvider]:\tDiscovering labs...");

    const uris = await vscode.workspace.findFiles(CLAB_GLOB_PATTERN, IGNORE_GLOB_PATTERN);

    // empty tree if no files were discovered
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

    // return sorted array of ClabLabTreeNode(s)
    return Object.values(labs).sort(
        (a, b) => {
            // sort based on labPath as it has to be unique
            return a.labPath.absolute.localeCompare(b.labPath.absolute);
        }
    );
  }

  // getResourceUri remains unchanged
  private getResourceUri(resource: string) {
    return vscode.Uri.file(this.context.asAbsolutePath(path.join("resources", resource)));
  }
}