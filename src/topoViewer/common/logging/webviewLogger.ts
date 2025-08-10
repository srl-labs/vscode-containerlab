// logger.ts - Webview-compatible logging utility for TopoViewer
// This logger sends messages to the VS Code extension host via the webview messaging API

// Logger interface for webview context
interface LogLevel {
  INFO: 'info';
  DEBUG: 'debug';
  WARN: 'warn';
  ERROR: 'error';
}

const LOG_LEVELS: LogLevel = {
  INFO: 'info',
  DEBUG: 'debug',
  WARN: 'warn',
  ERROR: 'error'
} as const;

type LogLevelType = LogLevel[keyof LogLevel];

/**
 * Extract file name + line number from the call stack for webview context.
 */
function getCallerFileLine(): string {
  const obj = {};
  Error.captureStackTrace?.(obj, getCallerFileLine);

  const stack = (obj as any).stack as string;
  if (!stack) return 'unknown:0';

  const lines = stack.split('\n');
  // Look for the caller (skip this function and logMessage)
  const callSite = lines[3] || lines[4] || '';

  const match = callSite.match(/\((.*?):(\d+):\d+\)/)
    || callSite.match(/at (.*?):(\d+):\d+/);
  if (!match) return 'unknown:0';

  const filePath = match[1];
  const lineNum = match[2];

  // Extract just the file name from the path
  const fileName = filePath.split(/[\\/]/).pop() ?? 'unknown';
  return `${fileName}:${lineNum}`;
}

/**
 * Send log message to VS Code extension host
 */
function sendLogToExtension(level: LogLevelType, message: string, fileLine: string): void {
  const timestamp = new Date().toISOString();
  const logData = {
    command: 'topoViewerLog',
    level,
    message,
    fileLine,
    timestamp
  };

  // Send message to VS Code extension host
  if (typeof (window as any).vscode !== 'undefined') {
    (window as any).vscode.postMessage(logData);
  }
  // Note: Removed console.log fallback to eliminate console output spam
}

/**
 * Format message with proper string conversion
 */
function formatMessage(msg: any): string {
  if (typeof msg === 'string') {
    return msg;
  }
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
 * Main logging function
 */
function logMessage(level: LogLevelType, message: any): void {
  const formattedMessage = formatMessage(message);
  const fileLine = getCallerFileLine();
  sendLogToExtension(level, formattedMessage, fileLine);
}

/**
 * Export a `log` object with convenience methods for webview usage.
 * This replaces all console.log calls in the webview UI.
 */
export const log = {
  info(msg: any): void {
    logMessage(LOG_LEVELS.INFO, msg);
  },
  debug(msg: any): void {
    logMessage(LOG_LEVELS.DEBUG, msg);
  },
  warn(msg: any): void {
    logMessage(LOG_LEVELS.WARN, msg);
  },
  error(msg: any): void {
    logMessage(LOG_LEVELS.ERROR, msg);
  }
};

// Also export individual functions for convenience
export const logInfo = log.info;
export const logDebug = log.debug;
export const logWarn = log.warn;
export const logError = log.error;
