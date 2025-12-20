import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import * as vscode from 'vscode';

import { outputChannel } from '../globals';
import * as utils from '../utils/index';

/**
 * Run a shell command in a named VS Code terminal.
 * @param command The command to execute
 * @param terminalName The name for the terminal
 * @param reuseOnly If true, just focus existing terminal without sending command again.
 *                  If false (default), reuses existing terminal with Ctrl+C and resends command.
 */
export function execCommandInTerminal(command: string, terminalName: string, reuseOnly: boolean = false) {
    for (const term of vscode.window.terminals) {
        if (term.name === terminalName) {
            if (reuseOnly) {
                // Terminal already exists - just focus it
                term.show();
                return;
            }
            // Send Ctrl+C & enter to stop any previous command, then resend
            term.sendText("\x03\r");
            term.sendText(command);
            term.show();
            return;
        }
    }

    // Terminal doesn't exist - create new one
    const terminal = vscode.window.createTerminal({ name: terminalName });
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
function splitArgs(input: string): string[] {
    const args: string[] = [];
    let current = '';
    let quote: '"' | "'" | null = null;

    for (let i = 0; i < input.length; i++) {
        const ch = input[i];

        // Inside a quoted segment
        if (quote) {
            if (ch === quote) { quote = null; continue; }
            current += ch; continue;
        }

        // Not in quotes
        if (ch === '"' || ch === "'") { quote = ch as any; continue; }
        if (ch === ' ') {
            if (current) { args.push(current); current = ''; }
            continue;
        }
        current += ch;
    }

    if (current) args.push(current);
    return args;
}

export async function execCommandInOutput(command: string, show?: boolean, stdoutCb?: Function, stderrCb?: Function) {
    const [cmd, ...args] = splitArgs(command);
    const proc = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });

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
export type CommandFailureHandler = (error: unknown) => Promise<void>;

export class Command {
    protected command: string;
    protected useSpinner: boolean;
    protected spinnerMsg?: SpinnerMsg;
    protected terminalName?: string;
    protected onSuccessCallback?: () => Promise<void>;
    protected onFailureCallback?: CommandFailureHandler;

    constructor(options: CmdOptions) {
        this.command = options.command;
        this.useSpinner = options.useSpinner || false;
        this.spinnerMsg = options.spinnerMsg;
        this.terminalName = options.terminalName;
    }

    protected execute(args?: string[]): Promise<void> {
        let cmd: string[] = [];

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

    private getCwd(): string {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const cwd = workspaceFolder ?? path.join(os.homedir(), ".clab");
        if (!workspaceFolder) {
            try {
                fs.mkdirSync(cwd, { recursive: true });
            } catch {
                // ignore errors creating fallback dir
            }
        }
        return cwd;
    }

    private handleOutput(data: Buffer, progress: vscode.Progress<{ message?: string }>, toProgress: boolean) {
        const lines = data.toString().split("\n");
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) { continue; }
            const cleanLine = utils.stripAnsi(trimmed);
            if (toProgress) {
                progress.report({ message: cleanLine });
            }
            outputChannel.info(cleanLine);
        }
    }

    private runChildProcess(cmd: string[], cwd: string, progress: vscode.Progress<{ message?: string }>, token: vscode.CancellationToken) {
        return new Promise<void>((resolve, reject) => {
            const child = spawn(cmd[0], cmd.slice(1), { cwd });

            token.onCancellationRequested(() => {
                child.kill();
                reject(new Error(`User cancelled the '${this.command.toLowerCase()}' command.`));
            });

            child.stdout.on("data", (data: Buffer) => this.handleOutput(data, progress, true));
            child.stderr.on("data", (data: Buffer) => this.handleOutput(data, progress, false));

            child.on("close", (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`Process exited with code ${code}`));
                }
            });
        });
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
                    progress.report({ message: " [View Logs](command:containerlab.viewLogs)" });
                    const cwd = this.getCwd();
                    await this.runChildProcess(cmd, cwd, progress, token);
                }
            );

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
            const command = cmd[1];
            const failMsg = this.spinnerMsg?.failMsg ? `${this.spinnerMsg.failMsg}. Err: ${err}` : `${utils.titleCase(command)} failed: ${err.message}`;
            const viewOutputBtn = await vscode.window.showErrorMessage(failMsg, "View logs");
            if (viewOutputBtn === "View logs") { outputChannel.show(); }
            if (this.onFailureCallback) {
                await this.onFailureCallback(err);
            }
        }
    }

}
