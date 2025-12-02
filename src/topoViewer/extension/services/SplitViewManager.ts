import * as vscode from 'vscode';
import { log } from '../../webview/platform/logging/logger';
import { sleep } from '../../shared/utilities/AsyncUtils';

/**
 * Manages split view functionality for the topology editor.
 * Handles opening/closing YAML files in a split view alongside the webview.
 */
export class SplitViewManager {
  private isSplitViewOpen: boolean = false;

  /**
   * Returns whether the split view is currently open
   */
  get isOpen(): boolean {
    return this.isSplitViewOpen;
  }

  /**
   * Opens the specified file in a split editor.
   *
   * @param filePath - The absolute path to the file.
   * @param panel - The current webview panel to return focus to
   */
  async openTemplateFile(filePath: string, panel?: vscode.WebviewPanel): Promise<void> {
    try {
      const document = await vscode.workspace.openTextDocument(filePath);

      // Open the YAML file in a split view
      await vscode.window.showTextDocument(document, {
        preview: false,
        viewColumn: vscode.ViewColumn.Beside,
      });

      // Wait for the editor to be fully rendered
      await sleep(100);

      // Set a custom layout with the topology editor taking 60% and YAML taking 40%
      await vscode.commands.executeCommand('vscode.setEditorLayout', {
        orientation: 0,  // 0 = horizontal (left-right split)
        groups: [
          { size: 0.6 },  // Topology editor: 60%
          { size: 0.4 }   // YAML editor: 40%
        ]
      });

      // Mark split view as open
      this.isSplitViewOpen = true;

      // Return focus to the webview panel if it exists
      if (panel) {
        panel.reveal();
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Error opening template file: ${error}`);
    }
  }

  /**
   * Toggle the split view with YAML editor
   */
  async toggleSplitView(
    yamlFilePath: string | undefined,
    panel?: vscode.WebviewPanel
  ): Promise<boolean> {
    try {
      if (!yamlFilePath) {
        vscode.window.showWarningMessage('No YAML file associated with this topology');
        return this.isSplitViewOpen;
      }

      if (this.isSplitViewOpen) {
        await this.closeSplitView(yamlFilePath, panel);
      } else {
        await this.openTemplateFile(yamlFilePath, panel);
      }

      return this.isSplitViewOpen;
    } catch (error) {
      vscode.window.showErrorMessage(`Error toggling split view: ${error}`);
      log.error(`Error toggling split view: ${error}`);
      return this.isSplitViewOpen;
    }
  }

  /**
   * Closes the split view
   */
  private async closeSplitView(
    yamlFilePath: string,
    panel?: vscode.WebviewPanel
  ): Promise<void> {
    // Find the text editor showing the YAML file
    const yamlUri = vscode.Uri.file(yamlFilePath);
    const editors = vscode.window.visibleTextEditors;
    let yamlEditor: vscode.TextEditor | undefined;

    for (const editor of editors) {
      if (editor.document.uri.fsPath === yamlUri.fsPath) {
        yamlEditor = editor;
        break;
      }
    }

    if (yamlEditor) {
      // Make the YAML editor active, then close it
      await vscode.window.showTextDocument(yamlEditor.document, yamlEditor.viewColumn);
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    }

    // Reset to single column layout
    await vscode.commands.executeCommand('vscode.setEditorLayout', {
      orientation: 0,
      groups: [{ size: 1 }]
    });

    this.isSplitViewOpen = false;

    // Ensure webview has focus
    if (panel) {
      panel.reveal();
    }
  }

  /**
   * Reset the split view state (e.g., when panel is disposed)
   */
  reset(): void {
    this.isSplitViewOpen = false;
  }
}

// Export a singleton instance
export const splitViewManager = new SplitViewManager();
