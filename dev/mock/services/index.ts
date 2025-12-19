/**
 * Mock Service Implementations
 *
 * These implement the shared service interfaces for the dev environment,
 * using DevStateManager for state and HTTP calls for TopologyIO persistence.
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
    sendMessageToWebviewWithLog({
      type: 'panel-action',
      action,
      ...data
    }, `panel-${action}`);
  }
}

// ============================================================================
// Mock Persistence Service
// ============================================================================

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
    this.stateManager.beginBatch();
    const filename = this.stateManager.getCurrentFilePath();
    if (filename) {
      this.callTopologyIO('POST', `/api/topology/${encodeURIComponent(filename)}/batch/begin`);
    }
  }

  async endBatch(): Promise<SaveResult> {
    this.stateManager.endBatch();
    const filename = this.stateManager.getCurrentFilePath();
    if (filename) {
      await this.callTopologyIO('POST', `/api/topology/${encodeURIComponent(filename)}/batch/end`);
    }
    return { success: true };
  }

  async addNode(nodeData: NodeSaveData): Promise<SaveResult> {
    const filename = this.stateManager.getCurrentFilePath();
    if (!filename) return { success: false, error: 'No file path' };

    const position = nodeData.position || { x: 100, y: 100 };

    // Update local state - keep extraData nested, promote style fields to top level
    const nodeDataObj: Record<string, unknown> = {
      id: nodeData.id,
      name: nodeData.name,
      extraData: nodeData.extraData
    };
    // Promote style-related fields to top level for Cytoscape styling
    if (nodeData.extraData?.topoViewerRole) {
      nodeDataObj.topoViewerRole = nodeData.extraData.topoViewerRole;
    }
    if (nodeData.extraData?.iconColor) {
      nodeDataObj.iconColor = nodeData.extraData.iconColor;
    }
    if (nodeData.extraData?.iconCornerRadius !== undefined) {
      nodeDataObj.iconCornerRadius = nodeData.extraData.iconCornerRadius;
    }
    const node: CyElement = {
      group: 'nodes',
      data: nodeDataObj,
      position
    };
    this.stateManager.addNode(node);

    // Also update annotations with position (so topology-data broadcast includes it)
    const annotations = this.stateManager.getAnnotations();
    if (!annotations.nodeAnnotations) {
      annotations.nodeAnnotations = [];
    }
    const existingAnn = annotations.nodeAnnotations.find(a => a.id === nodeData.id);
    if (!existingAnn) {
      annotations.nodeAnnotations.push({
        id: nodeData.id,
        position,
        icon: (nodeData.extraData?.topoViewerRole as string) || 'router'
      });
    } else {
      existingAnn.position = position;
    }
    this.stateManager.setAnnotations(annotations);

    // Call TopologyIO
    await this.callTopologyIO('POST', `/api/topology/${encodeURIComponent(filename)}/node`, {
      id: nodeData.id,
      name: nodeData.name,
      extraData: nodeData.extraData,
      position: nodeData.position
    });

    return { success: true };
  }

  async editNode(nodeData: NodeSaveData): Promise<SaveResult> {
    const filename = this.stateManager.getCurrentFilePath();
    if (!filename) return { success: false, error: 'No file path' };

    const elements = this.stateManager.getElements();
    const existingNode = elements.find(
      el => el.group === 'nodes' && el.data.id === nodeData.id
    );

    const isRename = existingNode && nodeData.name !== nodeData.id;

    // Call TopologyIO
    await this.callTopologyIO('PUT', `/api/topology/${encodeURIComponent(filename)}/node`, {
      id: nodeData.id,
      name: nodeData.name,
      extraData: nodeData.extraData
    });

    // Always update local state with extraData (for icon changes, etc.)
    // For renames, also update ID and edge references
    const updated = elements.map(el => {
      if (el.group === 'nodes' && el.data.id === nodeData.id) {
        const newId = isRename ? nodeData.name : nodeData.id;
        const newName = isRename ? nodeData.name : el.data.name;
        // Keep extraData nested, merge with existing extraData
        const existingExtraData = (el.data.extraData || {}) as Record<string, unknown>;
        const mergedExtraData = { ...existingExtraData, ...nodeData.extraData };
        const mergedData: Record<string, unknown> = {
          ...el.data,
          id: newId,
          name: newName,
          extraData: mergedExtraData
        };
        // Promote style-related fields to top level for Cytoscape styling
        if (nodeData.extraData?.topoViewerRole) {
          mergedData.topoViewerRole = nodeData.extraData.topoViewerRole;
        }
        if (nodeData.extraData?.iconColor) {
          mergedData.iconColor = nodeData.extraData.iconColor;
        }
        if (nodeData.extraData?.iconCornerRadius !== undefined) {
          mergedData.iconCornerRadius = nodeData.extraData.iconCornerRadius;
        }
        return { ...el, data: mergedData };
      }
      // Update edges that reference old name (only for renames)
      if (isRename && el.group === 'edges') {
        const data = { ...el.data };
        if (data.source === nodeData.id) data.source = nodeData.name;
        if (data.target === nodeData.id) data.target = nodeData.name;
        return { ...el, data };
      }
      return el;
    });
    this.stateManager.updateElements(updated);

    if (isRename) {
      // Also update nodeAnnotations with the new ID
      const annotations = this.stateManager.getAnnotations();
      if (annotations.nodeAnnotations) {
        const annIdx = annotations.nodeAnnotations.findIndex(a => a.id === nodeData.id);
        if (annIdx !== -1) {
          annotations.nodeAnnotations[annIdx].id = nodeData.name;
          this.stateManager.setAnnotations(annotations);
        }
      }

      return {
        success: true,
        renamed: { oldId: nodeData.id, newId: nodeData.name }
      };
    }

    return { success: true };
  }

  async deleteNode(nodeId: string): Promise<SaveResult> {
    const filename = this.stateManager.getCurrentFilePath();
    if (!filename) return { success: false, error: 'No file path' };

    // Update local state
    this.stateManager.removeNode(nodeId);

    await this.callTopologyIO('DELETE', `/api/topology/${encodeURIComponent(filename)}/node/${encodeURIComponent(nodeId)}`);
    return { success: true };
  }

  async addLink(linkData: LinkSaveData): Promise<SaveResult> {
    const filename = this.stateManager.getCurrentFilePath();
    if (!filename) return { success: false, error: 'No file path' };

    // Create edge element for local state
    // Use provided ID if available, otherwise generate one
    const edgeId = (linkData as { id?: string }).id ||
      `${linkData.source}:${linkData.sourceEndpoint || 'eth1'}--${linkData.target}:${linkData.targetEndpoint || 'eth1'}`;
    const edge: CyElement = {
      group: 'edges',
      data: {
        id: edgeId,
        source: linkData.source,
        target: linkData.target,
        sourceEndpoint: linkData.sourceEndpoint || 'eth1',
        targetEndpoint: linkData.targetEndpoint || 'eth1',
        ...linkData.extraData
      }
    };
    this.stateManager.addEdge(edge);

    await this.callTopologyIO('POST', `/api/topology/${encodeURIComponent(filename)}/link`, linkData);
    return { success: true };
  }

  async editLink(linkData: LinkSaveData): Promise<SaveResult> {
    const filename = this.stateManager.getCurrentFilePath();
    if (!filename) return { success: false, error: 'No file path' };

    await this.callTopologyIO('PUT', `/api/topology/${encodeURIComponent(filename)}/link`, {
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
    return { success: true };
  }

  async deleteLink(linkData: LinkSaveData): Promise<SaveResult> {
    const filename = this.stateManager.getCurrentFilePath();
    if (!filename) return { success: false, error: 'No file path' };

    // Update local state - find the edge by source/target/endpoints
    const elements = this.stateManager.getElements();
    const edgeToRemove = elements.find(el =>
      el.group === 'edges' &&
      el.data.source === linkData.source &&
      el.data.target === linkData.target &&
      (el.data.sourceEndpoint || 'eth1') === (linkData.sourceEndpoint || 'eth1') &&
      (el.data.targetEndpoint || 'eth1') === (linkData.targetEndpoint || 'eth1')
    );
    if (edgeToRemove) {
      this.stateManager.removeEdge(edgeToRemove.data.id as string);
    }

    await this.callTopologyIO('DELETE', `/api/topology/${encodeURIComponent(filename)}/link`, {
      source: linkData.source,
      target: linkData.target,
      sourceEndpoint: linkData.sourceEndpoint,
      targetEndpoint: linkData.targetEndpoint
    });
    return { success: true };
  }

  async savePositions(positions: NodePositionData[]): Promise<SaveResult> {
    const filename = this.stateManager.getCurrentFilePath();
    if (!filename) return { success: false, error: 'No file path' };

    // Update local state
    this.stateManager.updateNodePositions(positions);

    // Call TopologyIO using correct endpoint
    await this.callTopologyIO('POST', `/api/topology/${encodeURIComponent(filename)}/positions`, { positions });
    return { success: true };
  }

  private async callTopologyIO(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown
  ): Promise<void> {
    try {
      const url = this.buildApiUrl(path);
      const opts: RequestInit = {
        method,
        headers: { 'Content-Type': 'application/json' }
      };
      if (body) opts.body = JSON.stringify(body);
      await fetch(url, opts);
    } catch (err) {
      console.error('%c[TopologyIO Error]', 'color: #f44336;', err);
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

  async loadAnnotations(_yamlFilePath: string): Promise<TopologyAnnotations> {
    return this.stateManager.getAnnotations();
  }

  async saveAnnotations(yamlFilePath: string, annotations: TopologyAnnotations): Promise<void> {
    this.stateManager.setAnnotations(annotations);
    const filename = this.stateManager.getCurrentFilePath() || yamlFilePath;
    await this.callAnnotationsIO(filename, annotations);
  }

  async modifyAnnotations(
    yamlFilePath: string,
    modifier: (annotations: TopologyAnnotations) => TopologyAnnotations
  ): Promise<void> {
    const current = this.stateManager.getAnnotations();
    const modified = modifier(current);
    await this.saveAnnotations(yamlFilePath, modified);
  }

  private async callAnnotationsIO(filename: string, annotations: TopologyAnnotations): Promise<void> {
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
    this.stateManager.updateCustomNode(nodeData.name, nodeData);
    return {
      result: {
        customNodes: this.stateManager.getCustomNodes(),
        defaultNode: this.stateManager.getState().defaultCustomNode || ''
      }
    };
  }

  async deleteCustomNode(name: string): Promise<{
    result?: { customNodes: unknown[]; defaultNode: string };
    error?: string;
  }> {
    console.log(`%c[Mock] Deleting custom node: ${name}`, 'color: #4CAF50;');
    this.stateManager.deleteCustomNode(name);
    return {
      result: {
        customNodes: this.stateManager.getCustomNodes(),
        defaultNode: this.stateManager.getState().defaultCustomNode || ''
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
        defaultNode: this.stateManager.getState().defaultCustomNode || ''
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
      return this.splitViewPanel.toggle();
    }
    return false;
  }

  updateContent(): void {
    // No-op for mock
  }
}

// ============================================================================
// Mock Lab Settings Service
// ============================================================================

export class MockLabSettingsService implements ILabSettingsService {
  async saveLabSettings(
    yamlFilePath: string,
    settings: { name?: string; prefix?: string | null; mgmt?: Record<string, unknown> | null }
  ): Promise<void> {
    console.log(`%c[Mock] Saving lab settings for ${yamlFilePath}:`, 'color: #4CAF50;', settings);
  }
}

// ============================================================================
// Mock Context
// ============================================================================

export class MockMessageRouterContext implements IMessageRouterContext {
  private stateManager: DevStateManager;

  constructor(stateManager: DevStateManager) {
    this.stateManager = stateManager;
  }

  get yamlFilePath(): string {
    return this.stateManager.getCurrentFilePath() || '';
  }

  get isViewMode(): boolean {
    return this.stateManager.getMode() === 'view';
  }

  getCachedElements(): CyElement[] {
    return this.stateManager.getElements();
  }

  updateCachedElements(elements: CyElement[]): void {
    this.stateManager.updateElements(elements);
  }

  findCachedNode(nodeId: string): CyElement | undefined {
    return this.stateManager.getElements().find(
      el => el.group === 'nodes' && el.data.id === nodeId
    );
  }

  findCachedEdge(edgeId: string): CyElement | undefined {
    return this.stateManager.getElements().find(
      el => el.group === 'edges' && el.data.id === edgeId
    );
  }

  async loadTopologyData(): Promise<unknown> {
    return {
      elements: this.stateManager.getElements(),
      annotations: this.stateManager.getAnnotations()
    };
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
    labSettings: new MockLabSettingsService(),
    context: new MockMessageRouterContext(options.stateManager),
    logger: mockLogger,
  };
}
