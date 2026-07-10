import type { ClabInterfaceSnapshot } from "../types/containerlab";
import type { LabRef } from "../treeView/common";

import type {
  BackendInitializationResult,
  ContainerlabBackend,
  ContainerlabBackendKind,
  LabLifecycleRequest,
  RuntimeSnapshot
} from "./types";

/** Explicit failure backend used when configuration cannot be constructed safely. */
export class UnavailableBackend implements ContainerlabBackend {
  readonly id: string;
  readonly capabilities = new Set<never>();

  constructor(
    readonly kind: ContainerlabBackendKind,
    private readonly reason: string
  ) {
    this.id = `unavailable:${kind}`;
  }

  async initialize(): Promise<BackendInitializationResult> {
    return { authenticated: false, message: this.reason };
  }

  dispose(): void {}

  async refreshRuntimeSnapshot(): Promise<RuntimeSnapshot> {
    return { labs: {} };
  }

  getRuntimeSnapshot(): RuntimeSnapshot {
    return { labs: {} };
  }

  getInterfaceSnapshot(_containerShortId: string, _containerName: string): ClabInterfaceSnapshot[] {
    return [];
  }

  getInterfaceVersion(_containerShortId: string): number {
    return 0;
  }

  isPollingMode(): boolean {
    return false;
  }

  resetPollingMode(): void {}

  onRuntimeDataChanged(_listener: () => void): () => void {
    return () => {};
  }

  onContainerStateChanged(
    _listener: (containerShortId: string, newState: string) => void
  ): () => void {
    return () => {};
  }

  async runLabLifecycle(_request: LabLifecycleRequest): Promise<void> {
    throw new Error(this.reason);
  }

  cancelActiveOperation(): boolean {
    return false;
  }

  async isAuthenticated(): Promise<boolean> {
    return false;
  }

  getAuthenticatedSession(): undefined {
    return undefined;
  }

  getServerCapabilities(): undefined {
    return undefined;
  }

  resolveLabRef(labName: string, runtimePath?: string): LabRef {
    return {
      backendId: this.id,
      labName,
      ...(this.kind === "local" && runtimePath ? { localPath: runtimePath } : {}),
      ...(this.kind === "api" && runtimePath ? { remotePath: runtimePath } : {})
    };
  }

  async rememberLabSource(_labName: string, _localPath: string): Promise<void> {}
}
