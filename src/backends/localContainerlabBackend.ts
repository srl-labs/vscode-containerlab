import * as vscode from "vscode";

import { outputChannel } from "../globals";
import * as events from "../services/containerlabEvents";
import * as fallback from "../services/containerlabInspectFallback";

import type {
  BackendInitializationResult,
  ContainerlabBackend,
  LabLifecycleRequest,
  RuntimeSnapshot
} from "./types";

const CAPABILITIES = new Set([
  "runtime-inspect",
  "lab-lifecycle",
  "local-runtime",
  "interface-stats",
  "runtime-actions",
  "captures",
  "runtime-images",
  "terminal-sessions",
  "topology-files",
  "workspace-files",
  "netem"
] as const);

export class LocalContainerlabBackend implements ContainerlabBackend {
  readonly id = "local";
  readonly kind = "local" as const;
  readonly capabilities = CAPABILITIES;

  private forcedPollingMode = false;

  async initialize(): Promise<BackendInitializationResult> {
    return { authenticated: true };
  }

  dispose(): void {
    events.stopEventStream();
    fallback.stopPolling();
  }

  isPollingMode(): boolean {
    if (this.forcedPollingMode) {
      return true;
    }
    return (
      vscode.workspace.getConfiguration("containerlab").get<string>("refreshMode", "events") ===
      "polling"
    );
  }

  resetPollingMode(): void {
    this.forcedPollingMode = false;
  }

  async refreshRuntimeSnapshot(): Promise<RuntimeSnapshot> {
    const config = vscode.workspace.getConfiguration("containerlab");
    const runtime = config.get<string>("runtime", "docker");

    if (this.isPollingMode()) {
      await fallback.ensureFallback(runtime);
      return { labs: fallback.getGroupedContainers() };
    }

    try {
      await events.ensureEventStream(runtime);
      return { labs: events.getGroupedContainers() };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      outputChannel.warn(`[local backend] Events stream failed: ${message}; using polling`);
      this.forcedPollingMode = true;
      await fallback.ensureFallback(runtime);
      return { labs: fallback.getGroupedContainers() };
    }
  }

  getRuntimeSnapshot(): RuntimeSnapshot {
    return {
      labs: this.isPollingMode() ? fallback.getGroupedContainers() : events.getGroupedContainers()
    };
  }

  getInterfaceSnapshot(containerShortId: string, containerName: string) {
    return this.isPollingMode()
      ? fallback.getInterfaceSnapshot(containerShortId, containerName)
      : events.getInterfaceSnapshot(containerShortId, containerName);
  }

  getInterfaceVersion(containerShortId: string): number {
    return this.isPollingMode()
      ? fallback.getInterfaceVersion(containerShortId)
      : events.getInterfaceVersion(containerShortId);
  }

  onRuntimeDataChanged(listener: () => void): () => void {
    const disposeEvents = events.onDataChanged(() => {
      if (!this.isPollingMode()) listener();
    });
    const disposeFallback = fallback.onDataChanged(() => {
      if (this.isPollingMode()) listener();
    });
    return () => {
      disposeEvents();
      disposeFallback();
    };
  }

  onContainerStateChanged(
    listener: (containerShortId: string, newState: string, backendId?: string) => void
  ): () => void {
    return events.onContainerStateChanged((containerShortId, newState) => {
      if (!this.isPollingMode()) listener(containerShortId, newState, this.id);
    });
  }

  async runLabLifecycle(request: LabLifecycleRequest): Promise<void> {
    const { ClabCommand } = await import("../commands/clabCommand");
    const command = new ClabCommand(
      request.action,
      request.node,
      undefined,
      undefined,
      undefined,
      request.onSuccess,
      request.onFailure,
      request.onOutputLine
    );
    if (request.cleanup) {
      await command.run(["-c"]);
    } else {
      await command.run();
    }
  }

  cancelActiveOperation(): boolean {
    // Local command cancellation is owned by commands/command and invoked by
    // MessageRouter before delegating API cancellation here.
    return false;
  }

  async isAuthenticated(): Promise<boolean> {
    return true;
  }

  getAuthenticatedSession(): undefined {
    return undefined;
  }

  getServerCapabilities(): undefined {
    return undefined;
  }

  resolveLabRef(labName: string, runtimePath?: string) {
    return {
      backendId: this.id,
      labName,
      ...(runtimePath ? { localPath: runtimePath } : {})
    };
  }

  async rememberLabSource(_labName: string, _localPath: string): Promise<void> {
    // Local runtime paths already are client filesystem paths.
  }
}
