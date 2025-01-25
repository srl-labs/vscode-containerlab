import * as vscode from 'vscode';
import * as utils from '../utils';
import { exec, spawn } from 'child_process';
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

export type ClabCmdOpts = {
    command: string;
    node: ContainerlabNode;
    runInTerminal: boolean;
    spinnerMsg?: SpinnerMsg;
}

export type SpinnerMsg = {
    progressMsg: string;
    successMsg: string;
}

/**
 * A helper class to build a 'containerlab' command (with optional sudo, etc.)
 * and run it either in the Output channel or in a Terminal.
 */
export class ClabCommand {
    private command: string;
    private node: ContainerlabNode;
    private useSudo: boolean;
    private runInSpinner: boolean;
    private spinnerMsg?: SpinnerMsg;

    constructor(options: ClabCmdOpts) {
        this.command = options.command;
        this.node = options.node;

        this.runInSpinner = options.runInTerminal ? false : true;
        if (this.runInSpinner) {
            if (!options.spinnerMsg) {
                throw new Error(`${options.command} ClabCommand is using spinner, but spinnerMsg is not defined`);
            }
            else {
                this.spinnerMsg = options.spinnerMsg;
            }
        }

        const config = vscode.workspace.getConfiguration("containerlab");
        this.useSudo = config.get<boolean>("sudoEnabledByDefault", true);
    }

    public async run(flags?: string[]) {
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
        let cmdParts: string[] = [];

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
        cmdParts.push("-t", labPath);

        // Combine into a single string
        const cmd = cmdParts.join(" ");

        outputChannel.appendLine(`[${this.command}] Running: ${cmd}`);

        // Decide: Output channel or Terminal?
        if (this.runInSpinner) {
            // pass cmdParts as it's an array.
            this.execSpinner(cmdParts);
        } else {
            const terminalName = utils.getRelLabFolderPath(labPath);
            execCommandInTerminal(cmd, terminalName);
        }
    }

    private async execSpinner(cmd: string[]) {
        try {
            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: this.spinnerMsg?.progressMsg,
                    cancellable: true
                },
                async (progress, token) => {
                    return new Promise<void>((resolve, reject) => {
                        const child = spawn(cmd[0], cmd.slice(1));

                        // If user clicks Cancel, kill the child process
                        token.onCancellationRequested(() => {
                            child.kill();
                            reject(new Error(`User cancelled the ${this.command.toLowerCase()} command.`));
                        });

                        // On stdout, parse lines and update spinner + output channel
                        child.stdout.on("data", (data: Buffer) => {
                            const lines = data.toString().split("\n");
                            for (const line of lines) {
                                const trimmed = line.trim();
                                if (trimmed) {
                                    const cleanLine = utils.stripAnsi(trimmed);
                                    progress.report({ message: cleanLine });
                                    outputChannel.appendLine(cleanLine);
                                }
                            }
                        });

                        // stderr lines → output channel only
                        child.stderr.on("data", (data: Buffer) => {
                            const lines = data.toString().split("\n");
                            for (const line of lines) {
                                const trimmed = line.trim();
                                if (trimmed) {
                                    outputChannel.appendLine(`[stderr] ${utils.stripAnsi(trimmed)}`);
                                }
                            }
                        });

                        // When the process completes
                        child.on("close", (code) => {
                            if (code === 0) {
                                resolve();
                            } else {
                                reject(new Error(`Process exited with code ${code}`));
                            }
                        });
                    });
                }
            );

            // If we get here, the command succeeded
            vscode.window
                .showInformationMessage(this.spinnerMsg?.successMsg!, "Show Logs")
                .then((choice) => {
                    if (choice === "Show Logs") {
                        outputChannel.show(true);
                    }
                });

            vscode.commands.executeCommand("containerlab.refresh");
        } catch (err: any) {
            vscode.window.showErrorMessage(`${this.command} failed: ${err.message}`);
        }
    }
}