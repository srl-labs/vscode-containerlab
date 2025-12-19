/**
 * MessageServiceInterfaces - Service interfaces for message handler abstraction
 *
 * These interfaces define the contracts that must be implemented by both
 * the production VS Code extension and the dev mock environment.
 */

import { TopologyAnnotations, CyElement } from '../types/topology';
import { SaveResult, NodeSaveData, LinkSaveData, IOLogger } from '../io';

// Re-export commonly used types
export type { SaveResult, NodeSaveData, LinkSaveData, IOLogger };

// ============================================================================
// Webview Message Types
// ============================================================================

/**
 * Node position data from webview
 */
export interface NodePositionData {
  id: string;
  position: { x: number; y: number };
}

/**
 * Standard webview message format
 */
export interface WebviewMessage {
  type?: string;
  command?: string;
  requestId?: string;
  endpointName?: string;
  payload?: unknown;
  data?: unknown;
  level?: string;
  message?: string;
  positions?: NodePositionData[];
  // Additional fields for flexibility
  nodeId?: string;
  edgeId?: string;
  nodeName?: string;
  nodeData?: Record<string, unknown>;
  linkData?: Record<string, unknown>;
  position?: { x: number; y: number };
  annotations?: unknown;
  [key: string]: unknown;
}

// ============================================================================
// Service Interfaces
// ============================================================================

/**
 * Messaging service - how to send messages back to webview
 */
export interface IMessagingService {
  /**
   * Send a message to the webview
   */
  postMessage(message: unknown): void;

  /**
   * Send a panel action message (node-info, edit-node, etc.)
   */
  postPanelAction(action: string, data: Record<string, unknown>): void;
}

/**
 * Persistence service - CRUD operations for nodes, links, and positions
 */
export interface IPersistenceService {
  /**
   * Check if the service is initialized and ready
   */
  isInitialized(): boolean;

  /**
   * Begin a batch operation (defers saves until endBatch)
   */
  beginBatch(): void;

  /**
   * End batch operation and flush pending saves
   */
  endBatch(): Promise<SaveResult>;

  /**
   * Add a new node to the topology
   */
  addNode(nodeData: NodeSaveData): Promise<SaveResult>;

  /**
   * Edit an existing node
   */
  editNode(nodeData: NodeSaveData): Promise<SaveResult>;

  /**
   * Delete a node from the topology
   */
  deleteNode(nodeId: string): Promise<SaveResult>;

  /**
   * Add a new link to the topology
   */
  addLink(linkData: LinkSaveData): Promise<SaveResult>;

  /**
   * Edit an existing link
   */
  editLink(linkData: LinkSaveData): Promise<SaveResult>;

  /**
   * Delete a link from the topology
   */
  deleteLink(linkData: LinkSaveData): Promise<SaveResult>;

  /**
   * Save node positions to annotations
   */
  savePositions(positions: NodePositionData[]): Promise<SaveResult>;
}

/**
 * Annotations service - annotation CRUD operations
 */
export interface IAnnotationsService {
  /**
   * Load annotations from file
   */
  loadAnnotations(yamlFilePath: string): Promise<TopologyAnnotations>;

  /**
   * Save annotations to file
   */
  saveAnnotations(yamlFilePath: string, annotations: TopologyAnnotations): Promise<void>;

  /**
   * Atomically modify annotations using a modifier function
   */
  modifyAnnotations(
    yamlFilePath: string,
    modifier: (annotations: TopologyAnnotations) => TopologyAnnotations
  ): Promise<void>;
}

/**
 * Node command service - SSH, logs, shell operations
 */
export interface INodeCommandService {
  /**
   * Handle a node-related command (SSH, logs, shell)
   */
  handleNodeCommand(command: string, nodeName: string): Promise<{ result?: string; error?: string }>;

  /**
   * Handle an interface-related command (capture)
   */
  handleInterfaceCommand(
    command: string,
    params: { nodeName: string; interfaceName: string }
  ): Promise<{ result?: string; error?: string }>;
}

/**
 * Lifecycle service - deploy/destroy/redeploy operations
 */
export interface ILifecycleService {
  /**
   * Handle a lab lifecycle command
   */
  handleLifecycleCommand(command: string, yamlFilePath: string): Promise<{ result?: string; error?: string }>;
}

/**
 * Custom node service - custom node template management
 */
export interface ICustomNodeService {
  /**
   * Save a custom node template
   */
  saveCustomNode(nodeData: { name: string; [key: string]: unknown }): Promise<{
    result?: { customNodes: unknown[]; defaultNode: string };
    error?: string;
  }>;

  /**
   * Delete a custom node template
   */
  deleteCustomNode(name: string): Promise<{
    result?: { customNodes: unknown[]; defaultNode: string };
    error?: string;
  }>;

  /**
   * Set the default custom node template
   */
  setDefaultCustomNode(name: string): Promise<{
    result?: { customNodes: unknown[]; defaultNode: string };
    error?: string;
  }>;
}

/**
 * Clipboard service - copy/paste operations
 */
export interface IClipboardService {
  /**
   * Copy elements to clipboard
   */
  copy(data: unknown): Promise<void>;

  /**
   * Get copied elements from clipboard
   */
  paste(): Promise<unknown | null>;
}

/**
 * Split view service - toggle split view
 */
export interface ISplitViewService {
  /**
   * Toggle split view and return new state
   */
  toggle(yamlFilePath: string): Promise<boolean>;

  /**
   * Update split view content (if open)
   */
  updateContent(): void;
}

/**
 * Lab settings service - save lab name, prefix, mgmt settings
 */
export interface ILabSettingsService {
  /**
   * Save lab settings to YAML file
   */
  saveLabSettings(
    yamlFilePath: string,
    settings: { name?: string; prefix?: string | null; mgmt?: Record<string, unknown> | null }
  ): Promise<void>;
}

// ============================================================================
// Context Interface
// ============================================================================

/**
 * Message router context - provides access to state and cached elements
 */
export interface IMessageRouterContext {
  /**
   * Path to the YAML file being edited
   */
  yamlFilePath: string;

  /**
   * Whether the viewer is in read-only mode
   */
  isViewMode: boolean;

  /**
   * Get the cached topology elements
   */
  getCachedElements(): CyElement[];

  /**
   * Update cached elements
   */
  updateCachedElements(elements: CyElement[]): void;

  /**
   * Find a cached node by ID
   */
  findCachedNode(nodeId: string): CyElement | undefined;

  /**
   * Find a cached edge by ID
   */
  findCachedEdge(edgeId: string): CyElement | undefined;

  /**
   * Load topology data (for POST requests)
   */
  loadTopologyData(): Promise<unknown>;
}

// ============================================================================
// Combined Services Interface
// ============================================================================

/**
 * All services required by the message handler
 */
export interface MessageHandlerServices {
  messaging: IMessagingService;
  persistence: IPersistenceService;
  annotations: IAnnotationsService;
  nodeCommands: INodeCommandService;
  lifecycle: ILifecycleService;
  customNodes: ICustomNodeService;
  clipboard: IClipboardService;
  splitView: ISplitViewService;
  labSettings: ILabSettingsService;
  context: IMessageRouterContext;
  logger: IOLogger;
}
