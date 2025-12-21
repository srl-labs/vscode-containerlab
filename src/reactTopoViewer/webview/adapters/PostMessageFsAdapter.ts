/**
 * PostMessageFsAdapter - FileSystemAdapter implementation for VS Code webview
 *
 * Uses postMessage to communicate with the extension for file operations.
 * The extension handles the actual filesystem access.
 */
import type { FileSystemAdapter } from '../../shared/io/types';
import { subscribeToWebviewMessages, type TypedMessageEvent } from '../utils/webviewMessageBus';

import { createPathMethods } from './pathMethods';

interface FsResponseMessage {
  type: 'fs:response';
  requestId: string;
  result?: unknown;
  error?: string;
}

declare global {
  interface Window {
    vscode?: { postMessage(data: unknown): void };
  }
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

/**
 * FileSystemAdapter that bridges to VS Code extension via postMessage.
 * All file operations are proxied to the extension which has actual fs access.
 */
export class PostMessageFsAdapter implements FileSystemAdapter {
  private pending = new Map<string, PendingRequest>();
  private unsubscribe: (() => void) | null = null;

  // Path utility methods
  dirname: (filePath: string) => string;
  basename: (filePath: string) => string;
  join: (...segments: string[]) => string;

  constructor() {
    // Initialize path utility methods
    const pathMethods = createPathMethods();
    this.dirname = pathMethods.dirname;
    this.basename = pathMethods.basename;
    this.join = pathMethods.join;
    this.unsubscribe = subscribeToWebviewMessages(
      this.handleResponse.bind(this),
      (e) => e.data?.type === 'fs:response'
    );
  }

  /**
   * Clean up message listener when adapter is no longer needed
   */
  dispose(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    // Reject any pending requests
    for (const [, pending] of this.pending) {
      pending.reject(new Error('Adapter disposed'));
    }
    this.pending.clear();
  }

  async readFile(filePath: string): Promise<string> {
    const result = await this.request('fs:read', { path: filePath });
    return result as string;
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    await this.request('fs:write', { path: filePath, content });
  }

  async unlink(filePath: string): Promise<void> {
    await this.request('fs:unlink', { path: filePath });
  }

  async exists(filePath: string): Promise<boolean> {
    const result = await this.request('fs:exists', { path: filePath });
    return result as boolean;
  }

  private request(type: string, payload: Record<string, unknown>): Promise<unknown> {
    const requestId = globalThis.crypto.randomUUID();
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });

      if (!window.vscode) {
        this.pending.delete(requestId);
        reject(new Error('VS Code API not available'));
        return;
      }

      window.vscode.postMessage({ type, requestId, ...payload });

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pending.has(requestId)) {
          this.pending.delete(requestId);
          reject(new Error(`Request ${type} timed out`));
        }
      }, 30000);
    });
  }

  private handleResponse(e: TypedMessageEvent): void {
    const data = e.data as FsResponseMessage | undefined;
    if (!data || data.type !== 'fs:response') return;
    if (!data.requestId) return;

    const pending = this.pending.get(data.requestId);
    if (!pending) return;

    this.pending.delete(data.requestId);

    if (data.error) {
      pending.reject(new Error(data.error));
    } else {
      pending.resolve(data.result);
    }
  }
}
