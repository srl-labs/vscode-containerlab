/**
 * PostMessageFsAdapter - FileSystemAdapter implementation for VS Code webview
 *
 * Uses postMessage to communicate with the extension for file operations.
 * The extension handles the actual filesystem access.
 */
import { FileSystemAdapter } from '../../shared/io/types';
import { subscribeToWebviewMessages } from '../utils/webviewMessageBus';

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

  constructor() {
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

  dirname(filePath: string): string {
    // Handle both Windows and Unix paths
    const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
    if (lastSlash === -1) return '.';
    if (lastSlash === 0) return '/';
    return filePath.substring(0, lastSlash);
  }

  basename(filePath: string): string {
    const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
    return filePath.substring(lastSlash + 1);
  }

  join(...segments: string[]): string {
    // Simple join - the extension will normalize if needed
    return segments.join('/').replace(/\/+/g, '/');
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

  private handleResponse(e: MessageEvent): void {
    const { type, requestId, result, error } = e.data || {};
    if (type !== 'fs:response') return;
    if (!requestId) return;

    const pending = this.pending.get(requestId);
    if (!pending) return;

    this.pending.delete(requestId);

    if (error) {
      pending.reject(new Error(error));
    } else {
      pending.resolve(result);
    }
  }
}
