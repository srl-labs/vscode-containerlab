/**
 * MessageRouter - Handles webview message routing for ReactTopoViewer
 *
 * This class delegates to MessageHandlerBase for shared routing logic,
 * using production service adapters for VS Code-specific functionality.
 */

import * as vscode from 'vscode';
import { log } from '../services/logger';
import { CyElement } from '../../shared/types/topology';
import { TopologyIO } from '../../shared/io';
import {
  MessageHandlerBase,
  WebviewMessage as SharedWebviewMessage,
} from '../../shared/messaging';
import {
  createProductionServices,
  MessageRouterContextAdapter,
  NodeCommandServiceAdapter,
} from '../services/adapters';

// Re-export types for backward compatibility
export type { NodePositionData, WebviewMessage } from '../../shared/messaging';

// Create output channel for React TopoViewer logs
let reactTopoViewerLogChannel: vscode.LogOutputChannel | undefined;

function getLogChannel(): vscode.LogOutputChannel {
  if (!reactTopoViewerLogChannel) {
    reactTopoViewerLogChannel = vscode.window.createOutputChannel('TopoViewer React', { log: true });
  }
  return reactTopoViewerLogChannel;
}

function logToChannel(level: string, message: string, fileLine?: string): void {
  const channel = getLogChannel();
  const text = fileLine ? `${fileLine} - ${message}` : message;
  switch (level) {
    case 'error': channel.error(text); break;
    case 'warn': channel.warn(text); break;
    case 'debug': channel.debug(text); break;
    default: channel.info(text);
  }
}

/**
 * Context required by the message router
 */
export interface MessageRouterContext {
  yamlFilePath: string;
  isViewMode: boolean;
  lastTopologyElements: CyElement[];
  updateCachedElements: (elements: CyElement[]) => void;
  loadTopologyData: () => Promise<unknown>;
  extensionContext?: vscode.ExtensionContext;
  topologyIO: TopologyIO;
}

/**
 * Handles routing and processing of webview messages
 */
export class MessageRouter {
  private context: MessageRouterContext;
  private handler: MessageHandlerBase | null = null;
  private contextAdapter: MessageRouterContextAdapter | null = null;
  private nodeCommandAdapter: NodeCommandServiceAdapter | null = null;

  constructor(context: MessageRouterContext) {
    this.context = context;
  }

  /**
   * Update the router context
   */
  updateContext(context: Partial<MessageRouterContext>): void {
    Object.assign(this.context, context);

    // Update the context adapter if it exists
    if (this.contextAdapter) {
      if (context.yamlFilePath !== undefined) {
        this.contextAdapter.setYamlFilePath(context.yamlFilePath);
      }
      if (context.isViewMode !== undefined) {
        this.contextAdapter.setViewMode(context.isViewMode);
      }
      if (context.lastTopologyElements !== undefined) {
        this.contextAdapter.setElements(context.lastTopologyElements);
      }
    }

    // Update node command adapter yaml path
    if (this.nodeCommandAdapter && context.yamlFilePath !== undefined) {
      this.nodeCommandAdapter.setYamlFilePath(context.yamlFilePath);
    }
  }

  /**
   * Initialize the handler with a panel
   * Must be called before handleMessage
   */
  private ensureHandler(panel: vscode.WebviewPanel): MessageHandlerBase {
    if (!this.handler) {
      const services = createProductionServices({
        panel,
        extensionContext: this.context.extensionContext!,
        yamlFilePath: this.context.yamlFilePath,
        isViewMode: this.context.isViewMode,
        lastTopologyElements: this.context.lastTopologyElements,
        loadTopologyData: () => this.context.loadTopologyData(),
        topologyIO: this.context.topologyIO,
      });

      this.contextAdapter = services.context;
      this.nodeCommandAdapter = services.nodeCommands as NodeCommandServiceAdapter;
      this.handler = new MessageHandlerBase(services);
    }
    return this.handler;
  }

  /**
   * Handle log command messages
   */
  private handleLogCommand(message: SharedWebviewMessage): boolean {
    if (message.command === 'reactTopoViewerLog') {
      const { level, message: logMsg, fileLine } = message as SharedWebviewMessage & { fileLine?: string };
      logToChannel(level || 'info', logMsg || '', fileLine);
      return true;
    }
    if (message.command === 'topoViewerLog') {
      const { level, message: logMessage } = message;
      if (level === 'error') { log.error(logMessage); }
      else if (level === 'warn') { log.warn(logMessage); }
      else if (level === 'debug') { log.debug(logMessage); }
      else { log.info(logMessage); }
      return true;
    }
    return false;
  }

  /**
   * Handle POST request messages
   */
  private async handlePostMessage(message: SharedWebviewMessage, panel: vscode.WebviewPanel): Promise<void> {
    const { requestId, endpointName } = message;
    let result: unknown = null;
    let error: string | null = null;

    try {
      if (endpointName === 'get-topology-data') {
        result = await this.context.loadTopologyData();
      } else {
        error = `Unknown endpoint: ${endpointName}`;
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    panel.webview.postMessage({
      type: 'POST_RESPONSE',
      requestId,
      result,
      error
    });
  }

  /**
   * Handle messages from the webview
   */
  async handleMessage(message: SharedWebviewMessage, panel: vscode.WebviewPanel): Promise<void> {
    if (!message || typeof message !== 'object') {
      return;
    }

    // Handle log commands locally (production-specific logging)
    if (this.handleLogCommand(message)) {
      return;
    }

    // Ensure handler is initialized
    const handler = this.ensureHandler(panel);

    // Sync context state to adapter before handling
    if (this.contextAdapter) {
      this.contextAdapter.setElements(this.context.lastTopologyElements);
    }

    // Delegate to shared handler
    const handled = await handler.handleMessage(message);
    if (handled) {
      // Sync any element updates back to context
      if (this.contextAdapter) {
        this.context.updateCachedElements(this.contextAdapter.getCachedElements());
      }
      return;
    }

    // Handle POST requests (production-specific)
    if (message.type === 'POST' && message.requestId && message.endpointName) {
      await this.handlePostMessage(message, panel);
    }
  }
}
