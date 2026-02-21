/**
 * Split view manager for React TopoViewer.
 * Handles opening/closing YAML files in a split view alongside the webview.
 */

import * as vscode from "vscode";

import { log } from "./logger";

/**
 * Simple sleep utility.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Manages split view functionality for the topology viewer.
 */
export class SplitViewManager {
  private isSplitViewOpen: boolean = false;

  get isOpen(): boolean {
    return this.isSplitViewOpen;
  }

  /**
   * Opens the specified file in a split editor.
   */
  async openTemplateFile(filePath: string, panel?: vscode.WebviewPanel): Promise<void> {
    try {
      const document = await vscode.workspace.openTextDocument(filePath);

      await vscode.window.showTextDocument(document, {
        preview: false,
        viewColumn: vscode.ViewColumn.Beside
      });

      await sleep(100);

      await vscode.commands.executeCommand("vscode.setEditorLayout", {
        orientation: 0,
        groups: [{ size: 0.6 }, { size: 0.4 }]
      });

      this.isSplitViewOpen = true;

      if (panel) {
        panel.reveal();
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Error opening template file: ${error}`);
    }
  }

  /**
   * Toggle the split view with YAML editor.
   */
  async toggleSplitView(
    yamlFilePath: string | undefined,
    panel?: vscode.WebviewPanel
  ): Promise<boolean> {
    try {
      if (yamlFilePath === undefined || yamlFilePath.length === 0) {
        vscode.window.showWarningMessage("No YAML file associated with this topology");
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
   * Closes the split view.
   */
  private async closeSplitView(yamlFilePath: string, panel?: vscode.WebviewPanel): Promise<void> {
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
      await vscode.window.showTextDocument(yamlEditor.document, yamlEditor.viewColumn);
      await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
    }

    await vscode.commands.executeCommand("vscode.setEditorLayout", {
      orientation: 0,
      groups: [{ size: 1 }]
    });

    this.isSplitViewOpen = false;

    if (panel) {
      panel.reveal();
    }
  }
}
