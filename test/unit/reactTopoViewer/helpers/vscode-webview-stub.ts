/**
 * VS Code Webview API stub for testing React TopoViewer hooks
 *
 * The webview code uses `vscode.postMessage()` to communicate with the extension.
 * This stub captures all messages for assertion in tests.
 */

/**
 * Message posted via vscode.postMessage()
 */
export interface PostedMessage {
  command: string;
  [key: string]: unknown;
}

/**
 * VS Code webview API mock with test utilities
 */
export interface VscodeApiMock {
  postMessage: (msg: unknown) => void;
  getState: () => Record<string, unknown>;
  setState: (state: Record<string, unknown>) => void;
  // Test utilities
  _getMessages: () => PostedMessage[];
  _clearMessages: () => void;
  _getLastMessage: () => PostedMessage | undefined;
  _getMessagesByCommand: (cmd: string) => PostedMessage[];
  _getMessageCount: () => number;
}

/**
 * Creates a new VS Code API mock instance
 */
export function createVscodeApiMock(): VscodeApiMock {
  const messages: PostedMessage[] = [];
  let state: Record<string, unknown> = {};

  return {
    postMessage: (msg: unknown) => {
      messages.push(msg as PostedMessage);
    },
    getState: () => ({ ...state }),
    setState: (newState: Record<string, unknown>) => {
      state = { ...newState };
    },
    // Test utilities
    _getMessages: () => [...messages],
    _clearMessages: () => {
      messages.length = 0;
    },
    _getLastMessage: () => messages[messages.length - 1],
    _getMessagesByCommand: (cmd: string) => messages.filter(m => m.command === cmd),
    _getMessageCount: () => messages.length
  };
}

let globalMock: VscodeApiMock | null = null;

/**
 * Sets up the global `vscode` mock on globalThis.
 * This is required because the hooks access `vscode` as a global.
 *
 * Returns the mock instance for test assertions.
 */
export function setupGlobalVscodeMock(): VscodeApiMock {
  const mock = createVscodeApiMock();
  globalMock = mock;

  // Set up on globalThis (works in Node.js)
  (globalThis as Record<string, unknown>).vscode = mock;

  // Also set window.vscode if window is defined
  if (typeof (globalThis as Record<string, unknown>).window !== 'undefined') {
    ((globalThis as Record<string, unknown>).window as Record<string, unknown>).vscode = mock;
  }

  return mock;
}

/**
 * Tears down the global VS Code mock.
 * Call this in afterEach() to clean up.
 */
export function teardownGlobalVscodeMock(): void {
  delete (globalThis as Record<string, unknown>).vscode;

  if (typeof (globalThis as Record<string, unknown>).window !== 'undefined') {
    delete ((globalThis as Record<string, unknown>).window as Record<string, unknown>).vscode;
  }

  globalMock = null;
}

/**
 * Gets the current global VS Code mock (if set up).
 * Useful for assertions after actions have been performed.
 */
export function getGlobalVscodeMock(): VscodeApiMock | null {
  return globalMock;
}

/**
 * Asserts that a specific command was posted with expected data.
 * Utility for common assertion pattern.
 */
export function assertMessagePosted(
  mock: VscodeApiMock,
  command: string,
  partialData?: Record<string, unknown>
): PostedMessage {
  const messages = mock._getMessagesByCommand(command);
  if (messages.length === 0) {
    throw new Error(`Expected message with command "${command}" but none was found. Posted messages: ${JSON.stringify(mock._getMessages().map(m => m.command))}`);
  }

  const message = messages[messages.length - 1];

  if (partialData) {
    for (const [key, value] of Object.entries(partialData)) {
      const actual = message[key];
      const expected = value;
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`Expected message.${key} to be ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
      }
    }
  }

  return message;
}

/**
 * Asserts that no message with the given command was posted.
 */
export function assertMessageNotPosted(mock: VscodeApiMock, command: string): void {
  const messages = mock._getMessagesByCommand(command);
  if (messages.length > 0) {
    throw new Error(`Expected no message with command "${command}" but found ${messages.length}. Data: ${JSON.stringify(messages)}`);
  }
}
