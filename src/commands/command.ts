import * as vscode from 'vscode';
import * as utils from '../utils';
import { exec } from 'child_process';
import { outputChannel } from '../extension';
import { ContainerlabNode } from '../containerlabTreeDataProvider';

/**
 * Run a shell command in a named VS Code terminal.
 * If that terminal already exists, we send a Ctrl+C first.
 */
export function execCommandInTerminal(command: string, terminalName: string) {
    let terminal: vscode.Terminal | undefined;
    for (const term of vscode.window.terminals) {
        if (term.name.match(terminalName)) {
            terminal = term;
            // Send Ctrl+C to stop any previous command
            term.sendText("\x03");
            break;
        }
    }
    if (!terminal) {
        terminal = vscode.window.createTerminal({ name: terminalName });
    }
    terminal.sendText(command);
    terminal.show();
}

/**
 * Execute a shell command in the extension's Output channel.
 * - We *strip ANSI codes* from both stdout and stderr
 * - We trigger a refresh after it finishes.
 */
export function execCommandInOutput(command: string) {
    let proc = exec(command);

    outputChannel.show(true);

    proc.stdout?.on('data', (data) => {
        const cleaned = utils.stripAnsi(data.toString());
        outputChannel.append(cleaned);
    });

    proc.stderr?.on('data', (data) => {
        const cleaned = utils.stripAnsi(data.toString());
        outputChannel.append(cleaned);
    });

    proc.on('close', (code) => {
        outputChannel.appendLine(`Exited with code ${code}`);
        // trigger a refresh after execution
        vscode.commands.executeCommand('containerlab.refresh');
    });
}

/**
 * A helper class to build a 'containerlab' command (with optional sudo, etc.)
 * and run it either in the Output channel or in a Terminal.
 */
export class ClabCommand {
    private command: string;
    private node: ContainerlabNode;
    private useSudo: boolean;
    private runInOutput: boolean;

    constructor(command: string, node: ContainerlabNode, runInOutput?: boolean) {
        this.command = command;
        this.node = node;

        const config = vscode.workspace.getConfiguration("containerlab");
        this.useSudo = config.get<boolean>("sudoEnabledByDefault", true);
        this.runInOutput = runInOutput || false;
    }

    public run(flags?: string[]) {
        // Try node.details -> fallback to active editor
        let labPath = this.node?.details?.labPath;
        if (!labPath) {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showErrorMessage('No lab node or topology file selected');
                return;
            }
            labPath = editor.document.uri.fsPath;
        }

        if (!labPath) {
            vscode.window.showErrorMessage(`No labPath found for command "${this.command}".`);
            return;
        }

        // Build the command array
        const cmdParts: string[] = [];

        // Sudo if configured
        if (this.useSudo) {
            cmdParts.push("sudo");
        }

        // containerlab
        cmdParts.push("containerlab");

        // Subcommand (deploy, destroy, etc.)
        cmdParts.push(this.command);

        // Additional flags
        if (flags && flags.length > 0) {
            cmdParts.push(...flags);
        }

        // Finally the topology file
        cmdParts.push("-t", `"${labPath}"`);

        // Combine into a single string
        const cmd = cmdParts.join(" ");

        // Decide: Output channel or Terminal?
        if (this.runInOutput) {
            execCommandInOutput(cmd);
        } else {
            const terminalName = utils.getRelLabFolderPath(labPath);
            execCommandInTerminal(cmd, terminalName);
        }
    }
}