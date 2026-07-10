import type { ClabDetailedJSON, LabRef } from "../treeView/common";
import type { ClabInterfaceSnapshot } from "../types/containerlab";

import type {
  AuthenticatedBackendSession,
  BackendCapability,
  BackendInitializationResult,
  BackendServerCapabilities,
  ContainerlabBackend,
  LabLifecycleRequest,
  RuntimeSnapshot
} from "./types";

interface BackendBinding {
  disposeContainerListener: () => void;
  disposeDataListener: () => void;
}

const SNAPSHOT_KEY_SEPARATOR = "\u0000";

function snapshotKey(backendId: string, backendLabKey: string): string {
  return `${backendId}${SNAPSHOT_KEY_SEPARATOR}${backendLabKey}`;
}

function containersForBackend(
  backend: ContainerlabBackend,
  containers: ClabDetailedJSON[]
): ClabDetailedJSON[] {
  return containers.map((container) => ({
    ...container,
    Labels: {
      ...container.Labels,
      "clab-backend-id": backend.id
    }
  }));
}

/**
 * Aggregates independent local and API backends for one VS Code window.
 *
 * The router owns no transport or runtime state. It preserves backend-scoped
 * identities in the combined snapshot and delegates every mutation to the
 * backend identified by the selected lab.
 */
export class WorkspaceContainerlabBackend implements ContainerlabBackend {
  readonly id = "workspace";
  readonly kind = "workspace" as const;
  readonly capabilities: ReadonlySet<BackendCapability>;

  private readonly capabilitySet = new Set<BackendCapability>();
  private readonly backends = new Map<string, ContainerlabBackend>();
  private readonly bindings = new Map<string, BackendBinding>();
  private readonly dataListeners = new Set<() => void>();
  private readonly containerListeners = new Set<
    (containerShortId: string, newState: string, backendId?: string) => void
  >();
  private snapshot: RuntimeSnapshot = { labs: {} };

  constructor() {
    this.capabilities = this.capabilitySet;
  }

  addBackend(backend: ContainerlabBackend): void {
    const existing = this.backends.get(backend.id);
    if (existing === backend) return;
    if (existing !== undefined) this.removeBackend(backend.id);

    this.backends.set(backend.id, backend);
    this.bindings.set(backend.id, {
      disposeDataListener: backend.onRuntimeDataChanged(() => {
        this.rebuildSnapshot();
        this.notifyDataChanged();
      }),
      disposeContainerListener: backend.onContainerStateChanged((containerShortId, newState) => {
        for (const listener of this.containerListeners) {
          listener(containerShortId, newState, backend.id);
        }
      })
    });
    this.rebuildCapabilities();
    this.rebuildSnapshot();
    this.notifyDataChanged();
  }

  removeBackend(backendId: string, dispose = true): ContainerlabBackend | undefined {
    const backend = this.backends.get(backendId);
    if (backend === undefined) return undefined;
    const binding = this.bindings.get(backendId);
    binding?.disposeDataListener();
    binding?.disposeContainerListener();
    this.bindings.delete(backendId);
    this.backends.delete(backendId);
    if (dispose) backend.dispose();
    this.rebuildCapabilities();
    this.rebuildSnapshot();
    this.notifyDataChanged();
    return backend;
  }

  getBackend(backendId: string): ContainerlabBackend | undefined {
    return this.backends.get(backendId);
  }

  getDefaultBackend(): ContainerlabBackend | undefined {
    return this.backends.get("local") ?? this.backends.values().next().value;
  }

  listBackends(): ContainerlabBackend[] {
    return [...this.backends.values()];
  }

  async initialize(): Promise<BackendInitializationResult> {
    const results = await Promise.all(
      this.listBackends().map(async (backend) => backend.initialize())
    );
    const authenticated = results.some((result) => result.authenticated);
    const session = results.find((result) => result.session !== undefined)?.session;
    const server = results.find((result) => result.server !== undefined)?.server;
    return {
      authenticated,
      ...(session !== undefined ? { session } : {}),
      ...(server !== undefined ? { server } : {}),
      ...(!authenticated && results.length > 0
        ? {
            message: results
              .map((result) => result.message)
              .filter(Boolean)
              .join("; ")
          }
        : {})
    };
  }

  dispose(): void {
    for (const backendId of this.backends.keys()) this.removeBackend(backendId);
    this.dataListeners.clear();
    this.containerListeners.clear();
  }

  async refreshRuntimeSnapshot(): Promise<RuntimeSnapshot> {
    await Promise.allSettled(
      this.listBackends().map(async (backend) => await backend.refreshRuntimeSnapshot())
    );
    this.rebuildSnapshot();
    return this.snapshot;
  }

  getRuntimeSnapshot(): RuntimeSnapshot {
    this.rebuildSnapshot();
    return this.snapshot;
  }

  getInterfaceSnapshot(
    containerShortId: string,
    containerName: string,
    backendId?: string
  ): ClabInterfaceSnapshot[] {
    const backend = this.resolveContainerBackend(containerShortId, containerName, backendId);
    return backend?.getInterfaceSnapshot(containerShortId, containerName) ?? [];
  }

  getInterfaceVersion(containerShortId: string, backendId?: string): number {
    const backend = this.resolveContainerBackend(containerShortId, undefined, backendId);
    return backend?.getInterfaceVersion(containerShortId) ?? 0;
  }

  isPollingMode(): boolean {
    return this.backends.get("local")?.isPollingMode() ?? false;
  }

  resetPollingMode(): void {
    for (const backend of this.backends.values()) backend.resetPollingMode();
  }

  onRuntimeDataChanged(listener: () => void): () => void {
    this.dataListeners.add(listener);
    return () => this.dataListeners.delete(listener);
  }

  onContainerStateChanged(
    listener: (containerShortId: string, newState: string, backendId?: string) => void
  ): () => void {
    this.containerListeners.add(listener);
    return () => this.containerListeners.delete(listener);
  }

  async runLabLifecycle(request: LabLifecycleRequest): Promise<void> {
    const backend = this.backendForLabRef(request.node.labRef);
    if (backend === undefined) {
      throw new Error(`The backend '${request.node.labRef.backendId}' is not connected.`);
    }
    await backend.runLabLifecycle(request);
  }

  cancelActiveOperation(): boolean {
    let cancelled = false;
    for (const backend of this.backends.values()) {
      cancelled = backend.cancelActiveOperation() || cancelled;
    }
    return cancelled;
  }

  async isAuthenticated(): Promise<boolean> {
    const apiBackends = this.listBackends().filter((backend) => backend.kind === "api");
    if (apiBackends.length === 0) return true;
    const results = await Promise.all(
      apiBackends.map(async (backend) => backend.isAuthenticated())
    );
    return results.some(Boolean);
  }

  getAuthenticatedSession(): AuthenticatedBackendSession | undefined {
    return this.listBackends()
      .find((backend) => backend.kind === "api")
      ?.getAuthenticatedSession();
  }

  getServerCapabilities(): BackendServerCapabilities | undefined {
    return this.listBackends()
      .find((backend) => backend.kind === "api")
      ?.getServerCapabilities();
  }

  resolveLabRef(labName: string, runtimePath?: string): LabRef {
    const backend = this.getDefaultBackend();
    if (backend === undefined)
      return {
        backendId: "local",
        labName,
        ...(runtimePath !== undefined && runtimePath.length > 0 ? { localPath: runtimePath } : {})
      };
    return backend.resolveLabRef(labName, runtimePath);
  }

  async rememberLabSource(labName: string, localPath: string): Promise<void> {
    await this.getDefaultBackend()?.rememberLabSource(labName, localPath);
  }

  private backendForLabRef(ref: LabRef): ContainerlabBackend | undefined {
    return this.backends.get(ref.backendId);
  }

  private resolveContainerBackend(
    containerShortId: string,
    containerName?: string,
    requestedBackendId?: string
  ): ContainerlabBackend | undefined {
    if (requestedBackendId !== undefined) return this.backends.get(requestedBackendId);
    for (const backend of this.backends.values()) {
      const containers = Object.values(backend.getRuntimeSnapshot().labs).flat();
      if (
        containers.some(
          (container) =>
            container.ShortID === containerShortId ||
            container.ID === containerShortId ||
            (containerName !== undefined && container.Names.includes(containerName))
        )
      ) {
        return backend;
      }
    }
    return this.getDefaultBackend();
  }

  private rebuildCapabilities(): void {
    this.capabilitySet.clear();
    for (const backend of this.backends.values()) {
      for (const capability of backend.capabilities) this.capabilitySet.add(capability);
    }
  }

  private rebuildSnapshot(): void {
    const labs: Record<string, ClabDetailedJSON[]> = {};
    for (const backend of this.backends.values()) {
      for (const [backendLabKey, containers] of Object.entries(backend.getRuntimeSnapshot().labs)) {
        labs[snapshotKey(backend.id, backendLabKey)] = containersForBackend(backend, containers);
      }
    }
    this.snapshot = { labs };
  }

  private notifyDataChanged(): void {
    for (const listener of this.dataListeners) listener();
  }
}
