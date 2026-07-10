import type { ContainerlabBackend } from "./types";
import { LocalContainerlabBackend } from "./localContainerlabBackend";
import { WorkspaceContainerlabBackend } from "./workspaceBackend";
import { UnavailableBackend } from "./unavailableBackend";
import { labRefMatchesLocalSource } from "./labIdentity";

let activeBackend: ContainerlabBackend | undefined;
const dataListeners = new Set<() => void>();
const containerListeners = new Set<
  (containerShortId: string, newState: string, backendId?: string) => void
>();
let disposeBackendDataListener: (() => void) | undefined;
let disposeBackendContainerListener: (() => void) | undefined;

function bindBackendListeners(backend: ContainerlabBackend): void {
  disposeBackendDataListener?.();
  disposeBackendContainerListener?.();
  disposeBackendDataListener = backend.onRuntimeDataChanged(() => {
    for (const listener of dataListeners) listener();
  });
  disposeBackendContainerListener = backend.onContainerStateChanged(
    (containerShortId, newState, backendId) => {
      for (const listener of containerListeners) listener(containerShortId, newState, backendId);
    }
  );
}

export function setActiveBackend(backend: ContainerlabBackend): void {
  if (activeBackend !== backend) {
    activeBackend?.dispose();
  }
  activeBackend = backend;
  bindBackendListeners(backend);
}

export function getActiveBackend(): ContainerlabBackend {
  activeBackend ??= new LocalContainerlabBackend();
  return activeBackend;
}

export function createWorkspaceBackend(): WorkspaceContainerlabBackend {
  return new WorkspaceContainerlabBackend();
}

export function getWorkspaceBackend(): WorkspaceContainerlabBackend | undefined {
  return activeBackend instanceof WorkspaceContainerlabBackend ? activeBackend : undefined;
}

export function registerBackend(backend: ContainerlabBackend): void {
  const workspace = getWorkspaceBackend();
  if (workspace === undefined) {
    throw new Error("The workspace backend router has not been initialized.");
  }
  workspace.addBackend(backend);
}

export function unregisterBackend(
  backendId: string,
  dispose = true
): ContainerlabBackend | undefined {
  return getWorkspaceBackend()?.removeBackend(backendId, dispose);
}

export function getBackendById(backendId: string): ContainerlabBackend | undefined {
  const workspace = getWorkspaceBackend();
  if (workspace !== undefined) {
    return backendId === workspace.id ? workspace : workspace.getBackend(backendId);
  }
  return activeBackend?.id === backendId ? activeBackend : undefined;
}

export function getDefaultBackend(): ContainerlabBackend {
  return getWorkspaceBackend()?.getDefaultBackend() ?? getActiveBackend();
}

export function listConnectedBackends(): ContainerlabBackend[] {
  return getWorkspaceBackend()?.listBackends() ?? [getActiveBackend()];
}

function backendOrUnavailable(backendId: string): ContainerlabBackend {
  return (
    getBackendById(backendId) ??
    new UnavailableBackend(
      backendId === "local" ? "local" : "api",
      `The backend '${backendId}' is not connected.`
    )
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function getBackendForResource(resource: unknown): ContainerlabBackend {
  if (isRecord(resource)) {
    const labRef = resource.labRef;
    if (isRecord(labRef)) {
      const backendId = labRef.backendId;
      if (typeof backendId === "string") return backendOrUnavailable(backendId);
    }
    const backendId = resource.backendId;
    if (typeof backendId === "string") return backendOrUnavailable(backendId);
  }
  return getDefaultBackend();
}

export function getBackendForLocalSource(
  localPath: string,
  expectedLabName?: string
): ContainerlabBackend {
  const workspace = getWorkspaceBackend();
  if (workspace === undefined) return getDefaultBackend();

  for (const backend of workspace.listBackends()) {
    if (backend.ownsLocalSource?.(localPath, expectedLabName) === true) return backend;
  }

  for (const backend of workspace.listBackends()) {
    for (const containers of Object.values(backend.getRuntimeSnapshot().labs)) {
      if (containers.length === 0) continue;
      const first = containers[0];
      const labName = first.Labels.containerlab ?? "";
      const runtimePath = first.Labels["clab-topo-file"];
      const ref = backend.resolveLabRef(labName, runtimePath);
      if (labRefMatchesLocalSource(ref, backend.id, localPath, expectedLabName)) return backend;
    }
  }

  return getDefaultBackend();
}

export function resetActiveBackendForTests(): void {
  activeBackend?.dispose();
  activeBackend = undefined;
  disposeBackendDataListener?.();
  disposeBackendContainerListener?.();
  disposeBackendDataListener = undefined;
  disposeBackendContainerListener = undefined;
  dataListeners.clear();
  containerListeners.clear();
}

export function onActiveBackendDataChanged(listener: () => void): () => void {
  dataListeners.add(listener);
  return () => dataListeners.delete(listener);
}

export function onActiveBackendContainerStateChanged(
  listener: (containerShortId: string, newState: string, backendId?: string) => void
): () => void {
  containerListeners.add(listener);
  return () => containerListeners.delete(listener);
}

export function cancelActiveBackendOperation(): boolean {
  return getActiveBackend().cancelActiveOperation();
}
