import * as vscode from 'vscode';
import * as utils from '../helpers/utils';
import { exec, spawn } from 'child_process';
import { outputChannel } from '../extension';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * Run a shell command in a named VS Code terminal.
 * If that terminal already exists, we send a Ctrl+C first.
 */
export function execCommandInTerminal(command: string, terminalName: string) {
    let terminal: vscode.Terminal | undefined;
    for (const term of vscode.window.terminals) {
        if (term.name === terminalName) {
            terminal = term;
            // Send Ctrl+C & enter to stop any previous command
            term.sendText("\x03\r");
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
 * We *strip ANSI codes* from both stdout and stderr
 * We trigger a refresh after it finishes.
 *
 * @param command Command to execute in output.
 * @param show Whether to focus the output channel or not.
 * @param stdoutCb Optional extra function to run on stdout data event. The process and cleaned stdout data is passed to the func.
 * @param stderrCb Optional extra function to run on stderr data. The process and Cleaned stderr data is passed to the func
 */
export async function execCommandInOutput(command: string, show?: boolean, stdoutCb?: Function, stderrCb?: Function) {
    let proc = exec(command);

    if (show) { outputChannel.show(); }

    proc.stdout?.on('data', (data) => {
        const cleaned = utils.stripAnsi(data.toString());
        outputChannel.info(cleaned);
        if (stdoutCb) { stdoutCb(proc, cleaned); }
    });

    proc.stderr?.on('data', (data) => {
        const cleaned = utils.stripAnsi(data.toString());
        outputChannel.info(cleaned);
        if (stderrCb) { stderrCb(proc, cleaned); }
    });

    proc.on('close', (code) => {
        outputChannel.info(`Exited with code ${code}`);
        // trigger a refresh after execution
        vscode.commands.executeCommand('containerlab.refresh');
    });
}

export type SpinnerOptions = {
    useSpinner?: true;
    command: string;
    spinnerMsg: SpinnerMsg;
    terminalName?: never;
};

export type TerminalOptions = {
    useSpinner?: false;
    command: string;
    terminalName: string;
    spinnerMsg?: never;
};

export type CmdOptions = SpinnerOptions | TerminalOptions;

export type SpinnerMsg = {
    progressMsg: string;
    successMsg: string;
    failMsg?: string;
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
    protected onSuccessCallback?: () => Promise<void>;

    constructor(options: CmdOptions) {
        this.command = options.command;
        this.useSpinner = options.useSpinner || false;
        this.spinnerMsg = options.spinnerMsg;
        this.terminalName = options.terminalName;
        this.useSudo = utils.getConfig('sudoEnabledByDefault');
    }

    protected execute(args?: string[]): Promise<void> {
        let cmd: string[] = [];

        if (this.useSudo) { cmd.push("sudo"); }
        cmd.push(this.command);
        if (args) { cmd.push(...args); }

        outputChannel.info(`[${this.command}] Running: ${cmd.join(" ")}`);

        if (this.useSpinner) {
            return this.execSpinner(cmd);
        }
        else {
            execCommandInTerminal(cmd.join(" "), this.terminalName!);
            return Promise.resolve();
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

                    progress.report({
                        message: " [View Logs](command:containerlab.viewLogs)"
                    });

                    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                    const cwd = workspaceFolder ?? path.join(os.homedir(), ".clab");
                    if (!workspaceFolder) {
                        try {
                            fs.mkdirSync(cwd, { recursive: true });
                        } catch {
                            // ignore errors creating fallback dir
                        }
                    }

                    return new Promise<void>((resolve, reject) => {
                        const child = spawn(cmd[0], cmd.slice(1), { cwd });

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
                                    outputChannel.info(cleanLine);
                                }
                            }
                        });

                        // stderr lines → output channel only
                        child.stderr.on("data", (data: Buffer) => {
                            const lines = data.toString().split("\n");
                            for (const line of lines) {
                                const trimmed = line.trim();
                                if (trimmed) {
                                    outputChannel.info(`${utils.stripAnsi(trimmed)}`);
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
            // Call the success callback NOW, when the success message appears
            if (this.onSuccessCallback) {
                await this.onSuccessCallback();
            }

            vscode.window
                .showInformationMessage(this.spinnerMsg?.successMsg!, "Show Logs")
                .then((choice) => {
                    if (choice === "Show Logs") {
                        outputChannel.show(true);
                    }
                });

            await vscode.commands.executeCommand("containerlab.refresh");
        } catch (err: any) {
            const command = this.useSudo ? cmd[2] : cmd[1];
            const failMsg = this.spinnerMsg?.failMsg ? `this.spinnerMsg.failMsg. Err: ${err}` : `${utils.titleCase(command)} failed: ${err.message}`;
            const viewOutputBtn = await vscode.window.showErrorMessage(failMsg, "View logs");
            // If view logs button was clicked.
            if (viewOutputBtn === "View logs") { outputChannel.show(); }
        }
    }

}