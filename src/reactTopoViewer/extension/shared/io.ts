import * as fs from "fs";
import * as path from "path";

import type { FileSystemAdapter } from "@srl-labs/clab-ui/session";
import type { ApiContainerlabBackend } from "../../../backends/api/apiContainerlabBackend";

function isErrnoException(value: unknown): value is NodeJS.ErrnoException {
  return value instanceof Error && "code" in value;
}

export class NodeFsAdapter implements FileSystemAdapter {
  async readFile(filePath: string): Promise<string> {
    return fs.promises.readFile(filePath, "utf8");
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    await fs.promises.writeFile(filePath, content, "utf8");
  }

  async unlink(filePath: string): Promise<void> {
    try {
      await fs.promises.unlink(filePath);
    } catch (err) {
      if (!isErrnoException(err) || err.code !== "ENOENT") {
        throw err;
      }
    }
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    await fs.promises.rename(oldPath, newPath);
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await fs.promises.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  dirname(filePath: string): string {
    return path.dirname(filePath);
  }

  basename(filePath: string): string {
    return path.basename(filePath);
  }

  join(...segments: string[]): string {
    return path.join(...segments);
  }
}

export const nodeFsAdapter = new NodeFsAdapter();

export class ApiSynchronizedFsAdapter implements FileSystemAdapter {
  private readonly annotationsPath: string;

  constructor(
    private readonly delegate: FileSystemAdapter,
    private readonly backend: ApiContainerlabBackend,
    private readonly labName: string,
    private readonly yamlPath: string
  ) {
    this.annotationsPath = `${yamlPath}.annotations.json`;
  }

  readFile(filePath: string): Promise<string> {
    return this.delegate.readFile(filePath);
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    await this.delegate.writeFile(filePath, content);
    if (filePath === this.yamlPath) {
      await this.backend.writeMaterializedTopologyDocument(
        this.labName,
        this.yamlPath,
        "yaml",
        content
      );
    } else if (filePath === this.annotationsPath) {
      await this.backend.writeMaterializedTopologyDocument(
        this.labName,
        this.yamlPath,
        "annotations",
        content
      );
    }
  }

  async unlink(filePath: string): Promise<void> {
    await this.delegate.unlink(filePath);
    if (filePath === this.annotationsPath) {
      await this.backend.writeMaterializedTopologyDocument(
        this.labName,
        this.yamlPath,
        "annotations",
        "{}"
      );
    }
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    await this.delegate.rename(oldPath, newPath);
    if (newPath === this.yamlPath || newPath === this.annotationsPath) {
      await this.writeFile(newPath, await this.delegate.readFile(newPath));
    }
  }

  exists(filePath: string): Promise<boolean> {
    return this.delegate.exists(filePath);
  }

  dirname(filePath: string): string {
    return this.delegate.dirname(filePath);
  }

  basename(filePath: string): string {
    return this.delegate.basename(filePath);
  }

  join(...segments: string[]): string {
    return this.delegate.join(...segments);
  }
}
