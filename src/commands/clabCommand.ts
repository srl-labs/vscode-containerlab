import * as vscode from "vscode";
import * as cmd from './command';
import { ClabLabTreeNode } from "../treeView/common";
/**
 * A helper class to build a 'containerlab' command (with optional sudo, etc.)
 * and run it either in the Output channel or in a Terminal.
 */
export class ClabCommand extends cmd.Command {
    private node?: ClabLabTreeNode;
    private action: string;
    private runtime: string;

    constructor(
        action: string,
        node: ClabLabTreeNode,
        spinnerMsg?: cmd.SpinnerMsg,
        useTerminal?: boolean,
        terminalName?: string,
        onSuccess?: () => Promise<void>
    ) {
        let options: cmd.CmdOptions;
        if (useTerminal) {
            options = {
                command: "containerlab",
                useSpinner: false,
                terminalName: terminalName || "Containerlab",
            };
        } else {
            options = {
                command: "containerlab",
                useSpinner: true,
                spinnerMsg: spinnerMsg || {
                    progressMsg: `Running ${action}...`,
                    successMsg: `${action} completed successfully`
                },
            };
        }
        super(options);

        // Read the runtime from configuration.
        const config = vscode.workspace.getConfiguration("containerlab");
        this.runtime = config.get<string>("runtime", "docker");

        this.action = action;
        this.node = node instanceof ClabLabTreeNode ? node : undefined;
        if (onSuccess) {
            this.onSuccessCallback = onSuccess;
        }
    }

    public async run(flags?: string[]): Promise<void> {
        // Try node.details -> fallback to active editor
        let labPath: string;
        if (!this.node) {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showErrorMessage(
                    'No lab node or topology file selected'
                );
                return;
            }
            labPath = editor.document.uri.fsPath;
        }
        else {
            labPath = this.node.labPath.absolute
        }

        if (!labPath) {
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

        const cmdArgs = [this.action, "-r", this.runtime, ...allFlags, "-t", labPath];

        // Return the promise from .execute() so we can await
        return this.execute(cmdArgs);
    }

}
