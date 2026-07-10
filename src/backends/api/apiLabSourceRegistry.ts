import * as path from "path";

import type * as vscode from "vscode";
import { apiTopologySourcePathMatches } from "../labIdentity";

const STORAGE_KEY = "containerlab.api.labSourceMappings.v1";

export interface ApiLabSourceMapping {
  backendId: string;
  labName: string;
  localPath: string;
  remotePath?: string;
}

function mappingKey(backendId: string, labName: string): string {
  return `${backendId}\n${labName}`;
}

function isStoredSourceMapping(value: unknown): value is ApiLabSourceMapping {
  if (typeof value !== "object" || value === null) return false;
  return (
    typeof Reflect.get(value, "backendId") === "string" &&
    typeof Reflect.get(value, "labName") === "string" &&
    typeof Reflect.get(value, "localPath") === "string" &&
    (Reflect.get(value, "remotePath") === undefined ||
      typeof Reflect.get(value, "remotePath") === "string")
  );
}

export class ApiLabSourceRegistry {
  private readonly mappings = new Map<string, ApiLabSourceMapping>();

  constructor(
    private readonly state: Pick<vscode.Memento, "get" | "update">,
    private readonly backendId: string
  ) {
    const stored = state.get<unknown[]>(STORAGE_KEY, []);
    for (const entry of stored) {
      if (isStoredSourceMapping(entry)) {
        this.mappings.set(mappingKey(entry.backendId, entry.labName), entry);
      }
    }
  }

  get(labName: string): string | undefined {
    return this.mappings.get(mappingKey(this.backendId, labName))?.localPath;
  }

  getMapping(labName: string): ApiLabSourceMapping | undefined {
    const mapping = this.mappings.get(mappingKey(this.backendId, labName));
    return mapping === undefined ? undefined : { ...mapping };
  }

  resolveRuntimePath(runtimePath: string): ApiLabSourceMapping | undefined {
    for (const mapping of this.mappings.values()) {
      if (
        mapping.backendId === this.backendId &&
        mapping.remotePath !== undefined &&
        apiTopologySourcePathMatches(runtimePath, mapping.labName, mapping.remotePath)
      ) {
        return { ...mapping };
      }
    }
    return undefined;
  }

  resolve(localPath: string, expectedLabName?: string): ApiLabSourceMapping | undefined {
    const normalized = path.resolve(localPath);
    for (const mapping of this.mappings.values()) {
      if (
        mapping.backendId === this.backendId &&
        path.resolve(mapping.localPath) === normalized &&
        (expectedLabName === undefined || mapping.labName === expectedLabName)
      ) {
        return { ...mapping };
      }
    }
    return undefined;
  }

  getRemotePath(localPath: string, expectedLabName?: string): string | undefined {
    return this.resolve(localPath, expectedLabName)?.remotePath;
  }

  matches(localPath: string, expectedLabName?: string): boolean {
    return this.resolve(localPath, expectedLabName) !== undefined;
  }

  async set(labName: string, localPath: string, remotePath?: string): Promise<void> {
    const normalized = path.resolve(localPath);
    await this.store(labName, normalized, remotePath);
  }

  async remember(labName: string, localPath: string): Promise<void> {
    const normalized = path.resolve(localPath);
    const existing = this.mappings.get(mappingKey(this.backendId, labName));
    const retainedRemotePath =
      existing !== undefined && path.resolve(existing.localPath) === normalized
        ? existing.remotePath
        : undefined;
    await this.store(labName, normalized, retainedRemotePath);
  }

  private async store(
    labName: string,
    normalizedLocalPath: string,
    remotePath: string | undefined
  ): Promise<void> {
    this.mappings.set(mappingKey(this.backendId, labName), {
      backendId: this.backendId,
      labName,
      localPath: normalizedLocalPath,
      ...(remotePath === undefined ? {} : { remotePath })
    });
    await this.state.update(STORAGE_KEY, Array.from(this.mappings.values()));
  }

  async remove(labName: string): Promise<string | undefined> {
    const key = mappingKey(this.backendId, labName);
    const existing = this.mappings.get(key);
    if (!existing) return undefined;
    this.mappings.delete(key);
    await this.state.update(STORAGE_KEY, Array.from(this.mappings.values()));
    return existing.localPath;
  }
}
