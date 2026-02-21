/**
 * Logger utility for React TopoViewer webview
 * Posts log messages to the extension host via VS Code API
 */

import {
  type LogLevel,
  formatMessage,
  getCallerFileLine,
  createLogger,
} from "../../shared/utilities/loggerUtils";

declare global {
  interface Window {
    vscode?: { postMessage(data: unknown): void; __isDevMock__?: boolean };
  }
}

/**
 * Send log message to extension host
 */
function logMessage(level: LogLevel, message: unknown): void {
  const formatted = formatMessage(message);
  const fileLine = getCallerFileLine(1);

  const vscodeApi = typeof window !== "undefined" ? window.vscode : undefined;
  if (vscodeApi && typeof vscodeApi.postMessage === "function") {
    vscodeApi.postMessage({
      command: "reactTopoViewerLog",
      level,
      message: formatted,
      fileLine,
    });
  }
}

/**
 * Logger for React TopoViewer webview
 */
export const log = createLogger(logMessage);
