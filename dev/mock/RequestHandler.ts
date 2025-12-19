/**
 * RequestHandler - Handle POST/RESPONSE async request pattern
 *
 * Simulates the extension's handling of POST requests from the webview.
 * Fetches data from server - no local cache.
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

  isPostRequest(message: unknown): message is RequestMessage {
    const msg = message as Record<string, unknown>;
    return (
      msg?.type === 'POST' &&
      typeof msg?.requestId === 'string' &&
      typeof msg?.endpointName === 'string'
    );
  }

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
          result = await this.handleGetTopologyData();
          break;
        case 'lab-settings-get':
          result = this.handleLabSettingsGet();
          break;
        case 'lab-settings-update':
          result = await this.handleLabSettingsUpdate(parsedPayload);
          break;
        case 'topo-editor-load-annotations':
          result = await this.handleLoadAnnotations();
          break;
        case 'topo-editor-save-annotations':
          result = await this.handleSaveAnnotations(parsedPayload);
          break;
        case 'topo-switch-mode':
          result = this.handleSwitchMode(parsedPayload);
          break;
        case 'topo-viewport-save':
        case 'topo-editor-viewport-save':
          result = { success: true };
          break;
        case 'list-topology-files':
          result = await this.handleListTopologyFiles();
          break;
        case 'load-topology-file':
          result = await this.handleLoadTopologyFile(parsedPayload);
          break;
        case 'save-topology-file':
          result = await this.handleSaveTopologyFile(parsedPayload);
          break;
        case 'save-annotations-file':
          result = await this.handleSaveAnnotationsFile(parsedPayload);
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

  private sendResponse(requestId: string, result: unknown, error: string | null): void {
    sendMessageToWebviewWithLog(
      { type: 'POST_RESPONSE', requestId, result, error },
      'POST_RESPONSE'
    );
  }

  // --------------------------------------------------------------------------
  // Endpoint Handlers
  // --------------------------------------------------------------------------

  private async handleGetTopologyData(): Promise<unknown> {
    const filename = this.stateManager.getCurrentFilePath();
    const state = this.stateManager.getState();

    if (!filename) {
      return {
        elements: [],
        labName: 'dev-topology',
        mode: state.mode,
        deploymentState: state.deploymentState,
        freeTextAnnotations: [],
        freeShapeAnnotations: [],
        groupStyleAnnotations: [],
        nodeAnnotations: {},
        cloudNodeAnnotations: {},
        networkNodeAnnotations: {}
      };
    }

    // Fetch from server
    const sessionId = (window as any).__TEST_SESSION_ID__;
    const url = sessionId
      ? `/api/topology/${encodeURIComponent(filename)}/elements?sessionId=${sessionId}`
      : `/api/topology/${encodeURIComponent(filename)}/elements`;

    const response = await fetch(url);
    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Failed to load topology');
    }

    const { elements, annotations, labName } = result.data;

    return {
      elements,
      labName,
      mode: state.mode,
      deploymentState: state.deploymentState,
      freeTextAnnotations: annotations?.freeTextAnnotations || [],
      freeShapeAnnotations: annotations?.freeShapeAnnotations || [],
      groupStyleAnnotations: annotations?.groupStyleAnnotations || [],
      nodeAnnotations: annotations?.nodeAnnotations || {},
      cloudNodeAnnotations: annotations?.cloudNodeAnnotations || {},
      networkNodeAnnotations: annotations?.networkNodeAnnotations || {}
    };
  }

  private handleLabSettingsGet(): unknown {
    return {
      prefix: '',
      mgmtNetwork: { network: 'clab' },
      ...this.labSettings
    };
  }

  private async handleLabSettingsUpdate(settings: Record<string, unknown>): Promise<unknown> {
    this.labSettings = { ...this.labSettings, ...settings };

    const filename = this.stateManager.getCurrentFilePath();
    if (filename) {
      const sessionId = (window as any).__TEST_SESSION_ID__;
      const url = sessionId
        ? `/api/topology/${encodeURIComponent(filename)}/settings?sessionId=${sessionId}`
        : `/api/topology/${encodeURIComponent(filename)}/settings`;

      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
    }

    return { success: true };
  }

  private async handleLoadAnnotations(): Promise<unknown> {
    const filename = this.stateManager.getCurrentFilePath();
    if (!filename) return {};

    const response = await fetch(`/api/annotations/${encodeURIComponent(filename)}`);
    const result = await response.json();
    return result.success && result.data ? result.data : {};
  }

  private async handleSaveAnnotations(annotations: Record<string, unknown>): Promise<unknown> {
    const filename = this.stateManager.getCurrentFilePath();
    if (filename && annotations) {
      await fetch(`/api/annotations/${encodeURIComponent(filename)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(annotations)
      });
    }
    return { success: true };
  }

  private handleSwitchMode(payload: { mode?: 'edit' | 'view'; deploymentState?: string }): unknown {
    if (payload.mode) {
      this.stateManager.setMode(payload.mode);
    }
    if (payload.deploymentState) {
      this.stateManager.setDeploymentState(
        payload.deploymentState as 'deployed' | 'undeployed' | 'unknown'
      );
    }

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

  // --------------------------------------------------------------------------
  // File API
  // --------------------------------------------------------------------------

  private async handleListTopologyFiles(): Promise<unknown> {
    const response = await fetch('/api/topologies');
    const result = await response.json();
    if (!result.success) throw new Error(result.error || 'Failed to list files');
    return result.data;
  }

  private async handleLoadTopologyFile(payload: { filename: string }): Promise<unknown> {
    const { filename } = payload;
    if (!filename) throw new Error('Filename is required');

    const response = await fetch(`/api/topology/${encodeURIComponent(filename)}/elements`);
    const result = await response.json();

    if (!result.success) throw new Error(result.error || 'Failed to load topology');

    // Just record which file is loaded
    this.stateManager.setCurrentFilePath(filename);

    const { elements, annotations, labName } = result.data;
    return { success: true, elements, annotations, labName };
  }

  private async handleSaveTopologyFile(payload: { content: string; filename?: string }): Promise<unknown> {
    const filename = payload.filename || this.stateManager.getCurrentFilePath();
    if (!filename) throw new Error('No file to save to');

    const response = await fetch(`/api/topology/${encodeURIComponent(filename)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: payload.content })
    });

    const result = await response.json();
    if (!result.success) throw new Error(result.error || 'Failed to save topology');

    return { success: true };
  }

  private async handleSaveAnnotationsFile(payload: { annotations: Record<string, unknown>; filename?: string }): Promise<unknown> {
    const filename = payload.filename || this.stateManager.getCurrentFilePath();
    if (!filename) throw new Error('No file to save to');

    const response = await fetch(`/api/annotations/${encodeURIComponent(filename)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload.annotations)
    });

    const result = await response.json();
    if (!result.success) throw new Error(result.error || 'Failed to save annotations');

    return { success: true };
  }
}
