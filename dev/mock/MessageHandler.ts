/**
 * MessageHandler - Route and handle webview messages in dev mode
 *
 * This class delegates to MessageHandlerBase for shared routing logic,
 * using mock service implementations for dev environment functionality.
 */

import type { DevStateManager } from './DevState';
import type { RequestHandler } from './RequestHandler';
import type { LatencySimulator } from './LatencySimulator';
import type { SplitViewPanel } from './SplitViewPanel';
import { sendMessageToWebviewWithLog } from './VscodeApiMock';
import {
  MessageHandlerBase,
  WebviewMessage,
  isLogCommand,
} from '../../src/reactTopoViewer/shared/messaging';
import {
  createMockServices,
  MockSplitViewService,
} from './services';

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
  private splitViewService: MockSplitViewService | null = null;

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
    if (this.splitViewService) {
      this.splitViewService.setSplitViewPanel(panel);
    }
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

      this.splitViewService = services.splitView as MockSplitViewService;
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
      // Maybe broadcast topology for non-rename operations
      this.maybeBroadcastTopology();
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

  private maybeBroadcastTopology(): void {
    // Only broadcast if not in batch mode
    if (!this.stateManager.isInBatch()) {
      this.broadcastTopologyData();
    }
  }

  /**
   * Broadcast current topology data to webview
   */
  broadcastTopologyData(): void {
    const elements = this.stateManager.getElements();
    const annotations = this.stateManager.getAnnotations();
    const mode = this.stateManager.getMode();
    const deploymentState = this.stateManager.getDeploymentState();
    const customNodes = this.stateManager.getCustomNodes();
    const defaultCustomNode = this.stateManager.getState().defaultCustomNode;

    sendMessageToWebviewWithLog(
      {
        type: 'topology-data',
        elements,
        annotations,
        mode,
        deploymentState,
        customNodes,
        defaultCustomNode,
        labName: this.stateManager.getState().labName,
        labPrefix: undefined,
        mgmtSettings: undefined,
      },
      'topology-data'
    );
  }
}
