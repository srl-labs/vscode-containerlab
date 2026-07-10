import * as path from "path";

import type { LabRef } from "../treeView/common";

function normalizedPath(value: string): string {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function normalizedApiPath(value: string): string {
  return value.trim().replaceAll("\\", "/").replace(/^\.\//u, "");
}

export function apiTopologySourcePathMatches(
  runtimePath: string | undefined,
  sourceLabName: string,
  sourcePath: string
): boolean {
  if (runtimePath === undefined || runtimePath.trim().length === 0) return false;
  const normalizedRuntimePath = normalizedApiPath(runtimePath);
  const normalizedSourcePath = normalizedApiPath(`${sourceLabName}/${sourcePath}`);
  return (
    normalizedRuntimePath === normalizedSourcePath ||
    normalizedRuntimePath.endsWith(`/${normalizedSourcePath}`)
  );
}

export function labIdentityKey(ref: LabRef): string {
  if (ref.backendId === "local" && ref.localPath) {
    return `${ref.backendId}\n${normalizedPath(ref.localPath)}`;
  }
  return `${ref.backendId}\n${ref.labName ?? ""}`;
}

export function apiLabFavoriteKey(ref: LabRef): string | undefined {
  if (ref.backendId === "local") return undefined;
  const labName = (ref.sourceLabName ?? ref.labName)?.trim();
  const normalizedRemotePath = (ref.sourcePath ?? ref.remotePath)?.trim().replaceAll("\\", "/");
  let resource = labName || normalizedRemotePath;
  if (labName && normalizedRemotePath) {
    const baseName = path.posix.basename(normalizedRemotePath);
    const topologyName = baseName.replace(/\.clab\.(?:yml|yaml)$/iu, "");
    const absolute =
      normalizedRemotePath.startsWith("/") || /^[a-zA-Z]:\//u.test(normalizedRemotePath);
    if (!absolute) {
      resource = topologyName === labName ? labName : `${labName}/${normalizedRemotePath}`;
    } else {
      const parentName = path.posix.basename(path.posix.dirname(normalizedRemotePath));
      resource =
        parentName === labName || parentName.startsWith(".")
          ? labName
          : `${parentName}/${baseName}`;
    }
  }
  return resource ? `${ref.backendId}\n${resource}` : undefined;
}

/**
 * Match a local editor source to a running lab without ever comparing a remote
 * server path to the client filesystem.
 */
export function labRefMatchesLocalSource(
  ref: LabRef,
  activeBackendId: string,
  localPath: string,
  expectedLabName?: string
): boolean {
  if (ref.backendId !== activeBackendId || !ref.localPath) return false;
  const sourceLabName = ref.sourceLabName ?? ref.labName;
  if (ref.backendId !== "local" && expectedLabName && sourceLabName !== expectedLabName)
    return false;
  return normalizedPath(ref.localPath) === normalizedPath(localPath);
}
