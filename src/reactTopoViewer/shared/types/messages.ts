/**
 * Shared message types between extension and webview.
 *
 * Topology state is authoritative in the host via the TopologyHost protocol.
 */

import type { NodeSaveData } from "../io/NodePersistenceIO";
import type { LinkSaveData } from "../io/LinkPersistenceIO";

import type { TopologyAnnotations, EdgeAnnotation, DeploymentState } from "./topology";
import type { TopoNode, TopoEdge } from "./graph";
import type { LabSettings } from "./labSettings";

/**
 * Base message interface for all messages
 */
export interface BaseMessage {
  type: string;
  requestId?: string;
}

/**
 * Mode changed message
 */
export interface ModeChangedMessage extends BaseMessage {
  type: "topo-mode-changed";
  data: {
    mode: "editor" | "viewer";
    deploymentState: "deployed" | "undeployed" | "unknown";
  };
}

// ============================================================================
// TopologyHost Protocol (authoritative host state)
// ============================================================================

export const TOPOLOGY_HOST_PROTOCOL_VERSION = 1;

export type TopologyHostCommand =
  | { command: "addNode"; payload: NodeSaveData }
  | { command: "editNode"; payload: NodeSaveData }
  | { command: "deleteNode"; payload: { id: string } }
  | { command: "addLink"; payload: LinkSaveData }
  | { command: "editLink"; payload: LinkSaveData }
  | { command: "deleteLink"; payload: LinkSaveData }
  | {
      command: "savePositions";
      payload: Array<{
        id: string;
        position?: { x: number; y: number };
        geoCoordinates?: { lat: number; lng: number };
      }>;
    }
  | {
      command: "savePositionsAndAnnotations";
      payload: {
        positions: Array<{
          id: string;
          position?: { x: number; y: number };
          geoCoordinates?: { lat: number; lng: number };
        }>;
        annotations?: Partial<TopologyAnnotations>;
      };
    }
  | { command: "setAnnotations"; payload: Partial<TopologyAnnotations> }
  | { command: "setEdgeAnnotations"; payload: EdgeAnnotation[] }
  | { command: "setViewerSettings"; payload: NonNullable<TopologyAnnotations["viewerSettings"]> }
  | { command: "setNodeGroupMembership"; payload: { nodeId: string; groupId: string | null } }
  | {
      command: "setNodeGroupMemberships";
      payload: Array<{ nodeId: string; groupId: string | null }>;
    }
  | { command: "setLabSettings"; payload: LabSettings }
  | { command: "undo" }
  | { command: "redo" };

export interface TopologySnapshot {
  revision: number;
  nodes: TopoNode[];
  edges: TopoEdge[];
  annotations: TopologyAnnotations;
  labName: string;
  mode: "edit" | "view";
  deploymentState: DeploymentState;
  labSettings?: LabSettings;
  canUndo: boolean;
  canRedo: boolean;
}

export interface TopologyPatch {
  revision: number;
  nodes?: TopoNode[];
  edges?: TopoEdge[];
  annotations?: Partial<TopologyAnnotations>;
  labName?: string;
  mode?: "edit" | "view";
  deploymentState?: DeploymentState;
  labSettings?: LabSettings;
  canUndo?: boolean;
  canRedo?: boolean;
}

export interface TopologyHostSnapshotRequestMessage extends BaseMessage {
  type: "topology-host:get-snapshot";
  protocolVersion: number;
  requestId: string;
}

export interface TopologyHostCommandMessage extends BaseMessage {
  type: "topology-host:command";
  protocolVersion: number;
  requestId: string;
  baseRevision: number;
  command: TopologyHostCommand;
}

export interface TopologyHostAckMessage extends BaseMessage {
  type: "topology-host:ack";
  protocolVersion: number;
  requestId: string;
  revision: number;
  snapshot?: TopologySnapshot;
  patch?: TopologyPatch;
}

export interface TopologyHostRejectMessage extends BaseMessage {
  type: "topology-host:reject";
  protocolVersion: number;
  requestId: string;
  revision: number;
  snapshot: TopologySnapshot;
  reason: "stale";
}

export interface TopologyHostErrorMessage extends BaseMessage {
  type: "topology-host:error";
  protocolVersion: number;
  requestId: string;
  error: string;
}

export interface TopologyHostSnapshotMessage extends BaseMessage {
  type: "topology-host:snapshot";
  protocolVersion: number;
  snapshot: TopologySnapshot;
  reason?: "init" | "external-change" | "resync";
}

export type TopologyHostResponseMessage =
  | TopologyHostAckMessage
  | TopologyHostRejectMessage
  | TopologyHostErrorMessage
  | TopologyHostSnapshotMessage;
