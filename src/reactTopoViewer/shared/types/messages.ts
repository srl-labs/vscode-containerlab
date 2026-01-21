/**
 * Shared message types between extension and webview
 */

// Re-export CyElement from topology.ts (single source of truth)

import type {
  MSG_EDGE_STATS_UPDATE,
  MSG_EXTERNAL_FILE_CHANGE,
  MSG_NODE_RENAMED,
  MSG_TOPO_MODE_CHANGE,
  MSG_TOPOLOGY_DATA
} from "../messages/webview";
import type { EdgeStatsUpdate } from "../../extension/services/EdgeStatsBuilder";

import { CyElement, type TopologyAnnotations, type EdgeAnnotation } from "./topology";

export { CyElement };

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
  type: "POST";
  endpointName: string;
  payload?: string;
}

/**
 * Response message from extension to webview
 */
export interface ResponseMessage extends BaseMessage {
  type: "POST_RESPONSE";
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
  type: typeof MSG_TOPOLOGY_DATA;
  data: {
    elements: CyElement[];
    labName: string;
    mode: "edit" | "view";
    viewerSettings?: TopologyAnnotations["viewerSettings"];
    edgeAnnotations?: EdgeAnnotation[];
  };
}

/**
 * Mode changed message
 */
export interface ModeChangedMessage extends PushMessage {
  type: typeof MSG_TOPO_MODE_CHANGE;
  data: {
    mode: "editor" | "viewer";
    deploymentState: "deployed" | "undeployed" | "unknown";
  };
}

/**
 * Edge stats update message
 */
export interface EdgeStatsUpdateMessage extends PushMessage {
  type: typeof MSG_EDGE_STATS_UPDATE;
  data: {
    edgeUpdates: EdgeStatsUpdate[];
  };
}

/**
 * Node renamed message - sent after a node is renamed to trigger in-place update
 */
export interface NodeRenamedMessage extends PushMessage {
  type: typeof MSG_NODE_RENAMED;
  data: {
    oldId: string;
    newId: string;
  };
}

/**
 * External file change message - sent when YAML file is modified outside the webview
 * Used to notify webview to clear undo history
 */
export interface ExternalFileChangeMessage extends PushMessage {
  type: typeof MSG_EXTERNAL_FILE_CHANGE;
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
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(newState: unknown): void;
}

/**
 * Endpoint names for message passing
 */
export type EndpointName =
  | "lab-settings-get"
  | "lab-settings-update"
  | "topo-viewport-save"
  | "topo-editor-viewport-save"
  | "topo-editor-load-annotations"
  | "topo-editor-save-annotations"
  | "topo-switch-mode"
  | "deployLab"
  | "destroyLab"
  | "redeployLab"
  | "get-topology-data";
