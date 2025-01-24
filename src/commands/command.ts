import * as vscode from 'vscode';
import { spawn, exec } from 'child_process';
import { outputChannel } from '../extension';
import { ContainerlabNode } from '../containerlabTreeDataProvider';

export function execCommandInTerminal(command: string, terminalName: string) {
    const terminal = vscode.window.createTerminal({ name: terminalName })
    terminal.sendText(command);
    terminal.show();
    return;
}

// Run the command in a child process and write the output (stdio + stderr) to the 'Output' tab.
function execCommandInOutput(command: string) {
    // let clabProc = spawn(`${args.sudo ? "sudo" : ""} containerlab`, flags);
    let proc = exec(command)

    outputChannel.show(true);
    proc.stdout?.on('data', (data) => {
        outputChannel.append(data);
    });

    proc.stderr?.on('data', (data) => {
        outputChannel.append(data);
    });

    proc.on('close', (code) => {
        outputChannel.appendLine(`Exited with code ${code}`);
    });
    
    return;
}

export class ClabCommand {
    command: string;
    sudoless: boolean;
    node: ContainerlabNode;

    constructor(command: string, sudo: boolean | undefined, node: ContainerlabNode) {
        this.command = command;
        this.sudoless = sudo ? sudo : true; // if sudo is not provided, it's enabled by default
        this.node = node;
    }

    // run command
    run(flags: string[] | undefined) {
        let labPath;

        if(!(this.node instanceof ContainerlabNode)) {
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                labPath = editor.document.uri.fsPath;
            }
            else {
                vscode.window.showErrorMessage('No lab node or topology file selected');
                return;
            }
        } 
        else {
            labPath = this.node.details?.labPath;
        }
    
        if (!labPath) {
            vscode.window.showErrorMessage('No labPath to deploy.');
            return;
        }

        const cmd = `${this.sudo} containerlab ${this.command} ${flags ? flags?.toString() : ""} -t ${labPath}`;

        const terminalName = `${this.command[0].toUpperCase() + this.command.slice(1)} - ${labPath}`

        execCommandInTerminal(cmd, terminalName);
    }

    // whether to append sudo to the cmd
    get sudo(): string {
        return this.sudoless ? "sudo" : "";
    }
}