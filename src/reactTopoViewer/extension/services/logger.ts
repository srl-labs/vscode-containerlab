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

function objectTag(value: unknown): string {
  return Object.prototype.toString.call(value);
}

export function formatUnknownForLog(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value instanceof Error) {
    return value.stack ?? value.message;
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return `${value}`;
  }
  if (typeof value === "symbol") {
    return value.toString();
  }
  if (typeof value === "function") {
    return `[function ${value.name || "anonymous"}]`;
  }
  if (value === undefined) {
    return "undefined";
  }
  if (value === null) {
    return "null";
  }
  try {
    return JSON.stringify(value);
  } catch {
    // Fall through to the object tag fallback.
  }

  return objectTag(value);
}

export function formatErrorMessage(error: unknown): string {
  const formatted = formatUnknownForLog(error);
  return formatted.length > 0 ? formatted : "Unknown error";
}

function getCallerFileLine(skipFrames: number = 0): string {
  const stack = new Error().stack;
  if (stack == null || stack.length === 0) {
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
  const formatted = formatUnknownForLog(message);
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
