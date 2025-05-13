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

interface Folder {
    [key: string]: Folder | c.ClabLabTreeNode;
}

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
        if(!element) {
            return this.discoverLabs();
        } else if(element instanceof c.ClabFolderTreeNode) {
            return element.children;
        } else {
            return undefined;
        }
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
        const localPaths = new Set<string>;

        uris.forEach((uri) => {
            const normPath = utils.normalizeLabPath(uri.fsPath);
            const relPath = path.relative(vscode.workspace.workspaceFolders![0].uri.path, uri.fsPath);

            if (!labs[relPath] && !(labPaths?.has(normPath))) {
                const labNode = new c.ClabLabTreeNode(
                    path.basename(uri.fsPath),
                    vscode.TreeItemCollapsibleState.None,
                    {
                        relative: uri.fsPath,
                        absolute: normPath
                    },
                    undefined,
                    undefined,
                    undefined,
                    "containerlabLabUndeployed"
                );

                localPaths.add(utils.stripFileName(normPath));

                labs[relPath] = labNode;
            }
        });

        if (localPaths.size > 1) {
            return this.groupIntoFolders(labs);
        }
        else {
            return this.sortOnLabPath(labs);
        }

    }

    private groupIntoFolders(labs: Record<string, c.ClabLabTreeNode>) {

        let root: Folder = {};

        for (const [key, value] of Object.entries(labs)) {
            const parts = key.split('/');

            let current: Folder = root;

            for (let i = 0; i < parts.length; i++) {
                const part = parts[i];

                const folder_key = parts.slice(0, i+1).join("/")
                // const folder_key = part;

                if (i === parts.length - 1) {
                    // final section is the lab object.
                    current[folder_key] = value;
                } else {
                    // folder object, create if folder doesn't exist.
                    if (!current[folder_key]) {
                        current[folder_key] = {};
                    }
                    current = current[folder_key] as Folder;
                }
            }
        }

        return this.getFolderChildren(root)
    }

    // private groupIntoFolders1(labs: Record<string, c.ClabLabTreeNode>) {

    //     let root: any[] = [];

    //     for (const [key, value] of Object.entries(labs)) {
    //         const parts = key.split('/');

    //         let current: any = root;

    //         for (let i = 0; i < parts.length; i++) {
    //             const part = parts[i];

    //             const folder_key = parts.slice(0, i+1).join("/")
    //             // const folder_key = part;

    //             const obj = new c.ClabFolderTreeNode(
    //                 part,
    //                 vscode.TreeItemCollapsibleState.Collapsed,
    //                 folder_key,
    //             )

    //             if (i === parts.length - 1) {
    //                 // final section is the lab object.
    //                 current[folder_key] = value;
    //             } else {
    //                 // folder object, create if folder doesn't exist.
    //                 if (!current[folder_key]) {
    //                     current[folder_key] = {};
    //                 }
    //                 current = current[folder_key] as Folder;
    //             }
    //         }

    //     }

    // }

    private getFolderChildren(obj: any) {
        const result: any[] = [];

        for (const [key, value] of Object.entries(obj)) {
            if (value instanceof c.ClabLabTreeNode) {
                result.push(value);
            } else {
                const children = this.getFolderChildren(value);
                const folder = new c.ClabFolderTreeNode(key.substring(key.lastIndexOf("/")+1), vscode.TreeItemCollapsibleState.Expanded, children, "containerlabFolder");
                result.push(folder);
            }
        }

        return result.sort(
            (a, b) => {
                return a.label.localeCompare(b.label);
            }
        );
    }

    private sortOnLabPath(labs: Record<string, c.ClabLabTreeNode>) {
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