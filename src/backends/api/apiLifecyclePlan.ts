import type { LabLifecycleRequest } from "../types";

export type LocalTopologySyncPlan = "none" | "archive-deploy" | "yaml-sync";

export type ApiTopologySourcePlan =
  | { kind: "managed"; remotePath: string }
  | { kind: "runtime" }
  | { kind: "url"; source: string }
  | { kind: "local"; source: string }
  | { kind: "missing" };

interface ApiTopologySourceRef {
  localPath?: string;
  remotePath?: string;
}

export interface ApiLifecycleMutationFlags {
  cleanup?: true;
  reconfigure?: true;
}

export function isHttpTopologySource(source: string): boolean {
  return /^https?:\/\//iu.test(source);
}

export function apiManagedTopologyPath(remotePath: string | undefined): string | undefined {
  const normalized = remotePath?.trim().replaceAll("\\", "/");
  if (
    !normalized ||
    normalized.startsWith("/") ||
    /^[a-zA-Z]:\//u.test(normalized) ||
    normalized.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    return undefined;
  }
  return normalized;
}

/**
 * Preserve API ownership even when a remote topology has a materialized local
 * editor copy. Any remotePath means the localPath is a cache, not an upload
 * source; relative remote paths identify managed API files while absolute or
 * opaque paths identify a running lab's source document.
 */
export function planApiTopologySource(
  ref: ApiTopologySourceRef,
  fallbackLocalPath: string
): ApiTopologySourcePlan {
  const remotePath = ref.remotePath?.trim();
  if (remotePath) {
    const managedPath = apiManagedTopologyPath(remotePath);
    return managedPath === undefined
      ? { kind: "runtime" }
      : { kind: "managed", remotePath: managedPath };
  }

  const source = ref.localPath?.trim() || fallbackLocalPath.trim();
  if (!source) return { kind: "missing" };
  return isHttpTopologySource(source) ? { kind: "url", source } : { kind: "local", source };
}

export function planLocalTopologySync(
  action: LabLifecycleRequest["action"],
  hasLocalSource: boolean,
  remoteTopologyExists: boolean
): LocalTopologySyncPlan {
  if (!hasLocalSource || (action !== "deploy" && action !== "apply" && action !== "redeploy")) {
    return "none";
  }
  return remoteTopologyExists ? "yaml-sync" : "archive-deploy";
}

/** Map the UI's historical `cleanup` boolean to each API operation's real wire flag. */
export function apiLifecycleMutationFlags(
  action: LabLifecycleRequest["action"],
  cleanup: boolean
): ApiLifecycleMutationFlags {
  if (!cleanup) return {};
  if (action === "deploy") return { reconfigure: true };
  if (action === "destroy" || action === "redeploy") return { cleanup: true };
  return {};
}
