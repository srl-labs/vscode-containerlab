/**
 * Helper utilities for sending messages from the React webview to the VS Code extension.
 */
import { log } from './logger';

declare global {
  interface Window {
    vscode?: { postMessage(data: unknown): void };
  }
}

/**
 * Get VS Code API instance exposed by the extension host.
 */
function getVscodeApi(): { postMessage(data: unknown): void } | undefined {
  return typeof window !== 'undefined' ? window.vscode : undefined;
}

/**
 * Send a fire-and-forget command message to the extension.
 */
export function sendCommandToExtension(command: string, payload?: Record<string, unknown>): void {
  const vscodeApi = getVscodeApi();
  if (!vscodeApi) {
    log.warn(`[ExtensionMessaging] VS Code API unavailable, command skipped: ${command}`);
    return;
  }

  const message = payload ? { command, ...payload } : { command };
  vscodeApi.postMessage(message);
  log.debug(`[ExtensionMessaging] Sent command: ${command}`);
}
