/**
 * Shared logging utility for the TopoViewer extension and its webview.
 *
 * The logger writes to a VS Code {@link import('vscode').LogOutputChannel}
 * when the extension API is available. When used inside the webview, log
 * messages are posted to the extension host via `window.vscode.postMessage`.
 * As a last resort, messages fall back to the browser or Node console.
 */


// Declaration for environments where `require` may not exist.
declare const require: any;

// Attempt to create a VS Code log output channel. This will only succeed in
// the extension host where the `vscode` module is available. In a webview
// context `window` is defined, so we skip this step entirely.
let outputChannel: import('vscode').LogOutputChannel | undefined;
try {
  if (typeof window === 'undefined' && typeof require !== 'undefined') {
    const vscode = require('vscode') as typeof import('vscode');
    outputChannel = vscode.window.createOutputChannel('TopoViewer Logs', {
      log: true
    });
  }
} catch {
  outputChannel = undefined;
}

type LogLevel = 'info' | 'debug' | 'warn' | 'error';

/**
 * Extracts the file name and line number of the calling site.
 *
 * @returns A string in the form `"file.ts:42"` or `"unknown:0"` when the
 * information cannot be determined.
 */
function getCallerFileLine(): string {
  const obj: { stack?: string } = {};
  Error.captureStackTrace?.(obj, getCallerFileLine);

  const stack = obj.stack;
  if (!stack) return 'unknown:0';

  const lines = stack.split('\n');
  const callSite = lines[3] || lines[4] || '';

  const match =
    callSite.match(/\((.*?):(\d+):\d+\)/) ||
    callSite.match(/at (.*?):(\d+):\d+/);
  if (!match) return 'unknown:0';

  const filePath = match[1];
  const lineNum = match[2];
  const fileName = filePath.split(/[\\/]/).pop() ?? 'unknown';
  return `${fileName}:${lineNum}`;
}

/**
 * Converts the provided message into a string suitable for logging.
 *
 * @param msg - Any value to be logged.
 * @returns The message formatted as a string.
 */
function formatMessage(msg: any): string {
  if (typeof msg === 'string') return msg;
  if (typeof msg === 'object' && msg !== null) {
    try {
      return JSON.stringify(msg);
    } catch {
      return String(msg);
    }
  }
  return String(msg);
}

/**
 * Core logging routine. Depending on the environment it either writes to the
 * VS Code log output channel, posts a message to the extension host or falls
 * back to `console`.
 *
 * @param level - Severity of the log message.
 * @param message - The message to log.
 */
function logMessage(level: LogLevel, message: any): void {
  const formatted = formatMessage(message);
  const fileLine = getCallerFileLine();

  const text = fileLine ? `${fileLine} - ${formatted}` : formatted;

  if (outputChannel) {
    (outputChannel as any)[level](text);
    return;
  }

  const vscodeApi = typeof window !== 'undefined' ? window.vscode : undefined;
  if (vscodeApi && typeof vscodeApi.postMessage === 'function') {
    vscodeApi.postMessage({
      command: 'topoViewerLog',
      level,
      message: formatted,
      fileLine
    });
    return;
  }

  const consoleFn = (console as any)[level] || console.log;
  consoleFn(text);
}

/**
 * Logger with convenience methods for all supported log levels.
 */
export const log = {
  info(msg: any): void {
    logMessage('info', msg);
  },
  debug(msg: any): void {
    logMessage('debug', msg);
  },
  warn(msg: any): void {
    logMessage('warn', msg);
  },
  error(msg: any): void {
    logMessage('error', msg);
  }
};
export const logInfo = log.info;
export const logDebug = log.debug;
export const logWarn = log.warn;
export const logError = log.error;

