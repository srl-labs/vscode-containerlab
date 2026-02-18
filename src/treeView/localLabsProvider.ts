import path = require("path");

import * as vscode from "vscode";

import * as utils from "../utils/utils";
import { favoriteLabs, outputChannel } from "../globals";
import { FilterUtils } from "../helpers/filterUtils";

import * as c from "./common";
import * as ins from "./inspector";

const WATCHER_GLOB_PATTERN = "**/*.clab.{yaml,yml}";
const CLAB_GLOB_PATTERN = "{**/*.clab.yml,**/*.clab.yaml}";
const IGNORE_GLOB_PATTERN = "**/node_modules/**";
const SCAN_TIMEOUT_MS = 120_000;

export class LocalLabTreeDataProvider implements vscode.TreeDataProvider<
  c.ClabLabTreeNode | c.ClabFolderTreeNode | undefined
> {
  private _onDidChangeTreeData = new vscode.EventEmitter<
    void | c.ClabLabTreeNode | c.ClabFolderTreeNode | undefined
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private watcher = vscode.workspace.createFileSystemWatcher(
    WATCHER_GLOB_PATTERN,
    false,
    false,
    false
  );
  // match on subdirs. deletion events only.
  private delSubdirWatcher = vscode.workspace.createFileSystemWatcher("**/", true, true, false);
  private treeFilter: string = "";

  private cachedUris: Map<string, vscode.Uri> | undefined;
  private scanPromise: Promise<void> | undefined;
  private scanRequested = false;

  constructor() {
    this.watcher.onDidCreate((uri) => {
      if (!uri.scheme || uri.scheme === "file") {
        this.cachedUris?.set(uri.fsPath, uri);
        this.refresh();
      }
    });
    this.watcher.onDidDelete((uri) => {
      if (!uri.scheme || uri.scheme === "file") {
        this.cachedUris?.delete(uri.fsPath);
        this.refresh();
      }
    });
    this.watcher.onDidChange((uri) => {
      if (!uri.scheme || uri.scheme === "file") {
        this.refresh();
      }
    });
    // refresh when a subdir is deleted so we can check if any
    // clab.yaml/yml files have been also deleted as a result
    // of the subdir deletion.
    this.delSubdirWatcher.onDidDelete((uri) => {
      if (!uri.scheme || uri.scheme === "file") {
        if (this.cachedUris) {
          const prefix = uri.fsPath + path.sep;
          for (const fsPath of this.cachedUris.keys()) {
            if (fsPath.startsWith(prefix)) {
              this.cachedUris.delete(fsPath);
            }
          }
        }
        this.refresh();
      }
    });

  }

  private performScan(): Promise<void> {
    // Only one scan at a time – if a scan is already running, return its promise.
    if (this.scanPromise) {
      return this.scanPromise;
    }

    const scan = (async () => {
      try {
        outputChannel.debug("[LocalTreeDataProvider] Performing file discovery scan");
        const timeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("File scan timed out after 120s")), SCAN_TIMEOUT_MS)
        );
        const uris = (
          await Promise.race([
            vscode.workspace.findFiles(CLAB_GLOB_PATTERN, IGNORE_GLOB_PATTERN),
            timeout
          ])
        ).filter((u) => !u.scheme || u.scheme === "file");
        this.cachedUris = new Map(uris.map((u) => [u.fsPath, u]));
        outputChannel.debug(
          `[LocalTreeDataProvider] Scan found ${this.cachedUris.size} lab files`
        );
        this.refresh();
      } catch (err: unknown) {
        outputChannel.error(`[LocalTreeDataProvider] File scan failed: ${err}`);
        if (!this.cachedUris) {
          this.cachedUris = new Map();
        }
      } finally {
        this.scanPromise = undefined;
      }
    })();

    this.scanPromise = scan;
    return scan;
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  // Force refresh
  forceRefresh(): void {
    this._onDidChangeTreeData.fire();
  }

  setTreeFilter(filterText: string) {
    this.treeFilter = filterText;
    this.refresh();
  }

  clearTreeFilter() {
    this.treeFilter = "";
    this.refresh();
  }

  getTreeItem(element: c.ClabLabTreeNode | c.ClabFolderTreeNode): vscode.TreeItem {
    return element;
  }

  // Populate the tree
  async getChildren(
    element: c.ClabLabTreeNode | c.ClabFolderTreeNode | undefined
  ): Promise<(c.ClabFolderTreeNode | c.ClabLabTreeNode)[] | undefined> {
    if (element instanceof c.ClabFolderTreeNode) {
      return this.discoverLabs(element.fullPath);
    }
    if (element) {
      return undefined;
    }
    return this.discoverLabs();
  }

  private async discoverLabs(
    dir?: string
  ): Promise<(c.ClabFolderTreeNode | c.ClabLabTreeNode)[] | undefined> {
    outputChannel.debug("[LocalTreeDataProvider] Discovering labs...");

    const uris = await this.getLabUris();
    const labs: Record<string, c.ClabLabTreeNode> = {};
    const labPaths = this.getLabPaths();
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";

    uris.forEach((uri) =>
      this.addLab(
        labs,
        labPaths,
        uri.fsPath,
        favoriteLabs?.has(utils.normalizeLabPath(uri.fsPath)) ?? false
      )
    );
    this.includeFavoriteLabs(uris, labs, labPaths);
    this.applyTreeFilter(labs, workspaceRoot);

    const dirPath = dir ?? workspaceRoot;
    const { labNodes, folderNodes } = this.collectNodes(labs, dirPath, workspaceRoot);

    labNodes.sort(this.compareLabs);

    const result: (c.ClabFolderTreeNode | c.ClabLabTreeNode)[] = [...labNodes, ...folderNodes];
    const isEmpty = result.length === 0 && dirPath === workspaceRoot;
    return isEmpty ? undefined : result;
  }

  private async getLabUris(): Promise<vscode.Uri[]> {
    if (!this.scanRequested) {
      this.scanRequested = true;
      await this.performScan();
    } else if (this.scanPromise) {
      await this.scanPromise;
    }
    if (this.cachedUris) {
      return Array.from(this.cachedUris.values());
    }
    return [];
  }

  private addLab(
    labs: Record<string, c.ClabLabTreeNode>,
    labPaths: Set<string>,
    filePath: string,
    isFavorite: boolean
  ): void {
    const normPath = utils.normalizeLabPath(filePath);
    if (labPaths.has(normPath)) {
      return;
    }

    const contextVal = isFavorite
      ? "containerlabLabUndeployedFavorite"
      : "containerlabLabUndeployed";

    const labNode = new c.ClabLabTreeNode(
      path.basename(filePath),
      vscode.TreeItemCollapsibleState.None,
      {
        relative: filePath,
        absolute: normPath
      },
      undefined,
      undefined,
      undefined,
      contextVal,
      isFavorite
    );
    labNode.description = utils.getRelLabFolderPath(normPath);
    labs[normPath] = labNode;
  }

  private includeFavoriteLabs(
    uris: vscode.Uri[],
    labs: Record<string, c.ClabLabTreeNode>,
    labPaths: Set<string>
  ): void {
    favoriteLabs?.forEach((p) => {
      const norm = utils.normalizeLabPath(p);
      if (!uris.find((u) => utils.normalizeLabPath(u.fsPath) === norm)) {
        this.addLab(labs, labPaths, p, true);
      }
    });
  }

  private applyTreeFilter(labs: Record<string, c.ClabLabTreeNode>, workspaceRoot: string): void {
    if (!this.treeFilter) {
      return;
    }
    const filter = FilterUtils.createFilter(this.treeFilter);
    for (const [p, node] of Object.entries(labs)) {
      const rel = path.relative(workspaceRoot, p);
      const lbl = String(node.label);
      if (!filter(lbl) && !filter(rel)) {
        delete labs[p];
      }
    }
  }

  private collectNodes(
    labs: Record<string, c.ClabLabTreeNode>,
    dirPath: string,
    workspaceRoot: string
  ): { labNodes: c.ClabLabTreeNode[]; folderNodes: c.ClabFolderTreeNode[] } {
    const folderSet = new Set<string>();
    const labNodes: c.ClabLabTreeNode[] = [];

    Object.values(labs).forEach((lab) => {
      const labDir = path.dirname(lab.labPath.absolute);
      if (labDir === dirPath) {
        labNodes.push(lab);
      } else if (dirPath === workspaceRoot && !labDir.startsWith(workspaceRoot)) {
        labNodes.push(lab);
      } else if (
        labDir.startsWith(dirPath + path.sep) ||
        (dirPath === workspaceRoot && labDir !== workspaceRoot && labDir.startsWith(dirPath))
      ) {
        const relative = path.relative(dirPath, labDir).split(path.sep)[0];
        folderSet.add(path.join(dirPath, relative));
      }
    });

    const folderNodes = Array.from(folderSet)
      .sort()
      .map((p) => new c.ClabFolderTreeNode(path.basename(p), p));
    return { labNodes, folderNodes };
  }

  private compareLabs(a: c.ClabLabTreeNode, b: c.ClabLabTreeNode): number {
    if (a.favorite && !b.favorite) {
      return -1;
    }
    if (!a.favorite && b.favorite) {
      return 1;
    }
    const aPath = a.labPath?.absolute ?? "";
    const bPath = b.labPath?.absolute ?? "";
    return aPath.localeCompare(bPath);
  }

  // Parse clab inspect data and return a set of absolute labPaths.
  // Used to check if a locally discovered lab is deployed or not.
  private getLabPaths() {
    const labPaths = new Set<string>();

    const data = ins.rawInspectData;

    if (Array.isArray(data)) {
      // Old format: flat array of containers (for backward compatibility)
      data.forEach((container: unknown) => {
        if (container && typeof container === "object" && "Labels" in container) {
          const labels = container.Labels;
          if (labels && typeof labels === "object" && "clab-topo-file" in labels) {
            const p = labels["clab-topo-file"];
            if (typeof p === "string") {
              labPaths.add(p);
            }
          }
        }
      });
    } else if (data && typeof data === "object") {
      // New format: object with lab names as keys
      Object.values(data).forEach((containers: c.ClabDetailedJSON[]) => {
        if (Array.isArray(containers) && containers.length > 0) {
          const p = containers[0]?.Labels?.["clab-topo-file"];
          if (p) {
            labPaths.add(p);
          }
        }
      });
    }

    return labPaths;
  }
}
