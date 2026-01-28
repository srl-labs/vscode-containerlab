/**
 * NodeFsAdapter - Node.js file system adapter
 *
 * Implements FileSystemAdapter using Node.js fs.promises.
 * Used by the VS Code extension for direct file operations.
 */

import * as fs from "fs";
import * as path from "path";

import type { FileSystemAdapter } from "./types";

/**
 * File system adapter using Node.js fs.promises
 */
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
      // Ignore ENOENT (file doesn't exist)
      const errWithCode = err as { code?: string };
      if (errWithCode.code !== "ENOENT") {
        throw err;
      }
    }
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

/** Singleton instance for convenience */
export const nodeFsAdapter = new NodeFsAdapter();
