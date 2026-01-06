/**
 * SessionFsAdapter - Session-aware file system adapter for dev server
 *
 * Implements FileSystemAdapter using in-memory storage with session isolation.
 * This enables Playwright tests to run in parallel without file conflicts.
 *
 * Storage model:
 * - YAML files stored in session Map<filename, content>
 * - Annotations stored in session Map<yamlFilename, content | null>
 * - Falls back to disk for files not yet in session
 */

import * as fs from 'fs';
import * as path from 'path';
import { FileSystemAdapter } from '../../src/reactTopoViewer/shared/io/types';

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

  constructor(
    sessionId: string,
    sessionMaps: SessionMaps,
    diskBasePath: string
  ) {
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
   * Get filename from full path (for storage key)
   */
  private getStorageKey(filePath: string): string {
    return path.basename(filePath);
  }

  /**
   * Check if path is an annotations file
   */
  private isAnnotationsFile(filePath: string): boolean {
    return filePath.endsWith('.annotations.json');
  }

  /**
   * Get YAML filename from annotations path
   */
  private getYamlFilename(annotationsPath: string): string {
    const filename = path.basename(annotationsPath);
    return filename.replace('.annotations.json', '');
  }

  async readFile(filePath: string): Promise<string> {
    const filename = this.getStorageKey(filePath);
    const isAnnotation = this.isAnnotationsFile(filePath);

    if (isAnnotation) {
      const yamlFilename = this.getYamlFilename(filePath);

      // Check session cache
      if (this.annotationsStorage.has(yamlFilename)) {
        const content = this.annotationsStorage.get(yamlFilename);
        if (content === null) {
          throw new Error(`ENOENT: no such file ${filePath}`);
        }
        return content;
      }

      // Try to load from disk into session
      const diskPath = path.join(this.diskBasePath, filename);
      try {
        const content = await fs.promises.readFile(diskPath, 'utf8');
        this.annotationsStorage.set(yamlFilename, content);
        return content;
      } catch {
        this.annotationsStorage.set(yamlFilename, null);
        throw new Error(`ENOENT: no such file ${filePath}`);
      }
    } else {
      // YAML file
      if (this.yamlStorage.has(filename)) {
        return this.yamlStorage.get(filename)!;
      }

      // Try to load from disk into session
      const diskPath = path.join(this.diskBasePath, filename);
      try {
        const content = await fs.promises.readFile(diskPath, 'utf8');
        this.yamlStorage.set(filename, content);
        return content;
      } catch {
        throw new Error(`ENOENT: no such file ${filePath}`);
      }
    }
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const filename = this.getStorageKey(filePath);
    const isAnnotation = this.isAnnotationsFile(filePath);

    if (isAnnotation) {
      const yamlFilename = this.getYamlFilename(filePath);
      this.annotationsStorage.set(yamlFilename, content);
      console.log(`[SessionFs] Session ${this.sessionId}: Wrote annotations: ${yamlFilename}`);
    } else {
      this.yamlStorage.set(filename, content);
      console.log(`[SessionFs] Session ${this.sessionId}: Wrote YAML: ${filename}`);
    }
  }

  async unlink(filePath: string): Promise<void> {
    const filename = this.getStorageKey(filePath);
    const isAnnotation = this.isAnnotationsFile(filePath);

    if (isAnnotation) {
      const yamlFilename = this.getYamlFilename(filePath);
      this.annotationsStorage.set(yamlFilename, null); // Mark as deleted
      console.log(`[SessionFs] Session ${this.sessionId}: Deleted annotations: ${yamlFilename}`);
    } else {
      this.yamlStorage.delete(filename);
      console.log(`[SessionFs] Session ${this.sessionId}: Deleted YAML: ${filename}`);
    }
  }

  async exists(filePath: string): Promise<boolean> {
    const filename = this.getStorageKey(filePath);
    const isAnnotation = this.isAnnotationsFile(filePath);

    if (isAnnotation) {
      const yamlFilename = this.getYamlFilename(filePath);

      // Check session cache
      if (this.annotationsStorage.has(yamlFilename)) {
        return this.annotationsStorage.get(yamlFilename) !== null;
      }

      // Check disk
      const diskPath = path.join(this.diskBasePath, filename);
      try {
        await fs.promises.access(diskPath);
        return true;
      } catch {
        return false;
      }
    } else {
      // YAML file
      if (this.yamlStorage.has(filename)) {
        return true;
      }

      // Check disk
      const diskPath = path.join(this.diskBasePath, filename);
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

  // Copy disk files to session
  try {
    const files = await fs.promises.readdir(diskBasePath);
    const yamlFiles = files.filter(f => f.endsWith('.clab.yml'));

    for (const filename of yamlFiles) {
      // Read YAML
      const yamlPath = path.join(diskBasePath, filename);
      const yamlContent = await fs.promises.readFile(yamlPath, 'utf8');
      yamlMap.set(filename, yamlContent);

      // Read annotations if they exist
      const annotPath = path.join(diskBasePath, `${filename}.annotations.json`);
      try {
        const annotContent = await fs.promises.readFile(annotPath, 'utf8');
        annotMap.set(filename, annotContent);
      } catch {
        // No annotations file - that's fine
        annotMap.set(filename, null);
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
    annotationFiles: new Map(),
  };
}
