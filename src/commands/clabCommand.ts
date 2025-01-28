import * as vscode from "vscode";
import * as cmd from './command';
import { ClabLabTreeNode } from "../clabTreeDataProvider";

/**
 * A helper class to build a 'containerlab' command (with optional sudo, etc.)
 * and run it either in the Output channel or in a Terminal.
 */
export class ClabCommand extends cmd.Command  {
    private node?: ClabLabTreeNode;
    private action: string;

    constructor(
        action: string,
        node: ClabLabTreeNode,
        spinnerMsg?: cmd.SpinnerMsg,
        useTerminal?: boolean,
        terminalName?: string
    ) {
        const options: cmd.CmdOptions = {
            command: "containerlab",
            useSpinner: useTerminal ? false : true,
            spinnerMsg,
            terminalName,
        };
        super(options);

        this.action = action;
        this.node = node instanceof ClabLabTreeNode ? node : undefined;
    }

    public async run(flags?: string[]): Promise<void> {
        // Try node.details -> fallback to active editor
        let labPath: string;
        console.log(this.node);
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
        const cmdArgs = flags
            ? [this.action, flags.join(" "), "-t", labPath]
            : [this.action, "-t", labPath];

        // Return the promise from .execute() so we can await
        return this.execute(cmdArgs);
    }
}