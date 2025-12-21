/**
 * Production Services Factory
 *
 * Factory function to create all production service adapters.
 * Most adapters are inlined as object literals since they're simple pass-throughs.
 */

import type * as vscode from 'vscode';

import type { TopologyIO, AnnotationsIO } from '../../../shared/io';
import type {
  IPersistenceService,
  IMessagingService,
  ILifecycleService,
  ICustomNodeService,
  ISplitViewService,
} from '../../../shared/messaging';
import type { CyElement } from '../../../shared/types/topology';
import { labLifecycleService } from '../LabLifecycleService';
import { customNodeConfigManager } from '../CustomNodeConfigManager';
import { splitViewManager } from '../SplitViewManager';

import { AnnotationsServiceAdapter, annotationsIO as defaultAnnotationsIO } from './AnnotationsServiceAdapter';
import { NodeCommandServiceAdapter } from './NodeCommandServiceAdapter';
import { LabSettingsServiceAdapter } from './LabSettingsServiceAdapter';
import { MessageRouterContextAdapter } from './MessageRouterContextAdapter';
import { extensionLogger } from './loggerAdapter';

// ============================================================================
// Inline Adapter Factories
// ============================================================================

/**
 * Creates a messaging service adapter (inline).
 * Simple wrapper around webview.postMessage.
 */
function createMessagingService(panel: vscode.WebviewPanel): IMessagingService {
  return {
    postMessage(message: unknown): void {
      panel.webview.postMessage(message);
    },
    postPanelAction(action: string, data: Record<string, unknown>): void {
      panel.webview.postMessage({
        type: 'panel-action',
        action,
        ...data
      });
    }
  };
}

/**
 * Creates a persistence service adapter (inline).
 * Pure pass-through to TopologyIO.
 */
function createPersistenceService(topologyIO: TopologyIO): IPersistenceService {
  return {
    isInitialized: () => topologyIO.isInitialized(),
    beginBatch: () => topologyIO.beginBatch(),
    endBatch: () => topologyIO.endBatch(),
    addNode: (nodeData) => topologyIO.addNode(nodeData),
    editNode: (nodeData) => topologyIO.editNode(nodeData),
    deleteNode: (nodeId) => topologyIO.deleteNode(nodeId),
    addLink: (linkData) => topologyIO.addLink(linkData),
    editLink: (linkData) => topologyIO.editLink(linkData),
    deleteLink: (linkData) => topologyIO.deleteLink(linkData),
    savePositions: (positions) => topologyIO.savePositions(positions),
  };
}

/**
 * Creates a lifecycle service adapter (inline).
 * Single method pass-through to labLifecycleService.
 */
function createLifecycleService(): ILifecycleService {
  return {
    async handleLifecycleCommand(command: string, yamlFilePath: string) {
      const res = await labLifecycleService.handleLabLifecycleEndpoint(command, yamlFilePath);
      return { result: res.result as string | undefined, error: res.error ?? undefined };
    }
  };
}

/**
 * Creates a custom node service adapter (inline).
 * Pass-through to customNodeConfigManager.
 */
function createCustomNodeService(): ICustomNodeService {
  type CustomNodeResult = { customNodes: unknown[]; defaultNode: string };
  return {
    async saveCustomNode(nodeData) {
      const res = await customNodeConfigManager.saveCustomNode(nodeData);
      return { result: res.result as CustomNodeResult | undefined, error: res.error ?? undefined };
    },
    async deleteCustomNode(name) {
      const res = await customNodeConfigManager.deleteCustomNode(name);
      return { result: res.result as CustomNodeResult | undefined, error: res.error ?? undefined };
    },
    async setDefaultCustomNode(name) {
      const res = await customNodeConfigManager.setDefaultCustomNode(name);
      return { result: res.result as CustomNodeResult | undefined, error: res.error ?? undefined };
    }
  };
}

/**
 * Creates a split view service adapter (inline).
 * Pass-through to splitViewManager.
 */
function createSplitViewService(panel: vscode.WebviewPanel): ISplitViewService {
  return {
    toggle: (yamlFilePath) => splitViewManager.toggleSplitView(yamlFilePath, panel),
    updateContent: () => {
      // Split view updates are handled internally by the manager
    }
  };
}

// ============================================================================
// Main Factory
// ============================================================================

/**
 * Create all production service adapters
 * @param options Configuration including custom service instances
 */
export function createProductionServices(options: {
  panel: vscode.WebviewPanel;
  extensionContext: vscode.ExtensionContext;
  yamlFilePath: string;
  isViewMode: boolean;
  lastTopologyElements: CyElement[];
  loadTopologyData: () => Promise<unknown>;
  // Required TopologyIO instance (needs per-file initialization)
  topologyIO: TopologyIO;
  // Optional custom AnnotationsIO instance (defaults to extension singleton)
  annotationsIO?: AnnotationsIO;
}) {
  const context = new MessageRouterContextAdapter({
    yamlFilePath: options.yamlFilePath,
    isViewMode: options.isViewMode,
    lastTopologyElements: options.lastTopologyElements,
    loadTopologyData: options.loadTopologyData,
  });

  return {
    // Inlined adapters (pure pass-throughs)
    messaging: createMessagingService(options.panel),
    persistence: createPersistenceService(options.topologyIO),
    lifecycle: createLifecycleService(),
    customNodes: createCustomNodeService(),
    splitView: createSplitViewService(options.panel),

    // Class-based adapters (have state or complex logic)
    annotations: new AnnotationsServiceAdapter(options.annotationsIO ?? defaultAnnotationsIO),
    nodeCommands: new NodeCommandServiceAdapter(options.yamlFilePath),
    labSettings: new LabSettingsServiceAdapter(),
    context,
    logger: extensionLogger,
  };
}
