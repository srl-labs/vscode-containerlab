/**
 * SessionFsAdapter - Session-aware file system adapter for dev server
 *
 * Implements FileSystemAdapter using in-memory storage with session isolation.
 * This enables Playwright tests to run in parallel without file conflicts.
 *
 * Storage model:
 * - YAML files stored in session Map<relativePath, content>
 * - Annotations stored in session Map<relativeYamlPath, content | null>
 * - Falls back to disk for files not yet in session
 */

import * as fs from "fs";
import * as path from "path";
import { FileSystemAdapter } from "../../src/reactTopoViewer/shared/io/types";

/** Session storage maps */
export interface SessionMaps {
  yamlFiles: Map<string, Map<string, string>>;
  annotationFiles: Map<string, Map<string, string | null>>;
}

/**
 * Session-aware file system adapter
 *
 * Reads/writes go to in-memory session storage when a sessionId is provided.
 * Falls back to disk for files not in session or when no session exists.
 */
export class SessionFsAdapter implements FileSystemAdapter {
  private yamlStorage: Map<string, string>;
  private annotationsStorage: Map<string, string | null>;
  private diskBasePath: string;
  private sessionId: string;

  constructor(sessionId: string, sessionMaps: SessionMaps, diskBasePath: string) {
    this.sessionId = sessionId;
    this.diskBasePath = diskBasePath;

    // Get or create session storage
    if (!sessionMaps.yamlFiles.has(sessionId)) {
      sessionMaps.yamlFiles.set(sessionId, new Map());
    }
    if (!sessionMaps.annotationFiles.has(sessionId)) {
      sessionMaps.annotationFiles.set(sessionId, new Map());
    }

    this.yamlStorage = sessionMaps.yamlFiles.get(sessionId)!;
    this.annotationsStorage = sessionMaps.annotationFiles.get(sessionId)!;
  }

  /**
   * Normalize separators for stable map keys
   */
  private toPosixPath(pathValue: string): string {
    return pathValue.replace(/\\/g, "/");
  }

  private isPathInsideBase(targetPath: string): boolean {
    const relative = path.relative(this.diskBasePath, targetPath);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  }

  private resolveDiskPath(filePath: string): string {
    const candidate = path.isAbsolute(filePath)
      ? path.resolve(filePath)
      : path.resolve(this.diskBasePath, filePath);
    if (this.isPathInsideBase(candidate)) {
      return candidate;
    }
    return path.join(this.diskBasePath, path.basename(filePath));
  }

  /**
   * Get relative path key for session storage.
   */
  private getStorageKey(filePath: string): string {
    const diskPath = this.resolveDiskPath(filePath);
    const relative = path.relative(this.diskBasePath, diskPath);
    return this.toPosixPath(relative);
  }

  /**
   * Check if path is an annotations file
   */
  private isAnnotationsFile(filePath: string): boolean {
    return filePath.endsWith(".annotations.json");
  }

  /**
   * Get YAML storage key from annotations path
   */
  private getYamlStorageKey(annotationsPath: string): string {
    const annotationsKey = this.getStorageKey(annotationsPath);
    return annotationsKey.replace(/\.annotations\.json$/, "");
  }

  async readFile(filePath: string): Promise<string> {
    const storageKey = this.getStorageKey(filePath);
    const diskPath = this.resolveDiskPath(filePath);
    const isAnnotation = this.isAnnotationsFile(filePath);

    if (isAnnotation) {
      const yamlKey = this.getYamlStorageKey(filePath);

      // Check session cache
      if (this.annotationsStorage.has(yamlKey)) {
        const content = this.annotationsStorage.get(yamlKey);
        if (content === null || content === undefined) {
          throw new Error(`ENOENT: no such file ${filePath}`);
        }
        return content;
      }

      // Try to load from disk into session
      try {
        const content = await fs.promises.readFile(diskPath, "utf8");
        this.annotationsStorage.set(yamlKey, content);
        return content;
      } catch {
        this.annotationsStorage.set(yamlKey, null);
        throw new Error(`ENOENT: no such file ${filePath}`);
      }
    } else {
      // YAML file
      if (this.yamlStorage.has(storageKey)) {
        return this.yamlStorage.get(storageKey)!;
      }

      // Try to load from disk into session
      try {
        const content = await fs.promises.readFile(diskPath, "utf8");
        this.yamlStorage.set(storageKey, content);
        return content;
      } catch {
        throw new Error(`ENOENT: no such file ${filePath}`);
      }
    }
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const storageKey = this.getStorageKey(filePath);
    const isAnnotation = this.isAnnotationsFile(filePath);

    if (isAnnotation) {
      const yamlKey = this.getYamlStorageKey(filePath);
      this.annotationsStorage.set(yamlKey, content);
      console.log(`[SessionFs] Session ${this.sessionId}: Wrote annotations: ${yamlKey}`);
    } else {
      this.yamlStorage.set(storageKey, content);
      console.log(`[SessionFs] Session ${this.sessionId}: Wrote YAML: ${storageKey}`);
    }
  }

  async unlink(filePath: string): Promise<void> {
    const storageKey = this.getStorageKey(filePath);
    const isAnnotation = this.isAnnotationsFile(filePath);

    if (isAnnotation) {
      const yamlKey = this.getYamlStorageKey(filePath);
      this.annotationsStorage.set(yamlKey, null); // Mark as deleted
      console.log(`[SessionFs] Session ${this.sessionId}: Deleted annotations: ${yamlKey}`);
    } else {
      this.yamlStorage.delete(storageKey);
      console.log(`[SessionFs] Session ${this.sessionId}: Deleted YAML: ${storageKey}`);
    }
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    const oldIsAnnotation = this.isAnnotationsFile(oldPath);
    const newIsAnnotation = this.isAnnotationsFile(newPath);

    if (oldIsAnnotation !== newIsAnnotation) {
      throw new Error(`Cannot rename between different file types: ${oldPath} -> ${newPath}`);
    }

    if (oldIsAnnotation) {
      const oldKey = this.getYamlStorageKey(oldPath);
      const newKey = this.getYamlStorageKey(newPath);
      if (this.annotationsStorage.has(oldKey)) {
        const content = this.annotationsStorage.get(oldKey);
        this.annotationsStorage.set(newKey, content ?? null);
        this.annotationsStorage.delete(oldKey);
        return;
      }

      // Fall back to disk if not in session
      const diskOld = this.resolveDiskPath(oldPath);
      const diskNew = this.resolveDiskPath(newPath);
      await fs.promises.mkdir(path.dirname(diskNew), { recursive: true });
      await fs.promises.rename(diskOld, diskNew);
      return;
    }

    const oldKey = this.getStorageKey(oldPath);
    const newKey = this.getStorageKey(newPath);
    if (this.yamlStorage.has(oldKey)) {
      const content = this.yamlStorage.get(oldKey)!;
      this.yamlStorage.set(newKey, content);
      this.yamlStorage.delete(oldKey);
      return;
    }

    // Fall back to disk if not in session
    const diskOld = this.resolveDiskPath(oldPath);
    const diskNew = this.resolveDiskPath(newPath);
    await fs.promises.mkdir(path.dirname(diskNew), { recursive: true });
    await fs.promises.rename(diskOld, diskNew);
  }

  async exists(filePath: string): Promise<boolean> {
    const storageKey = this.getStorageKey(filePath);
    const diskPath = this.resolveDiskPath(filePath);
    const isAnnotation = this.isAnnotationsFile(filePath);

    if (isAnnotation) {
      const yamlKey = this.getYamlStorageKey(filePath);

      // Check session cache
      if (this.annotationsStorage.has(yamlKey)) {
        return this.annotationsStorage.get(yamlKey) !== null;
      }

      // Check disk
      try {
        await fs.promises.access(diskPath);
        return true;
      } catch {
        return false;
      }
    } else {
      // YAML file
      if (this.yamlStorage.has(storageKey)) {
        return true;
      }

      // Check disk
      try {
        await fs.promises.access(diskPath);
        return true;
      } catch {
        return false;
      }
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

/**
 * Reset session storage by copying disk files
 */
export async function resetSession(
  sessionId: string,
  sessionMaps: SessionMaps,
  diskBasePath: string
): Promise<void> {
  // Get or create session maps
  if (!sessionMaps.yamlFiles.has(sessionId)) {
    sessionMaps.yamlFiles.set(sessionId, new Map());
  }
  if (!sessionMaps.annotationFiles.has(sessionId)) {
    sessionMaps.annotationFiles.set(sessionId, new Map());
  }

  const yamlMap = sessionMaps.yamlFiles.get(sessionId)!;
  const annotMap = sessionMaps.annotationFiles.get(sessionId)!;

  yamlMap.clear();
  annotMap.clear();

  const toPosixPath = (pathValue: string): string => pathValue.replace(/\\/g, "/");
  const collectYamlFiles = async (currentDir: string): Promise<string[]> => {
    const entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
    const yamlFiles: string[] = [];
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        yamlFiles.push(...(await collectYamlFiles(fullPath)));
        continue;
      }
      if (entry.isFile() && entry.name.endsWith(".clab.yml")) {
        yamlFiles.push(fullPath);
      }
    }
    return yamlFiles;
  };

  // Copy disk files to session
  try {
    const yamlFiles = await collectYamlFiles(diskBasePath);

    for (const yamlPath of yamlFiles) {
      const relativeYamlPath = toPosixPath(path.relative(diskBasePath, yamlPath));
      // Read YAML
      const yamlContent = await fs.promises.readFile(yamlPath, "utf8");
      yamlMap.set(relativeYamlPath, yamlContent);

      // Read annotations if they exist
      const annotPath = `${yamlPath}.annotations.json`;
      try {
        const annotContent = await fs.promises.readFile(annotPath, "utf8");
        annotMap.set(relativeYamlPath, annotContent);
      } catch {
        // No annotations file - that's fine
        annotMap.set(relativeYamlPath, null);
      }
    }
  } catch (err) {
    console.error(`[SessionFs] Failed to reset session ${sessionId}:`, err);
  }

  console.log(`[SessionFs] Reset session: ${sessionId}`);
}

/**
 * Create session maps (shared between all sessions)
 */
export function createSessionMaps(): SessionMaps {
  return {
    yamlFiles: new Map(),
    annotationFiles: new Map()
  };
}
