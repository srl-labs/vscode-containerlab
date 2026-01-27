/**
 * TransactionalFileSystemAdapter
 *
 * Buffers writes/deletes in memory and commits them atomically (best-effort)
 * using temp files + rename. This allows multi-file updates (YAML + annotations)
 * to behave as a single transaction from the host's perspective.
 */

import { randomUUID } from "crypto";

import type { FileSystemAdapter } from "./types";

type PendingEntry = { path: string; content: string | null };

export class TransactionalFileSystemAdapter implements FileSystemAdapter {
  private base: FileSystemAdapter;
  private inTransaction = false;
  private pending = new Map<string, string | null>();

  constructor(base: FileSystemAdapter) {
    this.base = base;
  }

  beginTransaction(): void {
    if (this.inTransaction) return;
    this.inTransaction = true;
  }

  async commitTransaction(): Promise<void> {
    if (!this.inTransaction) return;
    const entries: PendingEntry[] = Array.from(this.pending.entries()).map(([path, content]) => ({
      path,
      content
    }));
    this.pending.clear();
    this.inTransaction = false;
    if (entries.length === 0) return;
    await this.commitEntries(entries);
  }

  rollbackTransaction(): void {
    this.pending.clear();
    this.inTransaction = false;
  }

  isInTransaction(): boolean {
    return this.inTransaction;
  }

  // ---------------------------------------------------------------------------
  // FileSystemAdapter implementation
  // ---------------------------------------------------------------------------

  async readFile(filePath: string): Promise<string> {
    if (this.inTransaction && this.pending.has(filePath)) {
      const value = this.pending.get(filePath);
      if (value === null) {
        throw new Error(`ENOENT: no such file ${filePath}`);
      }
      if (value === undefined) {
        throw new Error(`Missing pending entry for ${filePath}`);
      }
      return value;
    }
    return this.base.readFile(filePath);
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    if (this.inTransaction) {
      this.pending.set(filePath, content);
      return;
    }
    await this.base.writeFile(filePath, content);
  }

  async unlink(filePath: string): Promise<void> {
    if (this.inTransaction) {
      this.pending.set(filePath, null);
      return;
    }
    await this.base.unlink(filePath);
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    if (this.inTransaction) {
      const content = await this.readFile(oldPath);
      this.pending.set(newPath, content);
      this.pending.set(oldPath, null);
      return;
    }
    await this.base.rename(oldPath, newPath);
  }

  async exists(filePath: string): Promise<boolean> {
    if (this.inTransaction && this.pending.has(filePath)) {
      return this.pending.get(filePath) !== null;
    }
    return this.base.exists(filePath);
  }

  dirname(filePath: string): string {
    return this.base.dirname(filePath);
  }

  basename(filePath: string): string {
    return this.base.basename(filePath);
  }

  join(...segments: string[]): string {
    return this.base.join(...segments);
  }

  // ---------------------------------------------------------------------------
  // Commit logic
  // ---------------------------------------------------------------------------

  private buildTempPath(dir: string, base: string, prefix: "tmp" | "bak"): string {
    return this.base.join(dir, `.${prefix}-${randomUUID()}-${base}`);
  }

  private async writeTempFiles(entries: PendingEntry[]): Promise<Map<string, string>> {
    const tempFiles = new Map<string, string>();
    for (const entry of entries) {
      if (entry.content === null) continue;
      const dir = this.base.dirname(entry.path);
      const base = this.base.basename(entry.path);
      const tempPath = this.buildTempPath(dir, base, "tmp");
      await this.base.writeFile(tempPath, entry.content);
      tempFiles.set(entry.path, tempPath);
    }
    return tempFiles;
  }

  private async createBackups(entries: PendingEntry[]): Promise<Map<string, string>> {
    const backups = new Map<string, string>();
    for (const entry of entries) {
      const exists = await this.base.exists(entry.path);
      if (!exists) continue;
      const dir = this.base.dirname(entry.path);
      const base = this.base.basename(entry.path);
      const backupPath = this.buildTempPath(dir, base, "bak");
      await this.base.rename(entry.path, backupPath);
      backups.set(entry.path, backupPath);
    }
    return backups;
  }

  private async applyWrites(
    entries: PendingEntry[],
    tempFiles: Map<string, string>
  ): Promise<void> {
    for (const entry of entries) {
      if (entry.content === null) continue;
      const tempPath = tempFiles.get(entry.path);
      if (!tempPath) {
        throw new Error(`Missing temp file for ${entry.path}`);
      }
      await this.base.rename(tempPath, entry.path);
    }
  }

  private async cleanupBackups(backups: Map<string, string>): Promise<void> {
    for (const backupPath of backups.values()) {
      await this.base.unlink(backupPath);
    }
  }

  private async restoreBackups(backups: Map<string, string>): Promise<void> {
    for (const [targetPath, backupPath] of backups) {
      try {
        const stillMissing = !(await this.base.exists(targetPath));
        if (stillMissing) {
          await this.base.rename(backupPath, targetPath);
        }
      } catch {
        // ignore rollback errors
      }
    }
  }

  private async cleanupTempFiles(tempFiles: Map<string, string>): Promise<void> {
    for (const tempPath of tempFiles.values()) {
      try {
        await this.base.unlink(tempPath);
      } catch {
        // ignore cleanup errors
      }
    }
  }

  private async commitEntries(entries: PendingEntry[]): Promise<void> {
    if (entries.length === 0) return;

    let tempFiles = new Map<string, string>();
    let backups = new Map<string, string>();

    try {
      // 1) Write temp files for all writes.
      tempFiles = await this.writeTempFiles(entries);

      // 2) Move existing targets to backups.
      backups = await this.createBackups(entries);

      // 3) Apply writes (rename temp -> target). Deletes are handled by backup cleanup.
      await this.applyWrites(entries, tempFiles);

      // 4) Clean up backups (delete original files that were replaced or deleted).
      await this.cleanupBackups(backups);
    } catch (err) {
      // Best-effort rollback: restore backups and clean temp files.
      await this.restoreBackups(backups);
      await this.cleanupTempFiles(tempFiles);
      throw err;
    }
  }
}
