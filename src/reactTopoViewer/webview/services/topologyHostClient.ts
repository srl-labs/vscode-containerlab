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
  TopologySnapshot
} from "../../shared/types/messages";
import { TOPOLOGY_HOST_PROTOCOL_VERSION } from "../../shared/types/messages";
import type { DeploymentState } from "../../shared/types/topology";
import { subscribeToWebviewMessages } from "../messaging/webviewMessageBus";

declare global {
  interface Window {
    vscode?: { postMessage(data: unknown): void };
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

function ensureListener(): void {
  if (listenerStarted) return;
  subscribeToWebviewMessages(
    (event) => {
      const data = event.data as { type?: string; requestId?: string } | undefined;
      if (!data?.type || !data.requestId) return;

      const pendingRequest = pending.get(data.requestId);
      if (!pendingRequest) return;

      if (data.type === "topology-host:snapshot") {
        if (pendingRequest.expectedType !== "snapshot") {
          pendingRequest.reject(new Error("Unexpected snapshot response"));
          pending.delete(data.requestId);
          return;
        }
        const snapshot = (data as { snapshot?: TopologySnapshot }).snapshot;
        if (!snapshot) {
          pendingRequest.reject(new Error("Snapshot message missing payload"));
          pending.delete(data.requestId);
          return;
        }
        pendingRequest.resolve(snapshot);
        pending.delete(data.requestId);
        return;
      }

      if (
        data.type === "topology-host:ack" ||
        data.type === "topology-host:reject" ||
        data.type === "topology-host:error"
      ) {
        if (pendingRequest.expectedType !== "command") {
          pendingRequest.reject(new Error("Unexpected command response"));
          pending.delete(data.requestId);
          return;
        }
        pendingRequest.resolve(data as TopologyHostResponseMessage);
        pending.delete(data.requestId);
      }
    },
    (event) => {
      const type = event.data?.type;
      return (
        type === "topology-host:snapshot" ||
        type === "topology-host:ack" ||
        type === "topology-host:reject" ||
        type === "topology-host:error"
      );
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
  const vscode = window.vscode as { __isDevMock__?: boolean };
  return !vscode.__isDevMock__;
}

function buildApiUrl(path: string, sessionId?: string): string {
  if (!sessionId) return path;
  const delimiter = path.includes("?") ? "&" : "?";
  return `${path}${delimiter}sessionId=${encodeURIComponent(sessionId)}`;
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

export async function requestSnapshot(): Promise<TopologySnapshot> {
  if (isVsCode()) {
    ensureListener();
    const requestId = globalThis.crypto.randomUUID();
    return new Promise((resolve, reject) => {
      pending.set(requestId, {
        resolve: resolve as PendingRequest["resolve"],
        reject,
        expectedType: "snapshot"
      });
      window.vscode?.postMessage({
        type: "topology-host:get-snapshot",
        protocolVersion: TOPOLOGY_HOST_PROTOCOL_VERSION,
        requestId
      });
      setTimeout(() => {
        if (pending.has(requestId)) {
          pending.delete(requestId);
          reject(new Error("Snapshot request timed out"));
        }
      }, 30000);
    }) as Promise<TopologySnapshot>;
  }

  if (!hostContext.path) {
    throw new Error("Dev host context missing topology path");
  }

  const response = await fetch(buildApiUrl("/api/topology/snapshot", hostContext.sessionId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path: hostContext.path,
      mode: hostContext.mode,
      deploymentState: hostContext.deploymentState
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch snapshot: ${response.statusText}`);
  }

  const payload = (await response.json()) as { snapshot: TopologySnapshot };
  return payload.snapshot;
}

export async function dispatchTopologyCommand(
  command: TopologyHostCommand
): Promise<TopologyHostResponseMessage> {
  if (isVsCode()) {
    ensureListener();
    const requestId = globalThis.crypto.randomUUID();
    return new Promise((resolve, reject) => {
      pending.set(requestId, {
        resolve: resolve as PendingRequest["resolve"],
        reject,
        expectedType: "command"
      });
      window.vscode?.postMessage({
        type: "topology-host:command",
        protocolVersion: TOPOLOGY_HOST_PROTOCOL_VERSION,
        requestId,
        baseRevision: revision,
        command
      });
      setTimeout(() => {
        if (pending.has(requestId)) {
          pending.delete(requestId);
          reject(new Error("Command request timed out"));
        }
      }, 30000);
    }) as Promise<TopologyHostResponseMessage>;
  }

  if (!hostContext.path) {
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
      deploymentState: hostContext.deploymentState
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to send command: ${response.statusText}`);
  }

  return (await response.json()) as TopologyHostResponseMessage;
}
