// file: managerVscodeWebview.ts

// This function is typically provided by the VS Code environment.
declare function acquireVsCodeApi(): any;

/**
 * VscodeMessageSender handles communication between the webview and the VS Code extension backend.
 * It sends messages to the extension and listens for responses, managing pending requests.
 */
export class VscodeMessageSender {
  private vsCode: any;
  private pendingRequests = new Map<
    string,
    { resolve: (value: any) => void; reject: (reason?: any) => void }
  >();
  private requestCounter = 0;

  /**
   * Creates an instance of VscodeMessageSender.
   * Initializes the VS Code API and sets up a listener for messages from the extension host.
   * @throws Will throw an error if the VS Code API is not available in this environment.
   */
  constructor() {
    if (typeof acquireVsCodeApi === "function") {
      this.vsCode = acquireVsCodeApi();
    } else {
      throw new Error("VS Code API is not available in this environment.");
    }
    // Initialize the listener for messages from the extension host.
    window.addEventListener("message", this.handleMessage.bind(this));
  }

  /**
   * Handles incoming messages from the VS Code extension host.
   * Resolves or rejects pending promises based on the response.
   *
   * @param event - The MessageEvent containing data from the extension host.
   * @private
   */
  private handleMessage(event: MessageEvent): void {
    const msg = event.data;
    if (msg && msg.type === "POST_RESPONSE") {
      const { requestId, result, error } = msg;
      const pending = this.pendingRequests.get(requestId);
      if (!pending) {
        console.warn("Received response for unknown requestId:", requestId);
        return;
      }
      this.pendingRequests.delete(requestId);
      if (error) {
        pending.reject(new Error(error));
      } else {
        pending.resolve(result);
      }
    }
  }

  /**
   * Sends a message to the VS Code extension backend and returns a promise that resolves with the result.
   *
   * @param endpoint - The endpoint name to call on the extension side.
   * @param payload - The payload to send.
   * @returns A Promise that resolves with the response from the backend.
   */
  public sendMessageToVscodeEndpointPost(endpoint: string, payload: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const requestId = `req_${Date.now()}_${++this.requestCounter}`;
      this.pendingRequests.set(requestId, { resolve, reject });

      this.vsCode.postMessage({
        type: "POST",
        requestId: requestId,
        endpointName: endpoint,
        payload: JSON.stringify(payload)
      });
    });
  }
}
