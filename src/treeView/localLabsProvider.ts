import * as vscode from "vscode"
import * as utils from "../utils"
import * as c from "./common";
import path = require("path");
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const WATCHER_GLOB_PATTERN = "**/*.clab.{yaml,yml}";
const CLAB_GLOB_PATTERN = "{**/*.clab.yml,**/*.clab.yaml}";
const IGNORE_GLOB_PATTERN = "**/node_modules/**";

export class LocalLabTreeDataProvider implements vscode.TreeDataProvider<c.ClabLabTreeNode | undefined> {
    private _onDidChangeTreeData = new vscode.EventEmitter<void | c.ClabLabTreeNode | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private watcher = vscode.workspace.createFileSystemWatcher(WATCHER_GLOB_PATTERN, false, false, false);

    constructor(private context: vscode.ExtensionContext) {
        this.watcher.onDidCreate(() => { this.refresh(); });
        this.watcher.onDidDelete(() => { this.refresh(); });
        this.watcher.onDidChange(() => { this.refresh(); });
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: c.ClabLabTreeNode): vscode.TreeItem {
        return element;
    }

    // Populate the tree
    async getChildren(element: any): Promise<any> {
        if(element) { return undefined; }
        return this.discoverLabs();
    }

    private async discoverLabs(): Promise<c.ClabLabTreeNode[] | undefined> {
        console.log("[LocalTreeDataProvider]:\tDiscovering labs...");

        const uris = await vscode.workspace.findFiles(CLAB_GLOB_PATTERN, IGNORE_GLOB_PATTERN);

        // empty tree if no files were discovered
        if (!uris.length) {
            return undefined;
        }

        const labs: Record<string, c.ClabLabTreeNode> = {};

        const labPaths = await this.getInspectData();

        uris.forEach((uri) => {
            const normPath = utils.normalizeLabPath(uri.fsPath);
            const relPath = path.relative(vscode.workspace.workspaceFolders![0].uri.path, uri.fsPath);

            if (!labs[relPath] && !(labPaths?.has(normPath))) {
                const labNode = new c.ClabLabTreeNode(
                    path.basename(uri.fsPath),
                    vscode.TreeItemCollapsibleState.None,
                    {
                        relative: uri.fsPath,   // this path is actually absolute as well
                        absolute: normPath
                    },
                    undefined,
                    undefined,
                    undefined,
                    "containerlabLabUndeployed"
                );

                labNode.description = utils.getRelLabFolderPath(normPath);

                labs[relPath] = labNode;
            }
        });

        // return sorted array of c.ClabLabTreeNode(s)
        return Object.values(labs).sort(
            (a, b) => {
                // sort based on labPath as it has to be unique
                return a.labPath.absolute.localeCompare(b.labPath.absolute);
            }
        );

    }

    // Parse clab inspect data and return a set of absolute labPaths.
    // Used to check if a locally discovered lab is deployed or not.
    private async getInspectData() {
        const config = vscode.workspace.getConfiguration("containerlab");
        const runtime = config.get<string>("runtime", "docker");

        const cmd = `${utils.getSudo()}containerlab inspect -r ${runtime} --all --format json 2>/dev/null`;

        let clabStdout;
        try {
            const { stdout } = await execAsync(cmd);
            clabStdout = stdout;
        } catch (err) {
            throw new Error(`Could not run ${cmd}.\n${err}`);
        }

        if (!clabStdout) {
            return undefined;
        }

        const parsedData = JSON.parse(clabStdout);

        const labPaths = new Set<string>();

        for (const [key, value] of Object.entries(parsedData)) {
            if (value instanceof Array) {
                labPaths.add(value[0]['absLabPath']);
            }
        }

        return labPaths;

    }

}