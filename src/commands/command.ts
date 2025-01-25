import * as vscode from 'vscode';
import * as utils from '../utils';
import { exec, spawn } from 'child_process';
import { outputChannel } from '../extension';

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

export type CmdOptions = {
    command: string;
    useSpinner: boolean;
    terminalName?: string;
    spinnerMsg?: SpinnerMsg;
}

export type SpinnerMsg = {
    progressMsg: string;
    successMsg: string;
}

/**
 * A base command class which can be derived to build specific commmand classes (ie. Docker, Clab)
 */
export class Command {
    protected command: string;
    protected useSpinner: boolean;
    protected useSudo: boolean;
    protected spinnerMsg?: SpinnerMsg;
    protected terminalName?: string;

    constructor(options: CmdOptions) {
        this.command = options.command;
        this.useSpinner = options.useSpinner;

        if(this.useSpinner) {
            if(options.terminalName) throw new Error("useSpinner is true. terminalName should NOT be defined.");
            if(!options.spinnerMsg) throw new Error("useSpinner is true, but spinnerMsg is undefined.");
            this.spinnerMsg = options.spinnerMsg;
        }
        else {
            if(!options.terminalName) throw new Error("UseSpinner is false. terminalName must be defined.")
                this.terminalName = options.terminalName;
        }

        const config = vscode.workspace.getConfiguration("containerlab");
        this.useSudo = config.get<boolean>("sudoEnabledByDefault", true);
    }

    protected execute(args?: string[]) {
        let cmd: string[] = [];

        if(this.useSudo) cmd.push("sudo");
        cmd.push(this.command);
        if(args) cmd.push(...args);

        outputChannel.appendLine(`[${this.command}] Running: ${cmd.join(" ")}`);

        if(this.useSpinner) {
            this.execSpinner(cmd);
        }
        else {
            execCommandInTerminal(cmd.join(" "), this.terminalName!);
        }
    }

    private async execSpinner(cmd: string[]) {
        console.log(cmd);
        try {
            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: this.spinnerMsg?.progressMsg,
                    cancellable: true
                },
                async (progress, token) => {
                    return new Promise<void>((resolve, reject) => {
                        console.log(`xxx:  ${cmd[1]}`)
                        const child = spawn(cmd[0], cmd.slice(1));

                        // If user clicks Cancel, kill the child process
                        token.onCancellationRequested(() => {
                            child.kill();
                            reject(new Error(`User cancelled the '${this.command.toLowerCase()}' command.`));
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