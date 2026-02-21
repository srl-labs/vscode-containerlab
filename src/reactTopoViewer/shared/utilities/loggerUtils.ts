/**
 * Shared logging utilities used by both extension and webview loggers
 */

export type LogLevel = "info" | "debug" | "warn" | "error";

/**
 * Format message for logging
 */
export function formatMessage(msg: unknown): string {
  if (typeof msg === "string") return msg;
  if (typeof msg === "object" && msg !== null) {
    try {
      return JSON.stringify(msg);
    } catch {
      return String(msg);
    }
  }
  return String(msg);
}

/**
 * Extract file name and line number from caller stack.
 * @param skipFrames Number of additional stack frames to skip (default 0)
 */
export function getCallerFileLine(skipFrames = 0): string {
  const obj: { stack?: string } = {};
  Error.captureStackTrace(obj, getCallerFileLine);

  const stack = obj.stack;
  if (stack === undefined || stack.length === 0) return "unknown:0";

  const lines = stack.split("\n");
  const baseIndex = 3 + skipFrames;
  const callSite = lines[baseIndex] || lines[baseIndex + 1] || "";

  const reParen = /\(([^():]+):(\d+):\d+\)/;
  const reAt = /at ([^():]+):(\d+):\d+/;
  const match = reParen.exec(callSite) ?? reAt.exec(callSite);
  if (!match) return "unknown:0";

  const filePath = match[1];
  const lineNum = match[2];
  const fileName = filePath.split(/[\\/]/).pop() ?? "unknown";
  return `${fileName}:${lineNum}`;
}

/**
 * Create a standard logger object from a logging function
 */
export function createLogger(logFn: (level: LogLevel, message: unknown) => void) {
  return {
    info(msg: unknown): void {
      logFn("info", msg);
    },
    debug(msg: unknown): void {
      logFn("debug", msg);
    },
    warn(msg: unknown): void {
      logFn("warn", msg);
    },
    error(msg: unknown): void {
      logFn("error", msg);
    },
  };
}
