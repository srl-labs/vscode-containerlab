/**
 * TopologyHost client - dispatches commands and snapshot requests to the host.
 *
 * Supports:
 * - VS Code webview messaging
 * - Dev server HTTP endpoints
 */

import type {
  TopologyHostCommand,
  TopologyHostResponseMessage,
  TopologySnapshot,
} from "../../shared/types/messages";
import { TOPOLOGY_HOST_PROTOCOL_VERSION } from "../../shared/types/messages";
import type { DeploymentState } from "../../shared/types/topology";
import { subscribeToWebviewMessages } from "../messaging/webviewMessageBus";

declare global {
  interface Window {
    vscode?: { postMessage(data: unknown): void; __isDevMock__?: boolean };
  }
}

interface HostContext {
  path?: string;
  mode?: "edit" | "view";
  deploymentState?: DeploymentState;
  sessionId?: string;
}

interface PendingRequest {
  resolve: (value: TopologyHostResponseMessage | TopologySnapshot) => void;
  reject: (err: Error) => void;
  expectedType: "snapshot" | "command";
}

const pending = new Map<string, PendingRequest>();
let revision = 1;
let hostContext: HostContext = {};
let listenerStarted = false;

type HostMessageType =
  | "topology-host:snapshot"
  | "topology-host:ack"
  | "topology-host:reject"
  | "topology-host:error";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isHostMessageType(value: unknown): value is HostMessageType {
  return (
    value === "topology-host:snapshot" ||
    value === "topology-host:ack" ||
    value === "topology-host:reject" ||
    value === "topology-host:error"
  );
}

function isDeploymentState(value: unknown): value is DeploymentState {
  return value === "deployed" || value === "undeployed" || value === "unknown";
}

function hasSnapshotRevision(value: Record<string, unknown>): boolean {
  return typeof value.revision === "number" && Number.isFinite(value.revision);
}

function hasSnapshotCollections(value: Record<string, unknown>): boolean {
  return Array.isArray(value.nodes) && Array.isArray(value.edges) && isRecord(value.annotations);
}

function hasSnapshotTextFields(value: Record<string, unknown>): boolean {
  const textFields = [
    "yamlFileName",
    "annotationsFileName",
    "yamlContent",
    "annotationsContent",
    "labName",
  ] as const;
  return textFields.every((field) => typeof value[field] === "string");
}

function hasSnapshotModeAndState(value: Record<string, unknown>): boolean {
  return (
    (value.mode === "edit" || value.mode === "view") && isDeploymentState(value.deploymentState)
  );
}

function hasSnapshotHistoryFlags(value: Record<string, unknown>): boolean {
  return typeof value.canUndo === "boolean" && typeof value.canRedo === "boolean";
}

function isTopologySnapshot(value: unknown): value is TopologySnapshot {
  if (!isRecord(value)) return false;
  return (
    hasSnapshotRevision(value) &&
    hasSnapshotCollections(value) &&
    hasSnapshotTextFields(value) &&
    hasSnapshotModeAndState(value) &&
    hasSnapshotHistoryFlags(value)
  );
}

function hasValidHostMessageEnvelope(value: Record<string, unknown>): value is Record<
  string,
  unknown
> & {
  type: HostMessageType;
  requestId: string;
  protocolVersion: number;
} {
  return (
    isHostMessageType(value.type) &&
    typeof value.requestId === "string" &&
    value.requestId.length > 0 &&
    typeof value.protocolVersion === "number" &&
    Number.isFinite(value.protocolVersion)
  );
}

function isHostAckPayload(value: Record<string, unknown>): boolean {
  return (
    typeof value.revision === "number" &&
    Number.isFinite(value.revision) &&
    (value.snapshot === undefined || isTopologySnapshot(value.snapshot))
  );
}

function isHostRejectPayload(value: Record<string, unknown>): boolean {
  return (
    typeof value.revision === "number" &&
    Number.isFinite(value.revision) &&
    value.reason === "stale" &&
    isTopologySnapshot(value.snapshot)
  );
}

function isTopologyHostResponseMessage(value: unknown): value is TopologyHostResponseMessage {
  if (!isRecord(value)) return false;
  if (!hasValidHostMessageEnvelope(value)) return false;

  switch (value.type) {
    case "topology-host:snapshot":
      return isTopologySnapshot(value.snapshot);
    case "topology-host:ack":
      return isHostAckPayload(value);
    case "topology-host:reject":
      return isHostRejectPayload(value);
    case "topology-host:error":
      return typeof value.error === "string";
    default:
      return false;
  }
}

function ensureListener(): void {
  if (listenerStarted) return;
  subscribeToWebviewMessages(
    (event) => {
      if (!isRecord(event.data)) return;
      const { data } = event;
      if (!isHostMessageType(data.type)) return;
      if (typeof data.requestId !== "string" || data.requestId.length === 0) return;
      const requestId = data.requestId;

      const pendingRequest = pending.get(requestId);
      if (!pendingRequest) return;

      if (data.type === "topology-host:snapshot") {
        if (pendingRequest.expectedType !== "snapshot") {
          pendingRequest.reject(new Error("Unexpected snapshot response"));
          pending.delete(requestId);
          return;
        }
        if (!isTopologySnapshot(data.snapshot)) {
          pendingRequest.reject(new Error("Snapshot message missing payload"));
          pending.delete(requestId);
          return;
        }
        pendingRequest.resolve(data.snapshot);
        pending.delete(requestId);
        return;
      }

      if (pendingRequest.expectedType !== "command") {
        pendingRequest.reject(new Error("Unexpected command response"));
        pending.delete(requestId);
        return;
      }
      if (!isTopologyHostResponseMessage(data)) {
        pendingRequest.reject(new Error("Invalid command response payload"));
        pending.delete(requestId);
        return;
      }
      pendingRequest.resolve(data);
      pending.delete(requestId);
    },
    (event) => {
      if (!isRecord(event.data)) return false;
      return isHostMessageType(event.data.type);
    }
  );
  listenerStarted = true;
}

function isVsCode(): boolean {
  if (typeof window === "undefined" || !window.vscode) {
    return false;
  }
  // In dev mode, window.vscode is a mock with __isDevMock__ marker
  // We should use HTTP endpoints instead of VS Code messaging
  return window.vscode.__isDevMock__ !== true;
}

function buildApiUrl(path: string, sessionId?: string): string {
  if (sessionId === undefined || sessionId.length === 0) return path;
  const delimiter = path.includes("?") ? "&" : "?";
  return `${path}${delimiter}sessionId=${encodeURIComponent(sessionId)}`;
}

/** Send a message to VS Code with timeout handling */
function sendVsCodeRequest(
  message: Record<string, unknown>,
  expectedType: "snapshot",
  timeoutMs?: number
): Promise<TopologySnapshot>;
function sendVsCodeRequest(
  message: Record<string, unknown>,
  expectedType: "command",
  timeoutMs?: number
): Promise<TopologyHostResponseMessage>;
function sendVsCodeRequest(
  message: Record<string, unknown>,
  expectedType: "snapshot" | "command",
  timeoutMs = 30000
): Promise<TopologyHostResponseMessage | TopologySnapshot> {
  ensureListener();
  const requestId = globalThis.crypto.randomUUID();
  return new Promise((resolve, reject) => {
    pending.set(requestId, {
      resolve,
      reject,
      expectedType,
    });
    window.vscode?.postMessage({ ...message, requestId });
    setTimeout(() => {
      if (pending.has(requestId)) {
        pending.delete(requestId);
        reject(
          new Error(`${expectedType === "snapshot" ? "Snapshot" : "Command"} request timed out`)
        );
      }
    }, timeoutMs);
  });
}

export function setHostContext(update: Partial<HostContext>): void {
  hostContext = { ...hostContext, ...update };
}

export function getHostContext(): HostContext {
  return hostContext;
}

export function getHostRevision(): number {
  return revision;
}

export function setHostRevision(nextRevision: number): void {
  revision = nextRevision;
}

export async function requestSnapshot(
  options: { externalChange?: boolean } = {}
): Promise<TopologySnapshot> {
  if (isVsCode()) {
    return sendVsCodeRequest(
      { type: "topology-host:get-snapshot", protocolVersion: TOPOLOGY_HOST_PROTOCOL_VERSION },
      "snapshot"
    );
  }

  if (hostContext.path === undefined || hostContext.path.length === 0) {
    throw new Error("Dev host context missing topology path");
  }

  const response = await fetch(buildApiUrl("/api/topology/snapshot", hostContext.sessionId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path: hostContext.path,
      mode: hostContext.mode,
      deploymentState: hostContext.deploymentState,
      externalChange: options.externalChange ?? false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch snapshot: ${response.statusText}`);
  }

  const payload: unknown = await response.json();
  if (!isRecord(payload) || !isTopologySnapshot(payload.snapshot)) {
    throw new Error("Snapshot response payload is invalid");
  }
  return payload.snapshot;
}

export async function dispatchTopologyCommand(
  command: TopologyHostCommand
): Promise<TopologyHostResponseMessage> {
  if (isVsCode()) {
    return sendVsCodeRequest(
      {
        type: "topology-host:command",
        protocolVersion: TOPOLOGY_HOST_PROTOCOL_VERSION,
        baseRevision: revision,
        command,
      },
      "command"
    );
  }

  if (hostContext.path === undefined || hostContext.path.length === 0) {
    throw new Error("Dev host context missing topology path");
  }

  const response = await fetch(buildApiUrl("/api/topology/command", hostContext.sessionId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path: hostContext.path,
      baseRevision: revision,
      command,
      mode: hostContext.mode,
      deploymentState: hostContext.deploymentState,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to send command: ${response.statusText}`);
  }

  const payload: unknown = await response.json();
  if (!isTopologyHostResponseMessage(payload)) {
    throw new Error("Command response payload is invalid");
  }
  return payload;
}
