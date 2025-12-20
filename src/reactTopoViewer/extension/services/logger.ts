/**
 * Logger utility for React TopoViewer extension.
 * Writes to VS Code LogOutputChannel for better debugging experience.
 */

import * as vscode from 'vscode';

let outputChannel: vscode.LogOutputChannel | undefined;

/**
 * Get or create the log output channel for React TopoViewer.
 */
function getLogChannel(): vscode.LogOutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('TopoViewer React', { log: true });
  }
  return outputChannel;
}

type LogLevel = 'info' | 'debug' | 'warn' | 'error';

/**
 * Extract file name and line number from caller stack.
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
 * Format message for logging.
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
 * Core logging function that writes to VS Code output channel.
 */
function logMessage(level: LogLevel, message: unknown): void {
  const formatted = formatMessage(message);
  const fileLine = getCallerFileLine();
  const text = fileLine ? `${fileLine} - ${formatted}` : formatted;

  const channel = getLogChannel();
  switch (level) {
    case 'error':
      channel.error(text);
      break;
    case 'warn':
      channel.warn(text);
      break;
    case 'debug':
      channel.debug(text);
      break;
    default:
      channel.info(text);
  }
}

/**
 * Logger with convenience methods for all log levels.
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

/**
 * Log with explicit file:line location (for webview messages).
 * Used by MessageRouter to handle log messages from the webview.
 */
export function logWithLocation(level: string, message: string, fileLine?: string): void {
  const channel = getLogChannel();
  const text = fileLine ? `${fileLine} - ${message}` : message;
  switch (level) {
    case 'error': channel.error(text); break;
    case 'warn': channel.warn(text); break;
    case 'debug': channel.debug(text); break;
    default: channel.info(text);
  }
}
