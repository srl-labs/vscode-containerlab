import * as vscode from "vscode";
import * as cmd from './command';
import * as utils from '../utils';
import { ClabLabTreeNode } from "../treeView/common";
import { DefaultOptions } from "./command";
import { exec } from "child_process";
import { outputChannel } from "../extension";
import path from "path";
/**
 * A helper class to build a 'containerlab' command (with optional sudo, etc.)
 * and run it either in the Output channel or in a Terminal.
 */
export class ClabCommand extends cmd.Command {
    private node?: ClabLabTreeNode;
    private action: string;
    private runtime: string;
    private labPath?: string;

    constructor(
        action: string,
        node: ClabLabTreeNode,
    ) {

        const opts: DefaultOptions = {
            command: "containerlab"
        }

        super(opts);

        // Read the runtime from configuration.
        const config = vscode.workspace.getConfiguration("containerlab");
        this.runtime = config.get<string>("runtime", "docker");

        this.action = action;
        this.node = node instanceof ClabLabTreeNode ? node : undefined;
    }

    public async run(flags?: string[]): Promise<void> {
        // Try node.details -> fallback to active editor
        if (!this.node) {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showErrorMessage(
                    'No lab node or topology file selected'
                );
                return;
            }
            this.labPath = editor.document.uri.fsPath;
        }
        else {
            this.labPath = this.node.labPath.absolute
        }

        if (!this.labPath) {
            vscode.window.showErrorMessage(
                `No labPath found for command "${this.action}".`
            );
            return;
        }

        // Build the command
        const config = vscode.workspace.getConfiguration("containerlab");
        let extraFlags: string[] = [];
        if (this.action === "deploy" || this.action === "redeploy") {
            const extra = config.get<string>("deploy.extraArgs", "");
            if (extra) {
                extraFlags = extra.split(/\s+/).filter(f => f);
            }
        } else if (this.action === "destroy") {
            const extra = config.get<string>("destroy.extraArgs", "");
            if (extra) {
                extraFlags = extra.split(/\s+/).filter(f => f);
            }
        }

        const allFlags = [...extraFlags];
        if (flags) {
            allFlags.push(...flags);
        }

        const cmdArgs = [this.action, "-r", this.runtime, ...allFlags, "-t", this.labPath];

        // Return the promise from .execute() so we can await
        return this.execute(cmdArgs);
    }

    override async execProgress(cmd: string[]): Promise<void> {
        const title = utils.titleCase(this.action);
        vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: title,
                cancellable: false
            },
            (progress) => new Promise<string>((resolve, reject) => {
                const child = exec(cmd.join(" "), { encoding: 'utf-8' }, (err, stdout, stderr) => {
                    if (err) {
                        vscode.window.showErrorMessage(`${title}: ${stderr.trimEnd().split("\n").reverse()[0]}`);
                        return reject(err);
                    }
                    outputChannel.append(stdout);
                    resolve(stdout.trim());
                });

                child.stderr?.on('data', (data) => {
                    const line = data.toString().trim();
                    if (line) {
                        progress.report({ message: line.replace(/^\d{2}:\d{2}:\d{2} \w+ /, "") });
                        outputChannel.appendLine(line);
                    }
                });
            })
        ).then(() => {
            vscode.window.showInformationMessage(`✔ ${title} success for ${path.basename(this.labPath!)}`);
            // trigger a refresh after execution
            vscode.commands.executeCommand('containerlab.refresh');
        })
    }
}
