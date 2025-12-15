/**
 * RequestHandler - Handle POST/RESPONSE async request pattern
 *
 * Simulates the extension's handling of POST requests from the webview
 * and sends back POST_RESPONSE messages with results.
 */

import type { DevStateManager } from './DevState';
import type { LatencySimulator } from './LatencySimulator';
import { sendMessageToWebviewWithLog } from './VscodeApiMock';

// ============================================================================
// Types
// ============================================================================

export interface RequestMessage {
  type: 'POST';
  requestId: string;
  endpointName: string;
  payload?: string;
}

export interface ResponseMessage {
  type: 'POST_RESPONSE';
  requestId: string;
  result: unknown;
  error: string | null;
}

export type EndpointName =
  | 'lab-settings-get'
  | 'lab-settings-update'
  | 'topo-viewport-save'
  | 'topo-editor-viewport-save'
  | 'topo-editor-load-annotations'
  | 'topo-editor-save-annotations'
  | 'topo-switch-mode'
  | 'deployLab'
  | 'destroyLab'
  | 'redeployLab'
  | 'get-topology-data';

// ============================================================================
// RequestHandler Class
// ============================================================================

export class RequestHandler {
  private stateManager: DevStateManager;
  private latencySimulator: LatencySimulator;
  private labSettings: Record<string, unknown> = {};

  constructor(
    stateManager: DevStateManager,
    latencySimulator: LatencySimulator
  ) {
    this.stateManager = stateManager;
    this.latencySimulator = latencySimulator;
  }

  // --------------------------------------------------------------------------
  // Main Handler
  // --------------------------------------------------------------------------

  /**
   * Check if a message is a POST request
   */
  isPostRequest(message: unknown): message is RequestMessage {
    const msg = message as Record<string, unknown>;
    return (
      msg?.type === 'POST' &&
      typeof msg?.requestId === 'string' &&
      typeof msg?.endpointName === 'string'
    );
  }

  /**
   * Handle a POST request
   */
  async handleRequest(message: RequestMessage): Promise<void> {
    const { requestId, endpointName, payload } = message;

    console.log(
      '%c[POST Request]',
      'color: #2196F3; font-weight: bold;',
      `${endpointName} (${requestId})`
    );

    await this.latencySimulator.delay('request');

    try {
      let result: unknown;
      const parsedPayload = payload ? JSON.parse(payload) : undefined;

      switch (endpointName) {
        case 'get-topology-data':
          result = this.handleGetTopologyData();
          break;

        case 'lab-settings-get':
          result = this.handleLabSettingsGet();
          break;

        case 'lab-settings-update':
          result = this.handleLabSettingsUpdate(parsedPayload);
          break;

        case 'topo-editor-load-annotations':
          result = this.handleLoadAnnotations();
          break;

        case 'topo-editor-save-annotations':
          result = this.handleSaveAnnotations(parsedPayload);
          break;

        case 'topo-switch-mode':
          result = this.handleSwitchMode(parsedPayload);
          break;

        case 'topo-viewport-save':
        case 'topo-editor-viewport-save':
          result = this.handleViewportSave(parsedPayload);
          break;

        default:
          throw new Error(`Unknown endpoint: ${endpointName}`);
      }

      this.sendResponse(requestId, result, null);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('%c[POST Error]', 'color: #f44336;', errorMessage);
      this.sendResponse(requestId, null, errorMessage);
    }
  }

  // --------------------------------------------------------------------------
  // Response
  // --------------------------------------------------------------------------

  private sendResponse(
    requestId: string,
    result: unknown,
    error: string | null
  ): void {
    const response: ResponseMessage = {
      type: 'POST_RESPONSE',
      requestId,
      result,
      error
    };

    sendMessageToWebviewWithLog(response, 'POST_RESPONSE');
  }

  // --------------------------------------------------------------------------
  // Endpoint Handlers
  // --------------------------------------------------------------------------

  private handleGetTopologyData(): unknown {
    const state = this.stateManager.getState();
    return {
      elements: state.currentElements,
      labName: state.labName,
      mode: state.mode,
      deploymentState: state.deploymentState,
      // Include flattened annotations
      freeTextAnnotations: state.currentAnnotations.freeTextAnnotations,
      freeShapeAnnotations: state.currentAnnotations.freeShapeAnnotations,
      groupStyleAnnotations: state.currentAnnotations.groupStyleAnnotations,
      nodeAnnotations: state.currentAnnotations.nodeAnnotations,
      cloudNodeAnnotations: state.currentAnnotations.cloudNodeAnnotations,
      networkNodeAnnotations: (state.currentAnnotations as any).networkNodeAnnotations
    };
  }

  private handleLabSettingsGet(): unknown {
    // Return mock lab settings
    return {
      prefix: '',
      mgmtNetwork: {
        network: 'clab'
      },
      ...this.labSettings
    };
  }

  private handleLabSettingsUpdate(
    settings: Record<string, unknown>
  ): unknown {
    this.labSettings = { ...this.labSettings, ...settings };
    console.log(
      '%c[Mock Extension]',
      'color: #FF9800;',
      'Lab settings updated:',
      this.labSettings
    );
    return { success: true };
  }

  private handleLoadAnnotations(): unknown {
    return this.stateManager.getAnnotations();
  }

  private handleSaveAnnotations(
    annotations: Record<string, unknown>
  ): unknown {
    if (annotations) {
      this.stateManager.updateAnnotations(annotations);
    }
    return { success: true };
  }

  private handleSwitchMode(
    payload: { mode?: 'edit' | 'view'; deploymentState?: string }
  ): unknown {
    if (payload.mode) {
      this.stateManager.setMode(payload.mode);
    }
    if (payload.deploymentState) {
      this.stateManager.setDeploymentState(
        payload.deploymentState as 'deployed' | 'undeployed' | 'unknown'
      );
    }

    // Broadcast mode change to webview
    sendMessageToWebviewWithLog(
      {
        type: 'topo-mode-changed',
        data: {
          mode: payload.mode === 'view' ? 'viewer' : 'editor',
          deploymentState: payload.deploymentState || this.stateManager.getDeploymentState()
        }
      },
      'mode-changed'
    );

    return { success: true };
  }

  private handleViewportSave(
    viewport: Record<string, unknown>
  ): unknown {
    console.log(
      '%c[Mock Extension]',
      'color: #FF9800;',
      'Viewport saved:',
      viewport
    );
    return { success: true };
  }
}
