/**
 * Split View Service Adapter
 *
 * Adapter for SplitViewManager
 */

import type * as vscode from 'vscode';

import type { ISplitViewService } from '../../../shared/messaging';
import { splitViewManager } from '../SplitViewManager';

export class SplitViewServiceAdapter implements ISplitViewService {
  constructor(private panel: vscode.WebviewPanel) {}

  async toggle(yamlFilePath: string): Promise<boolean> {
    return splitViewManager.toggleSplitView(yamlFilePath, this.panel);
  }

  updateContent(): void {
    // Split view updates are handled internally by the manager
  }
}
