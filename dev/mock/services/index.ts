/**
 * Mock Service Implementations
 *
 * Simple mock services for dev environment:
 * - MockPersistenceService/MockAnnotationsService: HTTP wrappers to server
 * - MockLifecycleService/MockNodeCommandService: Dev-specific behavior
 * - Other services: Simple implementations using DevStateManager
 *
 * Architecture Note:
 * The production services (SaveTopologyService, AnnotationsManager) now accept
 * pluggable FileSystemAdapter via factory functions. This enables:
 * - Server-side code to use them directly with SessionFsAdapter
 * - Unit tests to inject mock adapters
 * - Same business logic shared between production and dev
 *
 * The browser-side mock services here still use HTTP because the browser
 * cannot directly access the filesystem. The server (fileApi.ts) handles
 * the actual file operations using TopologyIO with SessionFsAdapter.
 *
 * To use production services with custom adapters:
 * @example
 * import { createSaveTopologyService, createAnnotationsManager } from '../../../src/reactTopoViewer/extension/services';
 * import { SessionFsAdapter } from '../../server/SessionFsAdapter';
 *
 * const fs = new SessionFsAdapter(sessionId, sessionMaps, basePath);
 * const annotationsMgr = createAnnotationsManager({ fs });
 * const persistenceSvc = createSaveTopologyService({ fs });
 */

import type { DevStateManager } from '../DevState';
import type { LatencySimulator } from '../LatencySimulator';
import type { SplitViewPanel } from '../SplitViewPanel';
import { sendMessageToWebviewWithLog } from '../VscodeApiMock';
import {
  IMessagingService,
  IPersistenceService,
  IAnnotationsService,
  INodeCommandService,
  ILifecycleService,
  ICustomNodeService,
  IClipboardService,
  ISplitViewService,
  ILabSettingsService,
  IMessageRouterContext,
  SaveResult,
  NodeSaveData,
  LinkSaveData,
  NodePositionData,
  IOLogger,
} from '../../../src/reactTopoViewer/shared/messaging';
import { TopologyAnnotations, CyElement } from '../../../src/reactTopoViewer/shared/types/topology';

// ============================================================================
// Mock Messaging Service
// ============================================================================

export class MockMessagingService implements IMessagingService {
  postMessage(message: unknown): void {
    sendMessageToWebviewWithLog(message, 'message');
  }

  postPanelAction(action: string, data: Record<string, unknown>): void {
    sendMessageToWebviewWithLog({ type: 'panel-action', action, ...data }, 'panel-action');
  }
}

// ============================================================================
// Mock Persistence Service
// ============================================================================

/**
 * Pure HTTP wrapper for persistence operations.
 * Server-side TopologyIO handles all business logic.
 */
export class MockPersistenceService implements IPersistenceService {
  private stateManager: DevStateManager;
  private buildApiUrl: (path: string) => string;

  constructor(stateManager: DevStateManager, buildApiUrl: (path: string) => string) {
    this.stateManager = stateManager;
    this.buildApiUrl = buildApiUrl;
  }

  isInitialized(): boolean {
    return this.stateManager.getCurrentFilePath() !== null;
  }

  beginBatch(): void {
    const filename = this.stateManager.getCurrentFilePath();
    if (filename) {
      this.callTopologyIO('POST', `/api/topology/${encodeURIComponent(filename)}/batch/begin`);
    }
  }

  async endBatch(): Promise<SaveResult> {
    const filename = this.stateManager.getCurrentFilePath();
    if (filename) {
      return this.callTopologyIO('POST', `/api/topology/${encodeURIComponent(filename)}/batch/end`);
    }
    return { success: true };
  }

  async addNode(nodeData: NodeSaveData): Promise<SaveResult> {
    const filename = this.stateManager.getCurrentFilePath();
    if (!filename) return { success: false, error: 'No file path' };

    return this.callTopologyIO('POST', `/api/topology/${encodeURIComponent(filename)}/node`, {
      id: nodeData.id,
      name: nodeData.name,
      extraData: nodeData.extraData,
      position: nodeData.position
    });
  }

  async editNode(nodeData: NodeSaveData): Promise<SaveResult> {
    const filename = this.stateManager.getCurrentFilePath();
    if (!filename) return { success: false, error: 'No file path' };

    return this.callTopologyIO('PUT', `/api/topology/${encodeURIComponent(filename)}/node`, {
      id: nodeData.id,
      name: nodeData.name,
      extraData: nodeData.extraData
    });
  }

  async deleteNode(nodeId: string): Promise<SaveResult> {
    const filename = this.stateManager.getCurrentFilePath();
    if (!filename) return { success: false, error: 'No file path' };

    return this.callTopologyIO('DELETE', `/api/topology/${encodeURIComponent(filename)}/node/${encodeURIComponent(nodeId)}`);
  }

  async addLink(linkData: LinkSaveData): Promise<SaveResult> {
    const filename = this.stateManager.getCurrentFilePath();
    if (!filename) return { success: false, error: 'No file path' };

    return this.callTopologyIO('POST', `/api/topology/${encodeURIComponent(filename)}/link`, linkData);
  }

  async editLink(linkData: LinkSaveData): Promise<SaveResult> {
    const filename = this.stateManager.getCurrentFilePath();
    if (!filename) return { success: false, error: 'No file path' };

    return this.callTopologyIO('PUT', `/api/topology/${encodeURIComponent(filename)}/link`, {
      source: linkData.source,
      target: linkData.target,
      sourceEndpoint: linkData.sourceEndpoint,
      targetEndpoint: linkData.targetEndpoint,
      extraData: linkData.extraData,
      originalSource: linkData.originalSource,
      originalTarget: linkData.originalTarget,
      originalSourceEndpoint: linkData.originalSourceEndpoint,
      originalTargetEndpoint: linkData.originalTargetEndpoint,
    });
  }

  async deleteLink(linkData: LinkSaveData): Promise<SaveResult> {
    const filename = this.stateManager.getCurrentFilePath();
    if (!filename) return { success: false, error: 'No file path' };

    return this.callTopologyIO('DELETE', `/api/topology/${encodeURIComponent(filename)}/link`, {
      source: linkData.source,
      target: linkData.target,
      sourceEndpoint: linkData.sourceEndpoint,
      targetEndpoint: linkData.targetEndpoint
    });
  }

  async savePositions(positions: NodePositionData[]): Promise<SaveResult> {
    const filename = this.stateManager.getCurrentFilePath();
    if (!filename) return { success: false, error: 'No file path' };

    return this.callTopologyIO('POST', `/api/topology/${encodeURIComponent(filename)}/positions`, { positions });
  }

  private async callTopologyIO(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown
  ): Promise<SaveResult> {
    try {
      const url = this.buildApiUrl(path);
      const opts: RequestInit = {
        method,
        headers: { 'Content-Type': 'application/json' }
      };
      if (body) opts.body = JSON.stringify(body);
      const response = await fetch(url, opts);
      const result = await response.json();

      if (!result.success) {
        return { success: false, error: result.error || 'Server error' };
      }
      return result.data || { success: true };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('%c[TopologyIO Error]', 'color: #f44336;', err);
      return { success: false, error: errorMsg };
    }
  }
}

// ============================================================================
// Mock Annotations Service
// ============================================================================

export class MockAnnotationsService implements IAnnotationsService {
  private stateManager: DevStateManager;
  private buildApiUrl: (path: string) => string;

  constructor(stateManager: DevStateManager, buildApiUrl: (path: string) => string) {
    this.stateManager = stateManager;
    this.buildApiUrl = buildApiUrl;
  }

  async loadAnnotations(yamlFilePath: string): Promise<TopologyAnnotations> {
    const filename = this.stateManager.getCurrentFilePath() || yamlFilePath;
    try {
      const url = this.buildApiUrl(`/api/annotations/${encodeURIComponent(filename)}`);
      const response = await fetch(url);
      const result = await response.json();
      if (result.success && result.data) {
        return result.data as TopologyAnnotations;
      }
      return {};
    } catch (err) {
      console.error('%c[AnnotationsIO Error]', 'color: #f44336;', err);
      return {};
    }
  }

  async saveAnnotations(yamlFilePath: string, annotations: TopologyAnnotations): Promise<void> {
    const filename = this.stateManager.getCurrentFilePath() || yamlFilePath;
    try {
      const url = this.buildApiUrl(`/api/annotations/${encodeURIComponent(filename)}`);
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(annotations)
      });
    } catch (err) {
      console.error('%c[AnnotationsIO Error]', 'color: #f44336;', err);
    }
  }

  async modifyAnnotations(
    yamlFilePath: string,
    modifier: (annotations: TopologyAnnotations) => TopologyAnnotations
  ): Promise<void> {
    const current = await this.loadAnnotations(yamlFilePath);
    const modified = modifier(current);
    await this.saveAnnotations(yamlFilePath, modified);
  }
}

// ============================================================================
// Mock Node Command Service
// ============================================================================

export class MockNodeCommandService implements INodeCommandService {
  async handleNodeCommand(command: string, nodeName: string): Promise<{ result?: string; error?: string }> {
    console.log(`%c[Mock] Node command: ${command} on "${nodeName}"`, 'color: #4CAF50;');
    return { result: `Mock: ${command} on ${nodeName}` };
  }

  async handleInterfaceCommand(
    command: string,
    params: { nodeName: string; interfaceName: string }
  ): Promise<{ result?: string; error?: string }> {
    console.log(`%c[Mock] Interface command: ${command} on "${params.nodeName}:${params.interfaceName}"`, 'color: #4CAF50;');
    return { result: `Mock: ${command} on ${params.nodeName}:${params.interfaceName}` };
  }
}

// ============================================================================
// Mock Lifecycle Service
// ============================================================================

export class MockLifecycleService implements ILifecycleService {
  private stateManager: DevStateManager;
  private latencySimulator: LatencySimulator;

  constructor(stateManager: DevStateManager, latencySimulator: LatencySimulator) {
    this.stateManager = stateManager;
    this.latencySimulator = latencySimulator;
  }

  async handleLifecycleCommand(command: string, _yamlFilePath: string): Promise<{ result?: string; error?: string }> {
    console.log(`%c[Mock] Lifecycle command: ${command}`, 'color: #FF9800;');

    if (command === 'deployLab' || command === 'redeployLab') {
      this.latencySimulator.simulateCallback('lifecycle', () => {
        this.stateManager.setDeploymentState('deployed');
        this.stateManager.setMode('view');
        sendMessageToWebviewWithLog(
          { type: 'topo-mode-changed', data: { mode: 'viewer', deploymentState: 'deployed' } },
          'deploy-complete'
        );
      });
    } else if (command === 'destroyLab') {
      this.latencySimulator.simulateCallback('lifecycle', () => {
        this.stateManager.setDeploymentState('undeployed');
        this.stateManager.setMode('edit');
        sendMessageToWebviewWithLog(
          { type: 'topo-mode-changed', data: { mode: 'editor', deploymentState: 'undeployed' } },
          'destroy-complete'
        );
      });
    }

    return { result: `Mock: ${command}` };
  }
}

// ============================================================================
// Mock Custom Node Service
// ============================================================================

export class MockCustomNodeService implements ICustomNodeService {
  private stateManager: DevStateManager;

  constructor(stateManager: DevStateManager) {
    this.stateManager = stateManager;
  }

  async saveCustomNode(nodeData: { name: string; [key: string]: unknown }): Promise<{
    result?: { customNodes: unknown[]; defaultNode: string };
    error?: string;
  }> {
    console.log(`%c[Mock] Saving custom node: ${nodeData.name}`, 'color: #4CAF50;');
    const customNodes = this.stateManager.getCustomNodes();
    const existingIndex = customNodes.findIndex((n) => n.name === nodeData.name);
    if (existingIndex >= 0) {
      customNodes[existingIndex] = nodeData as Record<string, unknown>;
    } else {
      customNodes.push(nodeData as Record<string, unknown>);
    }
    this.stateManager.setCustomNodes(customNodes);
    return {
      result: {
        customNodes,
        defaultNode: this.stateManager.getState().defaultCustomNode || ''
      }
    };
  }

  async deleteCustomNode(name: string): Promise<{
    result?: { customNodes: unknown[]; defaultNode: string };
    error?: string;
  }> {
    console.log(`%c[Mock] Deleting custom node: ${name}`, 'color: #4CAF50;');
    const customNodes = this.stateManager.getCustomNodes();
    const filtered = customNodes.filter((n) => n.name !== name);
    this.stateManager.setCustomNodes(filtered);
    const defaultNode = this.stateManager.getState().defaultCustomNode || '';
    return {
      result: {
        customNodes: filtered,
        defaultNode: defaultNode === name ? '' : defaultNode
      }
    };
  }

  async setDefaultCustomNode(name: string): Promise<{
    result?: { customNodes: unknown[]; defaultNode: string };
    error?: string;
  }> {
    console.log(`%c[Mock] Setting default custom node: ${name}`, 'color: #4CAF50;');
    this.stateManager.setDefaultCustomNode(name);
    return {
      result: {
        customNodes: this.stateManager.getCustomNodes(),
        defaultNode: name
      }
    };
  }
}

// ============================================================================
// Mock Clipboard Service
// ============================================================================

export class MockClipboardService implements IClipboardService {
  private stateManager: DevStateManager;

  constructor(stateManager: DevStateManager) {
    this.stateManager = stateManager;
  }

  async copy(data: unknown): Promise<void> {
    this.stateManager.setClipboard(data);
  }

  async paste(): Promise<unknown | null> {
    return this.stateManager.getClipboard();
  }
}

// ============================================================================
// Mock Split View Service
// ============================================================================

export class MockSplitViewService implements ISplitViewService {
  private splitViewPanel: SplitViewPanel | null = null;

  setSplitViewPanel(panel: SplitViewPanel): void {
    this.splitViewPanel = panel;
  }

  async toggle(_yamlFilePath: string): Promise<boolean> {
    if (this.splitViewPanel) {
      this.splitViewPanel.toggle();
      return this.splitViewPanel.getIsOpen();
    }
    return false;
  }

  updateContent(): void {
    if (this.splitViewPanel) {
      this.splitViewPanel.updateContent();
    }
  }
}

// ============================================================================
// Mock Lab Settings Service
// ============================================================================

export class MockLabSettingsService implements ILabSettingsService {
  private buildApiUrl: (path: string) => string;

  constructor(buildApiUrl: (path: string) => string) {
    this.buildApiUrl = buildApiUrl;
  }

  async saveLabSettings(
    yamlFilePath: string,
    settings: { name?: string; prefix?: string | null; mgmt?: Record<string, unknown> | null }
  ): Promise<void> {
    console.log(`%c[Mock] Saving lab settings for ${yamlFilePath}:`, 'color: #4CAF50;', settings);
    try {
      const url = this.buildApiUrl(`/api/topology/${encodeURIComponent(yamlFilePath)}/settings`);
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      const result = await response.json();
      if (!result.success) {
        console.error('%c[Mock] Failed to save lab settings:', 'color: #f44336;', result.error);
      }
    } catch (err) {
      console.error('%c[Mock] Failed to save lab settings:', 'color: #f44336;', err);
    }
  }
}

// ============================================================================
// Mock Context
// ============================================================================

/**
 * Mock context that fetches from server. No local cache - server is source of truth.
 */
export class MockMessageRouterContext implements IMessageRouterContext {
  private stateManager: DevStateManager;
  private buildApiUrl: (path: string) => string;
  // Temporary cache populated by loadTopologyData - only used within a request
  private lastElements: CyElement[] = [];

  constructor(stateManager: DevStateManager, buildApiUrl: (path: string) => string) {
    this.stateManager = stateManager;
    this.buildApiUrl = buildApiUrl;
  }

  get yamlFilePath(): string {
    return this.stateManager.getCurrentFilePath() || '';
  }

  get isViewMode(): boolean {
    return this.stateManager.getMode() === 'view';
  }

  // Cache methods - use temporary cache populated by loadTopologyData
  getCachedElements(): CyElement[] {
    return this.lastElements;
  }

  updateCachedElements(elements: CyElement[]): void {
    this.lastElements = elements;
  }

  findCachedNode(nodeId: string): CyElement | undefined {
    return this.lastElements.find(
      el => el.group === 'nodes' && el.data.id === nodeId
    );
  }

  findCachedEdge(edgeId: string): CyElement | undefined {
    return this.lastElements.find(
      el => el.group === 'edges' && el.data.id === edgeId
    );
  }

  async loadTopologyData(): Promise<unknown> {
    const filename = this.stateManager.getCurrentFilePath();
    if (!filename) {
      return { elements: [], annotations: {} };
    }

    try {
      const url = this.buildApiUrl(`/api/topology/${encodeURIComponent(filename)}/elements`);
      const response = await fetch(url);
      const result = await response.json();

      if (result.success && result.data) {
        const { elements, annotations } = result.data;
        this.lastElements = elements; // Update temporary cache
        return { elements, annotations };
      }
    } catch (err) {
      console.error('%c[MockContext]', 'color: #f44336;', 'Failed to fetch topology:', err);
    }

    return { elements: [], annotations: {} };
  }
}

// ============================================================================
// Mock Logger
// ============================================================================

export const mockLogger: IOLogger = {
  debug: (msg: string) => console.debug('%c[Mock]', 'color: #9E9E9E;', msg),
  info: (msg: string) => console.log('%c[Mock]', 'color: #2196F3;', msg),
  warn: (msg: string) => console.warn('%c[Mock]', 'color: #FF9800;', msg),
  error: (msg: string) => console.error('%c[Mock]', 'color: #f44336;', msg),
};

// ============================================================================
// Factory Function
// ============================================================================

export function createMockServices(options: {
  stateManager: DevStateManager;
  latencySimulator: LatencySimulator;
  buildApiUrl: (path: string) => string;
  splitViewPanel?: SplitViewPanel;
}) {
  const splitViewService = new MockSplitViewService();
  if (options.splitViewPanel) {
    splitViewService.setSplitViewPanel(options.splitViewPanel);
  }

  return {
    messaging: new MockMessagingService(),
    persistence: new MockPersistenceService(options.stateManager, options.buildApiUrl),
    annotations: new MockAnnotationsService(options.stateManager, options.buildApiUrl),
    nodeCommands: new MockNodeCommandService(),
    lifecycle: new MockLifecycleService(options.stateManager, options.latencySimulator),
    customNodes: new MockCustomNodeService(options.stateManager),
    clipboard: new MockClipboardService(options.stateManager),
    splitView: splitViewService,
    labSettings: new MockLabSettingsService(options.buildApiUrl),
    context: new MockMessageRouterContext(options.stateManager, options.buildApiUrl),
    logger: mockLogger,
  };
}
