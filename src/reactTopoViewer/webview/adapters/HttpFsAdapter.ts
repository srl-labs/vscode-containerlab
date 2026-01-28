/**
 * HttpFsAdapter - FileSystemAdapter implementation for dev server
 *
 * Uses HTTP fetch to communicate with the dev server for file operations.
 * Supports session isolation for parallel test execution.
 */
import type { FileSystemAdapter } from "../../shared/io/types";

import { createPathMethods } from "./pathMethods";

/**
 * FileSystemAdapter that uses HTTP to read/write files via the dev server.
 * This enables standalone development and testing without VS Code.
 */
export class HttpFsAdapter implements FileSystemAdapter {
  private baseUrl: string;
  private sessionId: string | null;

  // Path utility methods
  dirname: (filePath: string) => string;
  basename: (filePath: string) => string;
  join: (...segments: string[]) => string;

  /**
   * @param baseUrl - Base URL for the dev server (e.g., '' for same origin)
   * @param sessionId - Optional session ID for test isolation
   */
  constructor(baseUrl: string = "", sessionId?: string | null) {
    this.baseUrl = baseUrl;
    this.sessionId = sessionId ?? null;

    // Initialize path utility methods
    const pathMethods = createPathMethods();
    this.dirname = pathMethods.dirname;
    this.basename = pathMethods.basename;
    this.join = pathMethods.join;
  }

  async readFile(filePath: string): Promise<string> {
    const url = this.buildUrl(filePath);
    const response = await fetch(url);

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`File not found: ${filePath}`);
      }
      throw new Error(`Failed to read ${filePath}: ${response.statusText}`);
    }

    return response.text();
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const url = this.buildUrl(filePath);
    const response = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "text/plain; charset=utf-8" },
      body: content
    });

    if (!response.ok) {
      throw new Error(`Failed to write ${filePath}: ${response.statusText}`);
    }
  }

  async unlink(filePath: string): Promise<void> {
    const url = this.buildUrl(filePath);
    const response = await fetch(url, { method: "DELETE" });

    // Don't throw if file doesn't exist (matches FileSystemAdapter contract)
    if (!response.ok && response.status !== 404) {
      throw new Error(`Failed to delete ${filePath}: ${response.statusText}`);
    }
  }

  async exists(filePath: string): Promise<boolean> {
    const url = this.buildUrl(filePath);
    const response = await fetch(url, { method: "HEAD" });
    return response.ok;
  }

  private buildUrl(filePath: string): string {
    // Encode the file path for use in URL
    const encodedPath = encodeURIComponent(filePath);
    const base = `${this.baseUrl}/file/${encodedPath}`;

    if (this.sessionId) {
      return `${base}?sessionId=${encodeURIComponent(this.sessionId)}`;
    }
    return base;
  }

  /**
   * Subscribe to file change notifications via SSE.
   * Returns an unsubscribe function to close the connection.
   *
   * Works with or without sessionId:
   * - With sessionId: receives session-specific file changes (for tests)
   * - Without sessionId: receives disk file changes (for dev mode)
   *
   * @param callback - Called when a file changes with the file path
   * @returns Unsubscribe function to close the SSE connection
   */
  subscribeToChanges(callback: (path: string) => void): () => void {
    // Build URL with optional sessionId
    let url = `${this.baseUrl}/api/events`;
    if (this.sessionId) {
      url += `?sessionId=${encodeURIComponent(this.sessionId)}`;
    }

    const eventSource = new EventSource(url);

    eventSource.addEventListener("connected", () => {
      // SSE connection established - no action needed
    });

    eventSource.addEventListener("file-changed", (e) => {
      const data = JSON.parse((e as MessageEvent<string>).data) as { path: string };
      callback(data.path);
    });

    eventSource.addEventListener("error", () => {
      console.warn("[HttpFsAdapter] SSE connection error, will retry...");
    });

    // Return unsubscribe function
    return () => {
      eventSource.close();
    };
  }
}
