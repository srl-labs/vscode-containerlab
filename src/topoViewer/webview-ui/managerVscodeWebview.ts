// file: managerVscodeWebview.ts

import { log } from '../logging/logger';

// This function is typically provided by the VS Code environment.
declare function acquireVsCodeApi(): any;

// Acquire VS Code API once and expose it on the window for shared logging
const vscodeApi: any = (() => {
  try {
    return (window as any).vscode ?? acquireVsCodeApi?.();
  } catch {
    return undefined;
  }
})();

if (vscodeApi) {
  (window as any).vscode = vscodeApi;
}

interface PendingRequest {
  resolve: Function;
  reject: Function;
  owner: VscodeMessageSender;
}

// eslint-disable-next-line no-unused-vars
type SharedMessageHandler = (event: MessageEvent) => void;

let sharedMessageHandler: SharedMessageHandler | null = null;
let sharedPendingRequests: Map<string, PendingRequest> | null = null;
let sharedRequestCounter = 0;
let activeSenderCount = 0;
let sharedLogger: LoggerLike = log;

const getPendingStore = (): Map<string, PendingRequest> => {
  if (!sharedPendingRequests) {
    sharedPendingRequests = new Map();
  }
  return sharedPendingRequests;
};

const ensureMessageHandler = (): void => {
  if (sharedMessageHandler) {
    return;
  }
  sharedMessageHandler = (event: MessageEvent): void => {
    const msg = event.data;
    if (msg && msg.type === 'POST_RESPONSE') {
      const pending = getPendingStore().get(msg.requestId);
      if (!pending) {
        sharedLogger.warn(`Received response for unknown requestId: ${msg.requestId}`);
        return;
      }
      getPendingStore().delete(msg.requestId);
      const { resolve, reject } = pending;
      if (msg.error) {
        reject(new Error(msg.error));
      } else {
        resolve(msg.result);
      }
    }
  };
  window.addEventListener('message', sharedMessageHandler);
};

const cleanupMessageHandler = (): void => {
  if (sharedMessageHandler && activeSenderCount === 0) {
    window.removeEventListener('message', sharedMessageHandler);
    sharedMessageHandler = null;
    sharedPendingRequests?.clear();
    sharedPendingRequests = null;
  }
};

/* eslint-disable no-unused-vars */
export interface LoggerLike {
  warn: (...args: any[]) => void;
}

/**
 * VscodeMessageSender handles communication between the webview and the VS Code extension backend.
 * It sends messages to the extension and listens for responses, managing pending requests.
 */
export class VscodeMessageSender {
  private vsCode: any;
  private disposed = false;

  /**
   * Creates an instance of VscodeMessageSender.
   * Initializes the VS Code API and sets up a listener for messages from the extension host.
     * @param logger - Optional logger implementing a warn method. Defaults to log.
   * @throws Will throw an error if the VS Code API is not available in this environment.
   */
  constructor(logger: LoggerLike = log) {
    sharedLogger = logger;
    if (vscodeApi) {
      this.vsCode = vscodeApi;
    } else {
      throw new Error("VS Code API is not available in this environment.");
    }
    ensureMessageHandler();
    activeSenderCount += 1;
  }

  /**
   * Sends a message to the VS Code extension backend and returns a promise that resolves with the result.
   *
   * @param endpoint - The endpoint name to call on the extension side.
   * @param payload - The payload to send.
   * @returns A Promise that resolves with the response from the backend.
   */
  public sendMessageToVscodeEndpointPost(endpoint: string, payload: any): Promise<any> {
    if (this.disposed) {
      return Promise.reject(new Error('VscodeMessageSender has been disposed.'));
    }
    return new Promise((resolve, reject) => {
      const requestId = `req_${Date.now()}_${++sharedRequestCounter}`;
      getPendingStore().set(requestId, { resolve, reject, owner: this });

      this.vsCode.postMessage({
        type: "POST",
        requestId: requestId,
        endpointName: endpoint,
        payload: JSON.stringify(payload)
      });
    });
  }

  /**
   * Cleans up resources by removing the message listener and clearing pending requests.
   */
  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    activeSenderCount = Math.max(0, activeSenderCount - 1);
    const store = getPendingStore();
    for (const [requestId, pending] of store.entries()) {
      if (pending.owner === this) {
        store.delete(requestId);
      }
    }
    cleanupMessageHandler();
  }
}

export default VscodeMessageSender;
