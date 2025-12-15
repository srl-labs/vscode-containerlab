/**
 * VscodeApiMock - Mock VS Code webview API for dev mode
 *
 * Simulates the `window.vscode` object that the webview uses to
 * communicate with the VS Code extension.
 */

import type { MessageHandler } from './MessageHandler';

// ============================================================================
// Types
// ============================================================================

export interface VSCodeAPIMock {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

export interface VscodeApiMockConfig {
  /** Enable verbose logging of all messages */
  verbose?: boolean;
  /** Storage key for persisted state */
  storageKey?: string;
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a mock VS Code API instance
 */
export function createVscodeApiMock(
  messageHandler: MessageHandler,
  config: VscodeApiMockConfig = {}
): VSCodeAPIMock {
  const { verbose = true, storageKey = 'topoviewer-dev-state' } = config;

  return {
    postMessage: (message: unknown) => {
      if (verbose) {
        console.log(
          '%c[postMessage -> Extension]',
          'color: #4CAF50; font-weight: bold;',
          message
        );
      }

      // Route to message handler
      messageHandler.handleMessage(message);
    },

    getState: () => {
      try {
        return JSON.parse(localStorage.getItem(storageKey) || '{}');
      } catch {
        return {};
      }
    },

    setState: (state: unknown) => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(state));
      } catch (e) {
        console.warn('[VscodeApiMock] Failed to persist state:', e);
      }
    }
  };
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Install the mock VS Code API on window
 */
export function installVscodeApiMock(mock: VSCodeAPIMock): void {
  (window as { vscode?: VSCodeAPIMock }).vscode = mock;
}

/**
 * Uninstall the mock VS Code API from window
 */
export function uninstallVscodeApiMock(): void {
  delete (window as { vscode?: VSCodeAPIMock }).vscode;
}

/**
 * Send a message from the "extension" to the webview
 * This simulates receiving a message via window.addEventListener('message')
 */
export function sendMessageToWebview(message: unknown): void {
  window.postMessage(message, '*');
}

/**
 * Send a message with logging
 */
export function sendMessageToWebviewWithLog(
  message: unknown,
  label?: string
): void {
  console.log(
    `%c[Extension -> Webview]${label ? ` (${label})` : ''}`,
    'color: #FF9800; font-weight: bold;',
    message
  );
  sendMessageToWebview(message);
}
