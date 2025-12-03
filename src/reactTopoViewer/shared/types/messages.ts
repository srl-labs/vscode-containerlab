/**
 * Shared message types between extension and webview
 */

/**
 * Base message interface for all messages
 */
export interface BaseMessage {
  type: string;
  requestId?: string;
}

/**
 * Request message from webview to extension
 */
export interface RequestMessage extends BaseMessage {
  type: 'POST';
  endpointName: string;
  payload?: string;
}

/**
 * Response message from extension to webview
 */
export interface ResponseMessage extends BaseMessage {
  type: 'POST_RESPONSE';
  requestId: string;
  result: unknown;
  error: string | null;
}

/**
 * Push message from extension to webview
 */
export interface PushMessage extends BaseMessage {
  type: string;
  data?: unknown;
}

/**
 * Topology data message
 */
export interface TopologyDataMessage extends PushMessage {
  type: 'topology-data';
  data: {
    elements: CyElement[];
    labName: string;
    mode: 'edit' | 'view';
  };
}

/**
 * Mode changed message
 */
export interface ModeChangedMessage extends PushMessage {
  type: 'topo-mode-changed';
  data: {
    mode: 'editor' | 'viewer';
    deploymentState: 'deployed' | 'undeployed' | 'unknown';
  };
}

/**
 * Cytoscape element definition
 */
export interface CyElement {
  group: 'nodes' | 'edges';
  data: Record<string, unknown>;
  position?: { x: number; y: number };
  classes?: string;
}

/**
 * Node data for Cytoscape nodes
 */
export interface NodeData {
  id: string;
  label: string;
  kind?: string;
  type?: string;
  image?: string;
  parent?: string;
  [key: string]: unknown;
}

/**
 * Edge data for Cytoscape edges
 */
export interface EdgeData {
  id: string;
  source: string;
  target: string;
  sourceEndpoint?: string;
  targetEndpoint?: string;
  [key: string]: unknown;
}

/**
 * VS Code API interface exposed to webview
 */
export interface VSCodeAPI {
  // eslint-disable-next-line no-unused-vars
  postMessage(msg: unknown): void;
  getState(): unknown;
  // eslint-disable-next-line no-unused-vars
  setState(newState: unknown): void;
}

/**
 * Endpoint names for message passing
 */
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
  | 'get-topology-data';
