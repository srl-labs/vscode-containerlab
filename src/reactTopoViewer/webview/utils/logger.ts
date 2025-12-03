/**
 * Logger utility for React TopoViewer webview
 * Posts log messages to the extension host via VS Code API
 */

/* eslint-disable no-unused-vars */
declare global {
  interface Window {
    vscode?: { postMessage(data: unknown): void };
  }
}
/* eslint-enable no-unused-vars */

type LogLevel = 'info' | 'debug' | 'warn' | 'error';

/**
 * Format message for logging
 */
function formatMessage(msg: unknown): string {
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
 * Get caller file and line for debugging
 */
function getCallerFileLine(): string {
  const obj: { stack?: string } = {};
  Error.captureStackTrace?.(obj, getCallerFileLine);

  const stack = obj.stack;
  if (!stack) return 'unknown:0';

  const lines = stack.split('\n');
  const callSite = lines[3] || lines[4] || '';

  const reParen = /\(([^():]+):(\d+):\d+\)/;
  const reAt = /at ([^():]+):(\d+):\d+/;
  const match = reParen.exec(callSite) || reAt.exec(callSite);
  if (!match) return 'unknown:0';

  const filePath = match[1];
  const lineNum = match[2];
  const fileName = filePath.split(/[\\/]/).pop() ?? 'unknown';
  return `${fileName}:${lineNum}`;
}

/**
 * Send log message to extension host
 */
function logMessage(level: LogLevel, message: unknown): void {
  const formatted = formatMessage(message);
  const fileLine = getCallerFileLine();

  const vscodeApi = typeof window !== 'undefined' ? window.vscode : undefined;
  if (vscodeApi && typeof vscodeApi.postMessage === 'function') {
    vscodeApi.postMessage({
      command: 'reactTopoViewerLog',
      level,
      message: formatted,
      fileLine
    });
  }
}

/**
 * Logger for React TopoViewer webview
 */
export const log = {
  info(msg: unknown): void {
    logMessage('info', msg);
  },
  debug(msg: unknown): void {
    logMessage('debug', msg);
  },
  warn(msg: unknown): void {
    logMessage('warn', msg);
  },
  error(msg: unknown): void {
    logMessage('error', msg);
  }
};
