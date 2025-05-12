import * as vscode from "vscode"
import * as utils from "../utils"
import { CtrStateIcons } from "./common";
import path = require("path");

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

  // Cache for labs: both local and inspect (running) labs.
  private labsCache: {
    local: { data: Record<string, ClabLabTreeNode> | undefined, timestamp: number } | undefined,
    } = { local: undefined};

  private refreshInterval: number = 10000; // Default to 10 seconds
  private cacheTTL: number = 30000; // Default to 30 seconds, will be overridden

  constructor(private context: vscode.ExtensionContext) {
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

  refresh(element?: ClabLabTreeNode): void {
    if (!element) {
      this.labsCache.local = undefined ;
      this._onDidChangeTreeData.fire();
    } else {
      // Selective refresh - only refresh this element
      this._onDidChangeTreeData.fire(element);
    }
  }

  // Add to ClabTreeDataProvider class
  async hasChanges(): Promise<boolean> {
    const now = Date.now();

    if (this.labsCache.local && now - this.labsCache.local.timestamp >= this.cacheTTL) {
      return true;
    }

    return false;
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
    console.log("[discovery]:\tDiscovering labs");

    const localLabs = await this.discoverLocalLabs();     // Undeployed topologies

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

    if (this.labsCache.local && (Date.now() - this.labsCache.local.timestamp < this.cacheTTL)) {
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

  // startCacheJanitor remains unchanged
  private startCacheJanitor() {
    setInterval(() => {
      const now = Date.now();
      let hasExpired = false;

      // Check for expired labs caches
      if (this.labsCache.local && now - this.labsCache.local.timestamp >= this.cacheTTL) {
        this.labsCache.local = undefined;
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
}