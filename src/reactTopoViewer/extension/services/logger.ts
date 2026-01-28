/**
 * Logger utility for React TopoViewer extension.
 * Writes to VS Code LogOutputChannel for better debugging experience.
 */

import * as vscode from "vscode";

import {
  type LogLevel,
  formatMessage,
  getCallerFileLine,
  createLogger
} from "../../shared/utilities/loggerUtils";

let outputChannel: vscode.LogOutputChannel | undefined;

/**
 * Get or create the log output channel for React TopoViewer.
 */
function getLogChannel(): vscode.LogOutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel("TopoViewer React", { log: true });
  }
  return outputChannel;
}

/**
 * Write log to VS Code channel based on level
 */
function writeToChannel(level: LogLevel, text: string): void {
  const channel = getLogChannel();
  switch (level) {
    case "error":
      channel.error(text);
      break;
    case "warn":
      channel.warn(text);
      break;
    case "debug":
      channel.debug(text);
      break;
    default:
      channel.info(text);
  }
}

/**
 * Core logging function that writes to VS Code output channel.
 */
function logMessage(level: LogLevel, message: unknown): void {
  const formatted = formatMessage(message);
  const fileLine = getCallerFileLine(1);
  const text = fileLine ? `${fileLine} - ${formatted}` : formatted;
  writeToChannel(level, text);
}

/**
 * Logger with convenience methods for all log levels.
 */
export const log = createLogger(logMessage);

/**
 * Log with explicit file:line location (for webview messages).
 * Used by MessageRouter to handle log messages from the webview.
 */
export function logWithLocation(level: string, message: string, fileLine?: string): void {
  const text = fileLine ? `${fileLine} - ${message}` : message;
  writeToChannel(level as LogLevel, text);
}
