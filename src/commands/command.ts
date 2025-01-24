import * as vscode from 'vscode';
import * as utils from '../utils';
import { spawn } from 'child_process';
import { outputChannel } from '../extension';
import { ContainerlabNode } from '../containerlabTreeDataProvider';

export function execCommandInTerminal(command: string, terminalName: string) {
    let terminal;
    for (let term of vscode.window.terminals) {
        if (term.name.match(terminalName)) {
            terminal = term;
            // Ctrl+C in that terminal
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
 * Spawns a child process for the command and pipes its stdout/stderr
 * into the extension's Output channel. This won't be interactive,
 * but you see all the logs in real-time.
 */
export function execCommandInOutput(command: string) {
    const child = spawn(command, {
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    outputChannel.show(true);

    child.stdout.on('data', (data) => {
        outputChannel.append(data.toString());
    });

    child.stderr.on('data', (data) => {
        outputChannel.append(data.toString());
    });

    child.on('close', (code) => {
        outputChannel.appendLine(`Exited with code ${code}`);
        vscode.commands.executeCommand('containerlab.refresh');
    });
}

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

        // Build the command properly
        const cmdParts: string[] = [];

        // sudo?
        if (this.useSudo) {
            cmdParts.push("sudo");
        }

        // containerlab
        cmdParts.push("containerlab");


        // The subcommand (deploy, destroy, etc.)
        cmdParts.push(this.command);

        // Additional flags
        if (flags && flags.length > 0) {
            cmdParts.push(...flags);
        }

        // Finally, specify the topology file
        cmdParts.push("-t", `"${labPath}"`);

        // Combine into a single string
        const cmd = cmdParts.join(" ");

        // Run in Output or Terminal
        if (this.runInOutput) {
            execCommandInOutput(cmd);
        } else {
            const terminalName = utils.getRelLabFolderPath(labPath);
            execCommandInTerminal(cmd, terminalName);
        }
    }
}
