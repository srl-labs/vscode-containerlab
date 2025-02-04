// file: src/logger.ts


// aarafat-tag: 
// This is custom logger to provide the following log entry:
// time=2024-12-29T09:37:21Z level=info msg=Hello file=topoViewer.ts:108
// the objective is to provide quick code tracing during debugging. Im open to suggestion if there is better way to do the objective as long as not using heavy library.

import * as vscode from 'vscode';

/**
 * Create a single OutputChannel for logs.
 */
const outputChannel = vscode.window.createOutputChannel("TopoViewer Logs");

/**
 * Extract file name + line number from the call stack.
 * We'll parse compiled `.js` stack frames, 
 * which may differ slightly from your TypeScript lines.
 */
function getCallerFileLine(): string {
    const obj = {};
    Error.captureStackTrace(obj, getCallerFileLine);

    const stack = (obj as any).stack as string;
    if (!stack) return 'unknown:0';

    const lines = stack.split('\n');
    // Typically, index 3 or 4 is the real caller
    const callSite = lines[3] || lines[4] || '';

    const match = callSite.match(/\((.*?):(\d+):\d+\)/)
        || callSite.match(/at (.*?):(\d+):\d+/);
    if (!match) return 'unknown:0';

    const filePath = match[1]; // e.g. /path/to/out/topoViewer.js
    const lineNum = match[2];  // e.g. 108

    // Extract just the file name from the path
    const fileName = filePath.split(/[\\/]/).pop() ?? 'unknown';
    return `${fileName}:${lineNum}`;
}

/**
 * Logs a formatted message to the OutputChannel.
 *
 * @param level "info", "debug", "warn", "error", etc.
 * @param message The log message to display
 */
function logMessage(level: string, message: string): void {
    const now = new Date().toISOString(); // e.g. 2024-12-29T09:37:21.000Z
    const fileLine = getCallerFileLine(); // e.g. "topoViewer.ts:108"

    // Final log line:
    // time=2024-12-29T09:37:21Z level=info msg=Hello file=topoViewer.ts:108
    const logLine = `time=${now} level=${level} msg=${message} file=${fileLine}`;

    // Write to the OutputChannel
    outputChannel.appendLine(logLine);

    // If you want to auto-show the channel:
    // outputChannel.show(true);
}

/**
 * Export a `log` object with convenience methods.
 */
export const log = {
    info(msg: any) { logMessage('info', msg); },
    debug(msg: any) { logMessage('debug', msg); },
    warn(msg: any) { logMessage('warn', msg); },
    error(msg: any) { logMessage('error', msg); },
};
