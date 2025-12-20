/**
 * Production Service Adapters
 *
 * These adapters wrap the VS Code extension services to implement
 * the shared service interfaces from MessageServiceInterfaces.
 */

// Re-export schema adapter functions
export { getCustomNodesFromConfig, loadSchemaData } from './schemaAdapter';

import * as vscode from 'vscode';
import * as YAML from 'yaml';

import type { TopologyIO } from '../../../shared/io';
import { nodeFsAdapter, AnnotationsIO } from '../../../shared/io';
import type {
  IMessagingService,
  IPersistenceService,
  IAnnotationsService,
  INodeCommandService,
  ILifecycleService,
  ICustomNodeService,
  ISplitViewService,
  ILabSettingsService,
  IMessageRouterContext,
  SaveResult,
  NodeSaveData,
  LinkSaveData,
  NodePositionData,
  IOLogger,
} from '../../../shared/messaging';
import type { TopologyAnnotations, CyElement } from '../../../shared/types/topology';
import { nodeCommandService } from '../NodeCommandService';
import { labLifecycleService } from '../LabLifecycleService';
import { splitViewManager } from '../SplitViewManager';
import { customNodeConfigManager } from '../CustomNodeConfigManager';
import { yamlSettingsManager } from '../YamlSettingsManager';
import { log } from '../logger';

// ============================================================================
// Messaging Service Adapter
// ============================================================================

/**
 * Adapter for sending messages to VS Code webview
 */
export class MessagingServiceAdapter implements IMessagingService {
  constructor(private panel: vscode.WebviewPanel) {}

  postMessage(message: unknown): void {
    this.panel.webview.postMessage(message);
  }

  postPanelAction(action: string, data: Record<string, unknown>): void {
    this.panel.webview.postMessage({
      type: 'panel-action',
      action,
      ...data
    });
  }
}

// ============================================================================
// Persistence Service Adapter
// ============================================================================

/**
 * Adapter for TopologyIO
 * Requires a TopologyIO instance (no default singleton since TopologyIO needs per-file initialization)
 */
export class PersistenceServiceAdapter implements IPersistenceService {
  constructor(private service: TopologyIO) {}

  isInitialized(): boolean {
    return this.service.isInitialized();
  }

  beginBatch(): void {
    this.service.beginBatch();
  }

  async endBatch(): Promise<SaveResult> {
    return this.service.endBatch();
  }

  async addNode(nodeData: NodeSaveData): Promise<SaveResult> {
    return this.service.addNode(nodeData);
  }

  async editNode(nodeData: NodeSaveData): Promise<SaveResult> {
    return this.service.editNode(nodeData);
  }

  async deleteNode(nodeId: string): Promise<SaveResult> {
    return this.service.deleteNode(nodeId);
  }

  async addLink(linkData: LinkSaveData): Promise<SaveResult> {
    return this.service.addLink(linkData);
  }

  async editLink(linkData: LinkSaveData): Promise<SaveResult> {
    return this.service.editLink(linkData);
  }

  async deleteLink(linkData: LinkSaveData): Promise<SaveResult> {
    return this.service.deleteLink(linkData);
  }

  async savePositions(positions: NodePositionData[]): Promise<SaveResult> {
    return this.service.savePositions(positions);
  }
}

// ============================================================================
// Annotations Service Adapter
// ============================================================================

/**
 * Adapter for AnnotationsIO
 * Can be instantiated with a custom instance or defaults to the extension singleton
 */
export class AnnotationsServiceAdapter implements IAnnotationsService {
  constructor(private io: AnnotationsIO = annotationsIO) {}

  async loadAnnotations(yamlFilePath: string): Promise<TopologyAnnotations> {
    return this.io.loadAnnotations(yamlFilePath);
  }

  async saveAnnotations(yamlFilePath: string, annotations: TopologyAnnotations): Promise<void> {
    await this.io.saveAnnotations(yamlFilePath, annotations);
  }

  async modifyAnnotations(
    yamlFilePath: string,
    modifier: (annotations: TopologyAnnotations) => TopologyAnnotations
  ): Promise<void> {
    await this.io.modifyAnnotations(yamlFilePath, modifier);
  }
}

// ============================================================================
// Node Command Service Adapter
// ============================================================================

/**
 * Adapter for NodeCommandService
 */
export class NodeCommandServiceAdapter implements INodeCommandService {
  constructor(private yamlFilePath: string) {}

  async handleNodeCommand(command: string, nodeName: string): Promise<{ result?: string; error?: string }> {
    nodeCommandService.setYamlFilePath(this.yamlFilePath);
    const res = await nodeCommandService.handleNodeEndpoint(command, nodeName);
    return { result: res.result as string | undefined, error: res.error ?? undefined };
  }

  async handleInterfaceCommand(
    command: string,
    params: { nodeName: string; interfaceName: string }
  ): Promise<{ result?: string; error?: string }> {
    nodeCommandService.setYamlFilePath(this.yamlFilePath);
    const res = await nodeCommandService.handleInterfaceEndpoint(command, params);
    return { result: res.result as string | undefined, error: res.error ?? undefined };
  }

  setYamlFilePath(yamlFilePath: string): void {
    this.yamlFilePath = yamlFilePath;
  }
}

// ============================================================================
// Lifecycle Service Adapter
// ============================================================================

/**
 * Adapter for LabLifecycleService
 */
export class LifecycleServiceAdapter implements ILifecycleService {
  async handleLifecycleCommand(command: string, yamlFilePath: string): Promise<{ result?: string; error?: string }> {
    const res = await labLifecycleService.handleLabLifecycleEndpoint(command, yamlFilePath);
    return { result: res.result as string | undefined, error: res.error ?? undefined };
  }
}

// ============================================================================
// Custom Node Service Adapter
// ============================================================================

/**
 * Adapter for CustomNodeConfigManager
 */
type CustomNodeResult = { customNodes: unknown[]; defaultNode: string };

export class CustomNodeServiceAdapter implements ICustomNodeService {
  async saveCustomNode(nodeData: { name: string; [key: string]: unknown }): Promise<{
    result?: CustomNodeResult;
    error?: string;
  }> {
    const res = await customNodeConfigManager.saveCustomNode(nodeData);
    return { result: res.result as CustomNodeResult | undefined, error: res.error ?? undefined };
  }

  async deleteCustomNode(name: string): Promise<{
    result?: CustomNodeResult;
    error?: string;
  }> {
    const res = await customNodeConfigManager.deleteCustomNode(name);
    return { result: res.result as CustomNodeResult | undefined, error: res.error ?? undefined };
  }

  async setDefaultCustomNode(name: string): Promise<{
    result?: CustomNodeResult;
    error?: string;
  }> {
    const res = await customNodeConfigManager.setDefaultCustomNode(name);
    return { result: res.result as CustomNodeResult | undefined, error: res.error ?? undefined };
  }
}

// ============================================================================
// Split View Service Adapter
// ============================================================================

/**
 * Adapter for SplitViewManager
 */
export class SplitViewServiceAdapter implements ISplitViewService {
  constructor(private panel: vscode.WebviewPanel) {}

  async toggle(yamlFilePath: string): Promise<boolean> {
    return splitViewManager.toggleSplitView(yamlFilePath, this.panel);
  }

  updateContent(): void {
    // Split view updates are handled internally by the manager
  }
}

// ============================================================================
// Lab Settings Service Adapter
// ============================================================================

/**
 * Adapter for saving lab settings to YAML
 */
export class LabSettingsServiceAdapter implements ILabSettingsService {
  async saveLabSettings(
    yamlFilePath: string,
    settings: { name?: string; prefix?: string | null; mgmt?: Record<string, unknown> | null }
  ): Promise<void> {
    const yamlContent = await nodeFsAdapter.readFile(yamlFilePath);
    const doc = YAML.parseDocument(yamlContent);

    const { hadPrefix, hadMgmt } = yamlSettingsManager.applyExistingSettings(doc, settings);
    let updatedYaml = doc.toString();
    updatedYaml = yamlSettingsManager.insertMissingSettings(updatedYaml, settings, hadPrefix, hadMgmt);

    await nodeFsAdapter.writeFile(yamlFilePath, updatedYaml);
    void vscode.window.showInformationMessage('Lab settings saved successfully');
  }
}

// ============================================================================
// Message Router Context Adapter
// ============================================================================

/**
 * Adapter for MessageRouterContext
 */
export class MessageRouterContextAdapter implements IMessageRouterContext {
  private elements: CyElement[] = [];
  private _isViewMode: boolean;
  private _yamlFilePath: string;
  private _loadTopologyData: () => Promise<unknown>;

  constructor(options: {
    yamlFilePath: string;
    isViewMode: boolean;
    lastTopologyElements: CyElement[];
    loadTopologyData: () => Promise<unknown>;
  }) {
    this._yamlFilePath = options.yamlFilePath;
    this._isViewMode = options.isViewMode;
    this.elements = options.lastTopologyElements;
    this._loadTopologyData = options.loadTopologyData;
  }

  get yamlFilePath(): string {
    return this._yamlFilePath;
  }

  get isViewMode(): boolean {
    return this._isViewMode;
  }

  getCachedElements(): CyElement[] {
    return this.elements;
  }

  updateCachedElements(elements: CyElement[]): void {
    this.elements = elements;
  }

  findCachedNode(nodeId: string): CyElement | undefined {
    return this.elements.find(
      el => el.group === 'nodes' && (el.data as Record<string, unknown>)?.id === nodeId
    );
  }

  findCachedEdge(edgeId: string): CyElement | undefined {
    return this.elements.find(
      el => el.group === 'edges' && (el.data as Record<string, unknown>)?.id === edgeId
    );
  }

  async loadTopologyData(): Promise<unknown> {
    return this._loadTopologyData();
  }

  // Methods for updating context
  setYamlFilePath(path: string): void {
    this._yamlFilePath = path;
  }

  setViewMode(isViewMode: boolean): void {
    this._isViewMode = isViewMode;
  }

  setElements(elements: CyElement[]): void {
    this.elements = elements;
  }
}

// ============================================================================
// Logger Adapter
// ============================================================================

/**
 * Extension logger adapter
 */
export const extensionLogger: IOLogger = {
  debug: (msg: string) => log.debug(msg),
  info: (msg: string) => log.info(msg),
  warn: (msg: string) => log.warn(msg),
  error: (msg: string) => log.error(msg),
};

// ============================================================================
// Extension Singletons
// ============================================================================

/**
 * Singleton AnnotationsIO instance for the VS Code extension.
 * Uses NodeFsAdapter for direct file system access.
 */
export const annotationsIO = new AnnotationsIO({
  fs: nodeFsAdapter,
  logger: extensionLogger,
});

// ============================================================================
// Factory Function
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
    messaging: new MessagingServiceAdapter(options.panel),
    persistence: new PersistenceServiceAdapter(options.topologyIO),
    annotations: new AnnotationsServiceAdapter(options.annotationsIO),
    nodeCommands: new NodeCommandServiceAdapter(options.yamlFilePath),
    lifecycle: new LifecycleServiceAdapter(),
    customNodes: new CustomNodeServiceAdapter(),
    splitView: new SplitViewServiceAdapter(options.panel),
    labSettings: new LabSettingsServiceAdapter(),
    context,
    logger: extensionLogger,
  };
}
