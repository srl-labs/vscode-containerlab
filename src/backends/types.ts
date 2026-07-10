import type { ClabLabTreeNode, ClabDetailedJSON, LabRef } from "../treeView/common";
import type { ClabInterfaceSnapshot } from "../types/containerlab";

export type ContainerlabBackendKind = "local" | "api";
export type ContainerlabBackendRole = ContainerlabBackendKind | "workspace";

export type BackendCapability =
  | "runtime-inspect"
  | "lab-lifecycle"
  | "local-runtime"
  | "api-auth"
  | "interface-stats"
  | "runtime-actions"
  | "captures"
  | "runtime-images"
  | "terminal-sessions"
  | "topology-files"
  | "workspace-files"
  | "netem";

export interface AuthenticatedBackendSession {
  username: string;
  roles: string[];
  issuedAt?: string;
  expiresAt?: string;
}

export interface BackendServerCapabilities {
  apiVersion: string;
  serverVersion: string;
  runtime: string;
  features: ReadonlySet<string>;
  legacy: boolean;
}

export interface BackendInitializationResult {
  authenticated: boolean;
  message?: string;
  authenticationPrompted?: boolean;
  session?: AuthenticatedBackendSession;
  server?: BackendServerCapabilities;
}

export interface LabLifecycleCallbacks {
  onSuccess?: () => Promise<void>;
  onFailure?: (error: unknown) => Promise<void>;
  onOutputLine?: (line: string, stream: "stdout" | "stderr") => void;
}

export interface LabLifecycleRequest extends LabLifecycleCallbacks {
  action: "deploy" | "destroy" | "redeploy" | "apply" | "start" | "stop" | "restart";
  cleanup: boolean;
  node: ClabLabTreeNode;
}

export interface RuntimeSnapshot {
  labs: Record<string, ClabDetailedJSON[]>;
}

export interface ContainerlabBackend {
  readonly id: string;
  readonly kind: ContainerlabBackendRole;
  readonly capabilities: ReadonlySet<BackendCapability>;

  initialize(): Promise<BackendInitializationResult>;
  dispose(): void;

  refreshRuntimeSnapshot(): Promise<RuntimeSnapshot>;
  getRuntimeSnapshot(): RuntimeSnapshot;
  getInterfaceSnapshot(
    containerShortId: string,
    containerName: string,
    backendId?: string
  ): ClabInterfaceSnapshot[];
  getInterfaceVersion(containerShortId: string, backendId?: string): number;
  isPollingMode(): boolean;
  resetPollingMode(): void;
  onRuntimeDataChanged(listener: () => void): () => void;
  onContainerStateChanged(
    listener: (containerShortId: string, newState: string, backendId?: string) => void
  ): () => void;

  runLabLifecycle(request: LabLifecycleRequest): Promise<void>;
  cancelActiveOperation(): boolean;

  isAuthenticated(): Promise<boolean>;
  getAuthenticatedSession(): AuthenticatedBackendSession | undefined;
  getServerCapabilities(): BackendServerCapabilities | undefined;
  resolveLabRef(labName: string, runtimePath?: string): LabRef;
  resolveLocalSourceRef?(localPath: string, expectedLabName?: string): LabRef | undefined;
  rememberLabSource(labName: string, localPath: string): Promise<void>;
  ownsLocalSource?(localPath: string, expectedLabName?: string): boolean;
  signIn?(username: string, password: string, sessionDuration?: string): Promise<void>;
  signOut?(): Promise<void>;
}

export function backendHasCapability(
  backend: ContainerlabBackend,
  capability: BackendCapability
): boolean {
  return backend.capabilities.has(capability);
}
