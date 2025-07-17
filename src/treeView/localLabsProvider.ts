import * as vscode from "vscode"
import * as utils from "../utils"
import * as c from "./common";
import * as ins from "./inspector";
import { localTreeView, favoriteLabs, extensionContext } from "../extension";
import * as fs from "fs";
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

    constructor() {
        this.watcher.onDidCreate(uri => {
            if (!uri.scheme || uri.scheme === 'file') {
                this.refresh();
            }
        });
        this.watcher.onDidDelete(uri => {
            if (!uri.scheme || uri.scheme === 'file') {
                this.refresh();
            }
        });
        this.watcher.onDidChange(uri => {
            if (!uri.scheme || uri.scheme === 'file') {
                this.refresh();
            }
        });
        // refresh when a subdir is deleted so we can check if any
        // clab.yaml/yml files have been also deleted as a result
        // of the subdir deletion.
        this.delSubdirWatcher.onDidDelete(uri => {
            if (!uri.scheme || uri.scheme === 'file') {
                this.refresh();
            }
        });
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    setTreeFilter(filterText: string) {
        this.treeFilter = filterText.toLowerCase();
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

        const uris = (await vscode.workspace.findFiles(CLAB_GLOB_PATTERN, IGNORE_GLOB_PATTERN))
            .filter(u => !u.scheme || u.scheme === 'file');

        const labs: Record<string, c.ClabLabTreeNode> = {};

        // get a list of running labPaths so we can filter out any running labs.
        const labPaths = this.getLabPaths();

        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';

        const addLab = (filePath: string, isFavorite: boolean) => {
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
            }

            labs[normPath] = labNode;
            this.labNodeCache.set(normPath, labNode);
        };

        uris.forEach(uri => addLab(uri.fsPath, favoriteLabs?.has(utils.normalizeLabPath(uri.fsPath)) ?? false));

        favoriteLabs?.forEach(p => {
            const norm = utils.normalizeLabPath(p);
            if (uris.find(u => utils.normalizeLabPath(u.fsPath) === norm)) {
                return;
            }
            if (fs.existsSync(norm)) {
                addLab(p, true);
            } else {
                favoriteLabs.delete(p);
                if (extensionContext) {
                    extensionContext.globalState.update('favoriteLabs', Array.from(favoriteLabs));
                }
            }
        });

        if (this.treeFilter) {
            const filter = this.treeFilter;
            for (const [p, node] of Object.entries(labs)) {
                const rel = path.relative(workspaceRoot, p).toLowerCase();
                const lbl = String(node.label).toLowerCase();
                if (!lbl.includes(filter) && !rel.includes(filter)) {
                    delete labs[p];
                }
            }
        }

        const dirPath = dir ?? workspaceRoot;

        const folderSet = new Set<string>();
        const labNodes: c.ClabLabTreeNode[] = [];

        Object.values(labs).forEach(lab => {
            const labDir = path.dirname(lab.labPath.absolute);
            if (labDir === dirPath) {
                labNodes.push(lab);
            } else if (labDir.startsWith(dirPath + path.sep) || (dirPath === workspaceRoot && labDir !== workspaceRoot && labDir.startsWith(dirPath))) {
                const relative = path.relative(dirPath, labDir).split(path.sep)[0];
                folderSet.add(path.join(dirPath, relative));
            }
        });

        const folderNodes = Array.from(folderSet).sort().map(p => new c.ClabFolderTreeNode(path.basename(p), p));

        // Update cache to remove stale entries
        for (const key of Array.from(this.labNodeCache.keys())) {
            if (!labs[key]) {
                this.labNodeCache.delete(key);
            }
        }

        labNodes.sort((a, b) => {
            if (a.favorite && !b.favorite) { return -1; }
            if (!a.favorite && b.favorite) { return 1; }
            const aPath = a.labPath?.absolute ?? '';
            const bPath = b.labPath?.absolute ?? '';
            return aPath.localeCompare(bPath);
        });

        let result: (c.ClabFolderTreeNode | c.ClabLabTreeNode)[] = [...labNodes, ...folderNodes];

        const isEmpty = result.length === 0 && dirPath === workspaceRoot;
        if (dirPath === workspaceRoot) {
            vscode.commands.executeCommand(
                'setContext',
                'localLabsEmpty',
                isEmpty
            );
        }

        return isEmpty ? undefined : result;

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