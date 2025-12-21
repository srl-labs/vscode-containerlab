/**
 * Messaging Service Adapter
 *
 * Adapter for sending messages to VS Code webview
 */

import type * as vscode from 'vscode';

import type { IMessagingService } from '../../../shared/messaging';

export class MessagingServiceAdapter implements IMessagingService {
  constructor(private panel: vscode.WebviewPanel) {}

  postMessage(message: unknown): void {
    this.panel.webview.postMessage(message);
  }

  postPanelAction(action: string, data: Record<string, unknown>): void {
    this.panel.webview.postMessage({
      type: 'panel-action',
      action,
      ...data
    });
  }
}
