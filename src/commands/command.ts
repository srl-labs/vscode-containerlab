import * as vscode from 'vscode';
import * as utils from '../utils'
import { spawn, exec } from 'child_process';
import { outputChannel } from '../extension';
import { ContainerlabNode } from '../containerlabTreeDataProvider';

export function execCommandInTerminal(command: string, terminalName: string) {

    let terminal;

    for(let term of vscode.window.terminals) {
        if (term.name.match(terminalName)) {
            terminal = term;
            term.sendText("\x03")
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

// Run the command in a child process and write the output (stdio + stderr) to the 'Output' tab.
function execCommandInOutput(command: string) {
    // let clabProc = spawn(`${args.sudo ? "sudo" : ""} containerlab`, flags);
    let proc = exec(command);

    outputChannel.show(true);
    proc.stdout?.on('data', (data) => {
        // strip ANSI escape codes
        outputChannel.append(data.toString().replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, ""));
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
    sudoless: boolean;
    node: ContainerlabNode;

    constructor(command: string, sudo: boolean | undefined, node: ContainerlabNode) {
        this.command = command;
        this.sudoless = sudo ? sudo : true; // if sudo is not provided, it's enabled by default
        this.node = node;
    }

    // run command
    run(flags?: string[]) {
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

        const cmd = `${this.sudo} containerlab ${this.command} ${flags ? flags?.toString().replace(",", " ") : ""} -t ${labPath}`;

        // const terminalName = `${this.command[0].toUpperCase() + this.command.slice(1)} - ${labPath}`
        const terminalName =  utils.getRelLabFolderPath(labPath);

        execCommandInTerminal(cmd, terminalName);
        // execCommandInOutput(cmd);
    }

    // whether to append sudo to the cmd
    get sudo(): string {
        return this.sudoless ? "sudo" : "";
    }
}