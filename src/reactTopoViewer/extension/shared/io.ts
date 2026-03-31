import * as fs from "fs";
import * as path from "path";

import type { FileSystemAdapter } from "@srl-labs/clab-ui/session";

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
