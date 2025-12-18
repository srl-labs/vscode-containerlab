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
  | 'get-topology-data'
  | 'list-topology-files'
  | 'load-topology-file'
  | 'save-topology-file'
  | 'save-annotations-file';

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

  private async handleLoadAnnotations(): Promise<unknown> {
    const filename = this.stateManager.getCurrentFilePath();
    if (filename) {
      // Load from file
      try {
        const response = await fetch(`/api/annotations/${encodeURIComponent(filename)}`);
        const result = await response.json();
        if (result.success && result.data) {
          return result.data;
        }
      } catch (error) {
        console.warn('[RequestHandler] Failed to load annotations from file, using state:', error);
      }
    }
    // Fallback to state
    return this.stateManager.getAnnotations();
  }

  private async handleSaveAnnotations(
    annotations: Record<string, unknown>
  ): Promise<unknown> {
    if (annotations) {
      // Update state
      this.stateManager.updateAnnotations(annotations);

      // Save to file if we have a file path
      const filename = this.stateManager.getCurrentFilePath();
      if (filename) {
        try {
          const fullAnnotations = this.stateManager.getAnnotations();
          await fetch(`/api/annotations/${encodeURIComponent(filename)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(fullAnnotations)
          });
          console.log('%c[File API]', 'color: #4CAF50;', `Saved annotations to ${filename}`);
        } catch (error) {
          console.warn('[RequestHandler] Failed to save annotations to file:', error);
        }
      }
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

  // --------------------------------------------------------------------------
  // File API Endpoints
  // --------------------------------------------------------------------------

  private async handleListTopologyFiles(): Promise<unknown> {
    try {
      const response = await fetch('/api/topologies');
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Failed to list files');
      }
      console.log(
        '%c[File API]',
        'color: #4CAF50;',
        'Listed topology files:',
        result.data
      );
      return result.data;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('%c[File API Error]', 'color: #f44336;', message);
      throw error;
    }
  }

  private async handleLoadTopologyFile(
    payload: { filename: string }
  ): Promise<unknown> {
    const { filename } = payload;
    if (!filename) {
      throw new Error('Filename is required');
    }

    try {
      // Fetch parsed elements from API
      const response = await fetch(`/api/topology/${encodeURIComponent(filename)}/elements`);
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to load topology');
      }

      const { elements, annotations, labName } = result.data;

      // Update state manager
      this.stateManager.loadTopologyFromFile(filename, elements, annotations, labName);

      console.log(
        '%c[File API]',
        'color: #4CAF50;',
        `Loaded topology from ${filename}:`,
        { elements: elements.length, labName }
      );

      return {
        success: true,
        elements,
        annotations,
        labName
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('%c[File API Error]', 'color: #f44336;', message);
      throw error;
    }
  }

  private async handleSaveTopologyFile(
    payload: { content: string; filename?: string }
  ): Promise<unknown> {
    const filename = payload.filename || this.stateManager.getCurrentFilePath();
    if (!filename) {
      throw new Error('No file to save to');
    }

    try {
      const response = await fetch(`/api/topology/${encodeURIComponent(filename)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: payload.content })
      });

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Failed to save topology');
      }

      this.stateManager.markClean();
      console.log(
        '%c[File API]',
        'color: #4CAF50;',
        `Saved topology to ${filename}`
      );

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('%c[File API Error]', 'color: #f44336;', message);
      throw error;
    }
  }

  private async handleSaveAnnotationsFile(
    payload: { annotations: Record<string, unknown>; filename?: string }
  ): Promise<unknown> {
    const filename = payload.filename || this.stateManager.getCurrentFilePath();
    if (!filename) {
      throw new Error('No file to save to');
    }

    try {
      const response = await fetch(`/api/annotations/${encodeURIComponent(filename)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload.annotations)
      });

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Failed to save annotations');
      }

      console.log(
        '%c[File API]',
        'color: #4CAF50;',
        `Saved annotations for ${filename}`
      );

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('%c[File API Error]', 'color: #f44336;', message);
      throw error;
    }
  }
}
