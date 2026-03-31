/**
 * Logger utility for React TopoViewer extension.
 * Writes to VS Code LogOutputChannel for better debugging experience.
 */

import * as vscode from "vscode";

type LogLevel = "info" | "debug" | "warn" | "error";

let outputChannel: vscode.LogOutputChannel | undefined;

/**
 * Get or create the log output channel for React TopoViewer.
 */
function getLogChannel(): vscode.LogOutputChannel {
  outputChannel ??= vscode.window.createOutputChannel("TopoViewer React", { log: true });
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

function toLogLevel(level: string): LogLevel {
  switch (level) {
    case "debug":
    case "warn":
    case "error":
    case "info":
      return level;
    default:
      return "info";
  }
}

function formatMessage(message: unknown): string {
  if (typeof message === "string") {
    return message;
  }
  if (message instanceof Error) {
    return message.stack ?? message.message;
  }
  if (message === undefined) {
    return "undefined";
  }
  if (message === null) {
    return "null";
  }
  try {
    return JSON.stringify(message);
  } catch {
    return String(message);
  }
}

function getCallerFileLine(skipFrames: number = 0): string {
  const stack = new Error().stack;
  if (!stack) {
    return "";
  }

  const lines = stack.split("\n").slice(1);
  const targetLine = lines[3 + skipFrames] ?? "";
  const match = targetLine.match(/(?:\/|\\)([^/\\]+:\d+:\d+)/);
  return match?.[1] ?? "";
}

function createLogger(logFn: (level: LogLevel, message: unknown) => void): {
  info(msg: unknown): void;
  debug(msg: unknown): void;
  warn(msg: unknown): void;
  error(msg: unknown): void;
} {
  return {
    info: (message: unknown) => {
      logFn("info", message);
    },
    debug: (message: unknown) => {
      logFn("debug", message);
    },
    warn: (message: unknown) => {
      logFn("warn", message);
    },
    error: (message: unknown) => {
      logFn("error", message);
    }
  };
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
  const text =
    fileLine === undefined || fileLine.length === 0 ? message : `${fileLine} - ${message}`;
  writeToChannel(toLogLevel(level), text);
}
