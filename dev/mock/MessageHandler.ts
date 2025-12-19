/**
 * MessageHandler - Route and handle webview messages in dev mode
 *
 * This class delegates to MessageHandlerBase for shared routing logic,
 * using mock service implementations for dev environment functionality.
 *
 * Simulates file watcher behavior: after mutation commands, fetches fresh
 * data from server and broadcasts to webview (like production file watcher).
 */

import type { DevStateManager } from './DevState';
import type { RequestHandler } from './RequestHandler';
import type { LatencySimulator } from './LatencySimulator';
import type { SplitViewPanel } from './SplitViewPanel';
import {
  MessageHandlerBase,
  WebviewMessage,
} from '../../src/reactTopoViewer/shared/messaging';

/** Commands that mutate topology and should trigger file watcher refresh */
const MUTATION_COMMANDS = new Set([
  'topo-editor-add-node',
  'topo-editor-edit-node',
  'topo-editor-delete-node',
  'topo-editor-add-link',
  'topo-editor-edit-link',
  'topo-editor-delete-link',
  'topo-editor-save-positions',
]);
import { createMockServices } from './services';
import { sendMessageToWebviewWithLog } from './VscodeApiMock';

// Re-export WebviewMessage for backward compatibility
export type { WebviewMessage } from '../../src/reactTopoViewer/shared/messaging';

// ============================================================================
// MessageHandler Class
// ============================================================================

/**
 * Handles webview messages in dev mode, delegating to shared MessageHandlerBase
 */
export class MessageHandler {
  private stateManager: DevStateManager;
  private requestHandler: RequestHandler;
  private latencySimulator: LatencySimulator;
  private splitViewPanel: SplitViewPanel | null = null;
  private handler: MessageHandlerBase | null = null;

  constructor(
    stateManager: DevStateManager,
    requestHandler: RequestHandler,
    latencySimulator: LatencySimulator
  ) {
    this.stateManager = stateManager;
    this.requestHandler = requestHandler;
    this.latencySimulator = latencySimulator;
  }

  /** Set the split view panel reference */
  setSplitViewPanel(panel: SplitViewPanel): void {
    this.splitViewPanel = panel;
  }

  /** Build API URL with optional session ID */
  private buildApiUrl(path: string): string {
    const sessionId = (window as unknown as { __TEST_SESSION_ID__?: string }).__TEST_SESSION_ID__;
    if (sessionId) {
      const separator = path.includes('?') ? '&' : '?';
      return `${path}${separator}sessionId=${sessionId}`;
    }
    return path;
  }

  /** Ensure the handler is initialized */
  private ensureHandler(): MessageHandlerBase {
    if (!this.handler) {
      const services = createMockServices({
        stateManager: this.stateManager,
        latencySimulator: this.latencySimulator,
        buildApiUrl: (path) => this.buildApiUrl(path),
        splitViewPanel: this.splitViewPanel || undefined,
      });

      this.handler = new MessageHandlerBase(services);
    }
    return this.handler;
  }

  // --------------------------------------------------------------------------
  // Main Entry Point
  // --------------------------------------------------------------------------

  /**
   * Handle a message from the webview
   */
  async handleMessage(message: unknown): Promise<void> {
    const msg = message as WebviewMessage;

    // Handle log messages locally (mock-specific styling)
    if (this.isLogMessage(msg)) {
      this.handleLogMessage(msg);
      return;
    }

    // Handle POST requests via RequestHandler
    if (this.requestHandler.isPostRequest(message)) {
      this.requestHandler.handleRequest(message as Parameters<RequestHandler['handleRequest']>[0]);
      return;
    }

    // Ensure handler is initialized
    const handler = this.ensureHandler();

    // Delegate to shared handler
    const handled = await handler.handleMessage(msg);

    if (handled) {
      // Update split view after handled commands
      this.updateSplitView();

      // Simulate file watcher: after mutation commands, fetch fresh data and broadcast
      // This matches production behavior where file watcher detects change and triggers refresh
      if (MUTATION_COMMANDS.has(msg.command || '')) {
        await this.simulateFileWatcher();
      }
      return;
    }

    // Log unknown commands
    const command = msg.command || msg.type || '';
    console.log(
      '%c[Mock Extension]',
      'color: #FF9800;',
      `Unhandled command: ${command}`,
      msg
    );
  }

  // --------------------------------------------------------------------------
  // File Watcher Simulation
  // --------------------------------------------------------------------------

  /**
   * Simulate file watcher behavior: fetch fresh data from server and broadcast.
   * In production, file watchers detect YAML changes and trigger loadTopologyData(),
   * then broadcast to webview. This simulates that behavior in dev mode.
   */
  private async simulateFileWatcher(): Promise<void> {
    const filename = this.stateManager.getCurrentFilePath();
    if (!filename) return;

    try {
      const url = this.buildApiUrl(`/api/topology/${encodeURIComponent(filename)}/elements`);
      const response = await fetch(url);
      const result = await response.json();

      if (result.success && result.data) {
        const { elements, annotations, labName } = result.data;
        const state = this.stateManager.getState();

        // Broadcast to webview (like production file watcher does)
        sendMessageToWebviewWithLog(
          {
            type: 'topology-data',
            data: {
              elements,
              labName,
              mode: state.mode === 'view' ? 'viewer' : 'editor',
              deploymentState: state.deploymentState,
              freeTextAnnotations: annotations?.freeTextAnnotations || [],
              freeShapeAnnotations: annotations?.freeShapeAnnotations || [],
              groupStyleAnnotations: annotations?.groupStyleAnnotations || [],
              nodeAnnotations: annotations?.nodeAnnotations || {},
              cloudNodeAnnotations: annotations?.cloudNodeAnnotations || {},
              networkNodeAnnotations: annotations?.networkNodeAnnotations || {},
            }
          },
          'file-watcher-refresh'
        );
      }
    } catch (err) {
      console.error('%c[File Watcher]', 'color: #f44336;', 'Failed to refresh after mutation:', err);
    }
  }

  // --------------------------------------------------------------------------
  // Log Messages
  // --------------------------------------------------------------------------

  private isLogMessage(msg: WebviewMessage): boolean {
    return msg.command === 'reactTopoViewerLog' || msg.command === 'topoViewerLog';
  }

  private handleLogMessage(msg: WebviewMessage): void {
    const level = msg.level || 'info';
    const logMsg = msg.message || '';

    switch (level) {
      case 'error':
        console.error('%c[Webview]', 'color: #f44336;', logMsg);
        break;
      case 'warn':
        console.warn('%c[Webview]', 'color: #FF9800;', logMsg);
        break;
      case 'debug':
        console.debug('%c[Webview]', 'color: #9E9E9E;', logMsg);
        break;
      default:
        console.log('%c[Webview]', 'color: #2196F3;', logMsg);
    }
  }

  // --------------------------------------------------------------------------
  // Utility Methods
  // --------------------------------------------------------------------------

  private updateSplitView(): void {
    if (this.splitViewPanel) {
      this.splitViewPanel.updateContent();
    }
  }
}
