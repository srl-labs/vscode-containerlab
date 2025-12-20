import * as vscode from "vscode"
import * as utils from "../utils/utils"
import * as c from "./common";
import * as ins from "./inspector";
import { localTreeView, favoriteLabs } from "../globals";
import { FilterUtils } from "../helpers/filterUtils";
import path = require("path");

const WATCHER_GLOB_PATTERN = "**/*.clab.{yaml,yml}";
const CLAB_GLOB_PATTERN = "{**/*.clab.yml,**/*.clab.yaml}";
const IGNORE_GLOB_PATTERN = "**/node_modules/**";

export class LocalLabTreeDataProvider implements vscode.TreeDataProvider<c.ClabLabTreeNode | c.ClabFolderTreeNode | undefined> {
    private _onDidChangeTreeData = new vscode.EventEmitter<void | c.ClabLabTreeNode | c.ClabFolderTreeNode | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private watcher = vscode.workspace.createFileSystemWatcher(WATCHER_GLOB_PATTERN, false, false, false);
    // match on subdirs. deletion events only.
    private delSubdirWatcher = vscode.workspace.createFileSystemWatcher("**/", true, true, false);
    private treeFilter: string = '';
    private labNodeCache: Map<string, c.ClabLabTreeNode> = new Map();

    // Cache for file discovery results
    private fileCache: vscode.Uri[] | null = null;

    constructor() {
        this.watcher.onDidCreate(uri => {
            if (!uri.scheme || uri.scheme === 'file') {
                // Invalidate cache on file creation
                this.fileCache = null;
                this.refresh();
            }
        });
        this.watcher.onDidDelete(uri => {
            if (!uri.scheme || uri.scheme === 'file') {
                // Invalidate cache on file deletion
                this.fileCache = null;
                this.refresh();
            }
        });
        this.watcher.onDidChange(uri => {
            if (!uri.scheme || uri.scheme === 'file') {
                // Don't invalidate cache on file changes, just refresh
                this.refresh();
            }
        });
        // refresh when a subdir is deleted so we can check if any
        // clab.yaml/yml files have been also deleted as a result
        // of the subdir deletion.
        this.delSubdirWatcher.onDidDelete(uri => {
            if (!uri.scheme || uri.scheme === 'file') {
                // Invalidate cache on directory deletion
                this.fileCache = null;
                this.refresh();
            }
        });
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    // Force refresh with cache invalidation
    forceRefresh(): void {
        this.fileCache = null;
        this._onDidChangeTreeData.fire();
    }

    setTreeFilter(filterText: string) {
        this.treeFilter = filterText;
        if (localTreeView) {
            localTreeView.message = `Filter: ${filterText}`;
        }
        this.refresh();
    }

    clearTreeFilter() {
        this.treeFilter = '';
        if (localTreeView) {
            localTreeView.message = undefined;
        }
        this.refresh();
    }

    getTreeItem(element: c.ClabLabTreeNode | c.ClabFolderTreeNode): vscode.TreeItem {
        return element;
    }

    // Populate the tree
    async getChildren(element: any): Promise<any> {
        if (element instanceof c.ClabFolderTreeNode) {
            return this.discoverLabs(element.fullPath);
        }
        if (element) { return undefined; }
        return this.discoverLabs();
    }

    private async discoverLabs(dir?: string): Promise<(c.ClabFolderTreeNode | c.ClabLabTreeNode)[] | undefined> {
        console.log("[LocalTreeDataProvider]:\tDiscovering...");

        const uris = await this.getLabUris();
        const labs: Record<string, c.ClabLabTreeNode> = {};
        const labPaths = this.getLabPaths();
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';

        uris.forEach(uri => this.addLab(labs, labPaths, uri.fsPath, favoriteLabs?.has(utils.normalizeLabPath(uri.fsPath)) ?? false));
        this.includeFavoriteLabs(uris, labs, labPaths);
        this.applyTreeFilter(labs, workspaceRoot);

        const dirPath = dir ?? workspaceRoot;
        const { labNodes, folderNodes } = this.collectNodes(labs, dirPath, workspaceRoot);

        this.cleanupCache(labs);
        labNodes.sort(this.compareLabs);

        const result: (c.ClabFolderTreeNode | c.ClabLabTreeNode)[] = [...labNodes, ...folderNodes];
        const isEmpty = result.length === 0 && dirPath === workspaceRoot;
        if (dirPath === workspaceRoot) {
            vscode.commands.executeCommand('setContext', 'localLabsEmpty', isEmpty);
        }
        return isEmpty ? undefined : result;
    }

    private async getLabUris(): Promise<vscode.Uri[]> {
        if (this.fileCache) {
            console.log("[LocalTreeDataProvider]:\tUsing cached file list");
            return this.fileCache;
        }
        console.log("[LocalTreeDataProvider]:\tPerforming file discovery");
        const uris = (await vscode.workspace.findFiles(CLAB_GLOB_PATTERN, IGNORE_GLOB_PATTERN))
            .filter(u => !u.scheme || u.scheme === 'file');
        this.fileCache = uris;
        return uris;
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

        let labNode = this.labNodeCache.get(normPath);

        if (labNode) {
            labNode.contextValue = contextVal;
            (labNode as any).favorite = isFavorite;
            labNode.description = utils.getRelLabFolderPath(normPath);
        } else {
            labNode = new c.ClabLabTreeNode(
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
            this.labNodeCache.set(normPath, labNode);
        }

        labs[normPath] = labNode;
    }

    private includeFavoriteLabs(
        uris: vscode.Uri[],
        labs: Record<string, c.ClabLabTreeNode>,
        labPaths: Set<string>
    ): void {
        favoriteLabs?.forEach(p => {
            const norm = utils.normalizeLabPath(p);
            if (!uris.find(u => utils.normalizeLabPath(u.fsPath) === norm)) {
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

        Object.values(labs).forEach(lab => {
            const labDir = path.dirname(lab.labPath.absolute);
            if (labDir === dirPath) {
                labNodes.push(lab);
            } else if (dirPath === workspaceRoot && !labDir.startsWith(workspaceRoot)) {
                labNodes.push(lab);
            } else if (labDir.startsWith(dirPath + path.sep) || (dirPath === workspaceRoot && labDir !== workspaceRoot && labDir.startsWith(dirPath))) {
                const relative = path.relative(dirPath, labDir).split(path.sep)[0];
                folderSet.add(path.join(dirPath, relative));
            }
        });

        const folderNodes = Array.from(folderSet).sort().map(p => new c.ClabFolderTreeNode(path.basename(p), p));
        return { labNodes, folderNodes };
    }

    private cleanupCache(labs: Record<string, c.ClabLabTreeNode>): void {
        for (const key of Array.from(this.labNodeCache.keys())) {
            if (!labs[key]) {
                this.labNodeCache.delete(key);
            }
        }
    }

    private compareLabs(a: c.ClabLabTreeNode, b: c.ClabLabTreeNode): number {
        if (a.favorite && !b.favorite) { return -1; }
        if (!a.favorite && b.favorite) { return 1; }
        const aPath = a.labPath?.absolute ?? '';
        const bPath = b.labPath?.absolute ?? '';
        return aPath.localeCompare(bPath);
    }

    // Parse clab inspect data and return a set of absolute labPaths.
    // Used to check if a locally discovered lab is deployed or not.
    private getLabPaths() {
        const labPaths = new Set<string>();

        const data = ins.rawInspectData;

        if (Array.isArray(data)) {
            // Old format: flat array of containers
            data.forEach((container: any) => {
                const p = container?.Labels?.['clab-topo-file'];
                if (p) { labPaths.add(p); }
            });
        } else if (data && typeof data === 'object') {
            // Possibly new format: object with lab names as keys
            Object.values(data).forEach((containers: any) => {
                if (Array.isArray(containers) && containers.length > 0) {
                    const p = containers[0]?.Labels?.['clab-topo-file'];
                    if (p) { labPaths.add(p); }
                }
            });
        }

        return labPaths;

    }

}
