import * as vscode from 'vscode';
import * as utils from '../utils';
import { spawn, exec } from 'child_process';
import { outputChannel } from '../extension';
import { ContainerlabNode } from '../containerlabTreeDataProvider';

export function execCommandInTerminal(command: string, terminalName: string) {
    let terminal;

    // Try to reuse an existing terminal with the same name
    for (let term of vscode.window.terminals) {
        if (term.name.match(terminalName)) {
            terminal = term;
            // Send Ctrl+C to kill any running process in that terminal
            term.sendText("\x03");
            break;
        }
    }

    if(!terminal) {
        terminal = vscode.window.createTerminal({name: terminalName});
    }

    terminal.sendText(command);
    terminal.show();
    return;
}

// (Optional) If you want to run commands in the Output channel instead of Terminal:
function execCommandInOutput(command: string) {
    let proc = exec(command);

    outputChannel.show(true);
    proc.stdout?.on('data', (data) => {
        // strip ANSI escape codes
        outputChannel.append(
            data.toString().replace(
                /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, 
                ""
            )
        );
    });

    proc.stderr?.on('data', (data) => {
        outputChannel.append(data);
    });

    proc.on('close', (code) => {
        outputChannel.appendLine(`Exited with code ${code}`);
        // trigger a refresh after execution.
        console.debug("Refreshing");
        vscode.commands.executeCommand('containerlab.refresh');
    });
    return;
}

export class ClabCommand {
    command: string;
    node: ContainerlabNode;
    private useSudo: boolean;

    constructor(command: string, node: ContainerlabNode) {
        this.command = command;
        this.node = node;
        // Read from user settings whether we prepend 'sudo'
        const config = vscode.workspace.getConfiguration("containerlab");
        this.useSudo = config.get<boolean>("sudoEnabledByDefault", true);
    }

    // run command
    run(flags?: string[]) {
        let labPath;

        if(!(this.node instanceof ContainerlabNode)) {
            // Fallback to active editor if no node is passed
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                labPath = editor.document.uri.fsPath;
            } else {
                vscode.window.showErrorMessage('No lab node or topology file selected');
                return;
            }
        } else {
            labPath = this.node.details?.labPath;
        }

        if (!labPath) {
            vscode.window.showErrorMessage(`No labPath found for command "${this.command}".`);
            return;
        }

        // Build the final command
        const flagsString = flags && flags.length > 0 
            ? flags.join(" ") 
            : "";

        // Prepend 'sudo' if user setting is true
        const cmd = `${this.useSudo ? "sudo " : ""}containerlab ${this.command} ${flagsString} -t "${labPath}"`;

        // We'll send it to the integrated Terminal
        const terminalName = utils.getRelLabFolderPath(labPath);
        execCommandInTerminal(cmd, terminalName);

        // Or if you prefer output channel:
        // execCommandInOutput(cmd);
    }
}
