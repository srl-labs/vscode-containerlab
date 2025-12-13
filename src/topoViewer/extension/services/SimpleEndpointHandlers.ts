import * as vscode from 'vscode';
import { log } from '../../webview/platform/logging/logger';

/**
 * Result type for endpoint handlers
 */
export interface EndpointResult {
  result: unknown;
  error: string | null;
}

/**
 * Handles simple endpoint operations that delegate to VS Code APIs.
 */
export class SimpleEndpointHandlers {
  /**
   * Shows an error message from the payload
   */
  async handleShowErrorEndpoint(payloadObj: any): Promise<EndpointResult> {
    try {
      const message = payloadObj as string;
      await vscode.window.showErrorMessage(message);
      return { result: 'Error message displayed', error: null };
    } catch (err) {
      const error = `Error showing error message: ${err}`;
      log.error(`Error showing error message: ${JSON.stringify(err, null, 2)}`);
      return { result: null, error };
    }
  }

  /**
   * Shows an error message from data.message format
   */
  async handleShowErrorMessageEndpoint(payload: string | undefined): Promise<EndpointResult> {
    const data = payload as any;
    if (data && data.message) {
      vscode.window.showErrorMessage(data.message);
    }
    return { result: { success: true }, error: null };
  }

  /**
   * Shows a VS Code message with the specified type (info, warning, error)
   */
  async handleShowVscodeMessageEndpoint(payload: string | undefined): Promise<EndpointResult> {
    try {
      const data = JSON.parse(payload as string) as { type: 'info' | 'warning' | 'error'; message: string };
      switch (data.type) {
        case 'info':
          await vscode.window.showInformationMessage(data.message);
          break;
        case 'warning':
          await vscode.window.showWarningMessage(data.message);
          break;
        case 'error':
          await vscode.window.showErrorMessage(data.message);
          break;
        default:
          log.error(`Unsupported message type: ${JSON.stringify(data.type, null, 2)}`);
      }
      const result = `Displayed ${data.type} message: ${data.message}`;
      log.info(result);
      return { result, error: null };
    } catch (err) {
      const result = 'Error executing endpoint "clab-show-vscode-message".';
      log.error(`Error executing endpoint "clab-show-vscode-message": ${JSON.stringify(err, null, 2)}`);
      return { result, error: null };
    }
  }

  /**
   * Opens an external URL
   */
  async handleOpenExternalEndpoint(payload: string | undefined): Promise<EndpointResult> {
    try {
      const url: string = JSON.parse(payload as string);
      await vscode.env.openExternal(vscode.Uri.parse(url));
      const result = `Opened external URL: ${url}`;
      log.info(result);
      return { result, error: null };
    } catch (err) {
      const result = 'Error executing endpoint "open-external".';
      log.error(`Error executing endpoint "open-external": ${JSON.stringify(err, null, 2)}`);
      return { result, error: null };
    }
  }

  /**
   * Opens an external link from parsed URL object
   */
  async handleOpenExternalLinkEndpoint(payload: string | undefined): Promise<EndpointResult> {
    try {
      const parsed = payload ? JSON.parse(payload) : {};
      const url = typeof parsed?.url === 'string' ? parsed.url : '';
      if (!url) {
        const warning = 'topo-editor-open-link called without a URL';
        log.warn(warning);
        return { result: warning, error: warning };
      }
      await vscode.env.openExternal(vscode.Uri.parse(url));
      const result = `Opened free text link: ${url}`;
      log.debug(result);
      return { result, error: null };
    } catch (err) {
      const result = 'Error executing endpoint "topo-editor-open-link".';
      log.error(`Error executing endpoint "topo-editor-open-link": ${JSON.stringify(err, null, 2)}`);
      return { result, error: null };
    }
  }

  /**
   * Logs a debug message from the webview
   */
  async handleDebugLogEndpoint(payloadObj: any): Promise<EndpointResult> {
    const message = typeof payloadObj?.message === 'string' ? payloadObj.message : '';
    if (!message) {
      return { result: false, error: 'No message provided' };
    }
    log.debug(message);
    return { result: true, error: null };
  }

  /**
   * Handles performance metrics from the webview
   */
  async handlePerformanceMetricsEndpoint(
    payload: string | undefined,
    payloadObj: any
  ): Promise<EndpointResult> {
    try {
      const metricsPayload = this.normalizeMetricsPayload(payload, payloadObj);
      const metrics = metricsPayload?.metrics;
      if (!metrics || typeof metrics !== 'object') {
        const warning = 'Received performance-metrics call without metrics payload';
        log.warn(warning);
        return { result: { success: false, warning }, error: null };
      }

      const numericEntries = Object.entries(metrics)
        .map(([name, value]) => [name, typeof value === 'number' ? value : Number(value)] as [string, number])
        .filter(([, value]) => Number.isFinite(value));

      if (!numericEntries.length) {
        const warning = 'Performance metrics payload contained no numeric values';
        log.warn(warning);
        return { result: { success: false, warning }, error: null };
      }

      const total = numericEntries.reduce((sum, [, value]) => sum + value, 0);
      log.info(
        `TopoViewer performance metrics (${numericEntries.length} entries, total ${total.toFixed(2)}ms):`
      );
      const sortedEntries = [...numericEntries].sort((a, b) => b[1] - a[1]);
      sortedEntries.slice(0, 8).forEach(([name, value]) => {
        log.info(`  ${name}: ${value.toFixed(2)}ms`);
      });

      return { result: { success: true }, error: null };
    } catch (err) {
      const error = `Failed to record performance metrics: ${err instanceof Error ? err.message : String(err)}`;
      log.error(error);
      return { result: null, error };
    }
  }

  private normalizeMetricsPayload(
    payload: string | undefined,
    payloadObj: any
  ): any {
    if (payloadObj && typeof payloadObj === 'object') {
      return payloadObj;
    }
    if (typeof payload === 'string' && payload.trim()) {
      try {
        return JSON.parse(payload);
      } catch (err) {
        log.warn(`Failed to parse performance metrics payload: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return undefined;
  }

  /**
   * Copies elements to the VS Code global state clipboard
   */
  async handleCopyElementsEndpoint(
    context: vscode.ExtensionContext,
    payloadObj: any
  ): Promise<EndpointResult> {
    context.globalState.update('topoClipboard', payloadObj);
    return { result: 'Elements copied', error: null };
  }

  /**
   * Gets copied elements from the VS Code global state clipboard
   */
  async handleGetCopiedElementsEndpoint(
    context: vscode.ExtensionContext,
    panel: vscode.WebviewPanel
  ): Promise<EndpointResult> {
    const clipboard = context.globalState.get('topoClipboard') || [];
    panel.webview.postMessage({ type: 'copiedElements', data: clipboard });
    return { result: 'Clipboard sent', error: null };
  }
}

// Export a singleton instance
export const simpleEndpointHandlers = new SimpleEndpointHandlers();
