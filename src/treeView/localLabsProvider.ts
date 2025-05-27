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

export class LocalLabTreeDataProvider implements vscode.TreeDataProvider<c.ClabLabTreeNode | undefined> {
    private _onDidChangeTreeData = new vscode.EventEmitter<void | c.ClabLabTreeNode | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private watcher = vscode.workspace.createFileSystemWatcher(WATCHER_GLOB_PATTERN, false, false, false);
    // match on subdirs. deletion events only.
    private delSubdirWatcher = vscode.workspace.createFileSystemWatcher("**/", true, true, false);
    private treeFilter: string = '';

    constructor() {
        this.watcher.onDidCreate(() => { this.refresh(); });
        this.watcher.onDidDelete(() => { this.refresh(); });
        this.watcher.onDidChange(() => { this.refresh(); });
        // refresh when a subdir is deleted so we can check if any
        // clab.yaml/yml files have been also deleted as a result
        // of the subdir deletion.
        this.delSubdirWatcher.onDidDelete(() => { this.refresh(); });
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

    getTreeItem(element: c.ClabLabTreeNode): vscode.TreeItem {
        return element;
    }

    // Populate the tree
    async getChildren(element: any): Promise<any> {
        if (element) { return undefined; }
        return this.discoverLabs();
    }

    private async discoverLabs(): Promise<c.ClabLabTreeNode[] | undefined> {
        console.log("[LocalTreeDataProvider]:\tDiscovering...");

        const uris = await vscode.workspace.findFiles(CLAB_GLOB_PATTERN, IGNORE_GLOB_PATTERN);

        const labs: Record<string, c.ClabLabTreeNode> = {};

        // get a list of running labPaths so we can filter out any running labs.
        const labPaths = this.getLabPaths();

        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';

        const addLab = (filePath: string, isFavorite: boolean) => {
            const normPath = utils.normalizeLabPath(filePath);
            if (!labs[normPath] && !labPaths.has(normPath)) {
                const relPath = path.relative(workspaceRoot, filePath);
                const labNode = new c.ClabLabTreeNode(
                    relPath,
                    vscode.TreeItemCollapsibleState.None,
                    {
                        relative: filePath,
                        absolute: normPath
                    },
                    undefined,
                    undefined,
                    undefined,
                    "containerlabLabUndeployed",
                    isFavorite
                );

                labNode.description = utils.getRelLabFolderPath(normPath);
                labs[normPath] = labNode;
            }
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

        let result = Object.values(labs).sort(
            (a, b) => {
                if (a.favorite && !b.favorite) {
                    return -1;
                }
                if (!a.favorite && b.favorite) {
                    return 1;
                }
                const aPath = a.labPath?.absolute ?? '';
                const bPath = b.labPath?.absolute ?? '';
                return aPath.localeCompare(bPath);
            }
        );

        if (this.treeFilter) {
            const filter = this.treeFilter;
            result = result.filter(lab => String(lab.label).toLowerCase().includes(filter));
        }

        const isEmpty = result.length === 0;
        vscode.commands.executeCommand(
            'setContext',
            'localLabsEmpty',
            isEmpty
        );

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