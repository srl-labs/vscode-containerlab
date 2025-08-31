import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { ClabCommand } from "./clabCommand";
import { ClabLabTreeNode } from "../treeView/common";

import { TopoViewer } from "../topoViewer";
import { getSelectedLabNode } from "../helpers/utils";


/**
 * Core routine for generating draw.io graphs.
 */
async function runGraphDrawIO(node: ClabLabTreeNode | undefined, layout: "horizontal" | "vertical") {
  node = await getSelectedLabNode(node);
  if (!node) {
    return;
  }

  const graphCmd = new ClabCommand("graph", node);

  // Figure out the .drawio filename
  if (!node.labPath.absolute) {
    vscode.window.showErrorMessage("No lab path found. Cannot open .drawio file.");
    return;
  }
  const labPath = node.labPath.absolute;
  const drawioPath = labPath.replace(/\.(ya?ml)$/i, ".drawio");
  const drawioUri = vscode.Uri.file(drawioPath);

  // Read the default theme from configuration.
  const config = vscode.workspace.getConfiguration("containerlab");
  const drawioTheme = config.get<string>("drawioDefaultTheme", "nokia_modern");

  // Wait for containerlab to finish generating the .drawio file,
  // passing the theme argument.
    await graphCmd
      .run(["--drawio", "--drawio-args", `--theme ${drawioTheme} --layout ${layout}`])
      .then(() => {
        // Verify the file exists.
        if (!fs.existsSync(drawioPath)) {
          vscode.window.showErrorMessage(
            `Containerlab failed to generate .drawio file for lab: ${node.name}.`
          );
          return;
        }
        vscode.commands.executeCommand("vscode.open", drawioUri);
      });
}

export async function graphDrawIOHorizontal(node?: ClabLabTreeNode) {
  await runGraphDrawIO(node, "horizontal");
}

export async function graphDrawIOVertical(node?: ClabLabTreeNode) {
  await runGraphDrawIO(node, "vertical");
}

/**
 * Graph Lab (draw.io, Interactive) => always run in Terminal
 */
export async function graphDrawIOInteractive(node?: ClabLabTreeNode) {
  node = await getSelectedLabNode(node);
  if (!node) {
    return;
  }

  const graphCmd = new ClabCommand("graph", node, undefined, true, "Containerlab Graph");

  graphCmd.run(["--drawio", "--drawio-args", `"-I"`]);
}



/**
 * Graph Lab (TopoViewer)
 */

let currentTopoViewer: TopoViewer | undefined;
let currentTopoViewerPanel: vscode.WebviewPanel | undefined;
const activeTopoViewers: Set<TopoViewer> = new Set();


export async function graphTopoviewer(node?: ClabLabTreeNode, context?: vscode.ExtensionContext) {
  // Get node if not provided
  node = await getSelectedLabNode(node);

  let labPath: string = '';
  let isViewMode = false;

  // Check if this is a deployed lab (view mode)
  if (node && node.contextValue &&
      (node.contextValue === 'containerlabLabDeployed' ||
       node.contextValue === 'containerlabLabDeployedFavorite')) {
    isViewMode = true;
    // Deployed labs might still have a labPath, but we treat them as view-only
    labPath = node.labPath?.absolute || '';
  } else if (node && node.labPath && node.labPath.absolute) {
    // Undeployed lab with YAML file - edit mode
    labPath = node.labPath.absolute;
    isViewMode = false;
  } else {
    // Try to get from active editor
    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document.uri.fsPath.match(/\.clab\.(yaml|yml)$/)) {
      labPath = editor.document.uri.fsPath;
      isViewMode = false; // Editor mode when opened from file
    } else {
      // No valid source, show error
      vscode.window.showErrorMessage(
        'No lab node or topology file selected'
      );
      return;
    }
  }

  if (!context) {
    vscode.window.showErrorMessage('Extension context not available');
    return;
  }

  // 1) create a new TopoViewer
  const viewer = new TopoViewer(context);

  // 2) store the viewer in the global variable
  setCurrentTopoViewer(viewer);

  try {
    // Use the node's name if available (it's the actual lab name from containerlab inspect)
    // Otherwise derive from the file path (but this may not match the deployed name)
    const labName = node?.name || (labPath ? path.basename(labPath).replace(/\.clab\.(yml|yaml)$/i, '') : 'Unknown Lab');
    await viewer.createWebviewPanel(context, labPath ? vscode.Uri.file(labPath) : vscode.Uri.parse(''), labName, isViewMode);
    currentTopoViewerPanel = (viewer as any).currentPanel;

    if (!currentTopoViewerPanel) {
      return;
    }

    // 5) Set context so reload button can appear
    vscode.commands.executeCommand("setContext", "isTopoviewerActive", true);

    // 6) Track disposal
    currentTopoViewerPanel.onDidDispose(() => {
      setCurrentTopoViewer(undefined);
      vscode.commands.executeCommand("setContext", "isTopoviewerActive", false);
    });

  } catch (error) {
    console.error(error);
  }
}


/**
 * Graph Lab (TopoViewer Reload)
 */
export async function graphTopoviewerReload() {
  // 1) If there's no panel, show an error
  if (!currentTopoViewerPanel) {
    vscode.window.showErrorMessage("No active TopoViewer panel to reload.");
    return;
  }

  // 2) If there's no viewer, also show an error
  if (!currentTopoViewer) {
    vscode.window.showErrorMessage("No active TopoViewer instance.");
    return;
  }

  // 3) Now call updatePanelHtml on the existing panel (don't bypass mode switch check for manual reload)
  await currentTopoViewer.updatePanelHtml(currentTopoViewerPanel);
}

/**
 * Get the current TopoViewer instance
 */
export function getCurrentTopoViewer(): TopoViewer | undefined {
  return currentTopoViewer;
}

export function setCurrentTopoViewer(viewer: TopoViewer | undefined) {
  currentTopoViewer = viewer;
  if (viewer) {
    currentTopoViewerPanel = (viewer as any).currentPanel;
    activeTopoViewers.add(viewer);

    // Set up disposal handler to remove from active set
    if (currentTopoViewerPanel) {
      currentTopoViewerPanel.onDidDispose(() => {
        activeTopoViewers.delete(viewer);
      });
    }
  } else {
    currentTopoViewerPanel = undefined;
  }
}

/**
 * Notifies the current active topoviewer about successful command completion
 * This should ONLY be called after a containerlab command has successfully completed
 */
export async function notifyCurrentTopoViewerOfCommandSuccess(commandType: 'deploy' | 'destroy' | 'redeploy') {
  // Only notify the current active TopoViewer
  if (!currentTopoViewer || !currentTopoViewerPanel) {
    return;
  }

  try {
    // Determine the new state based on the command
    const newDeploymentState = (commandType === 'destroy') ? 'undeployed' : 'deployed';
    const newViewMode = (commandType === 'destroy') ? false : true;

    // Update the viewer's state
    currentTopoViewer.deploymentState = newDeploymentState;
    currentTopoViewer.isViewMode = newViewMode;

    // Force refresh the panel to reflect the new mode, bypassing any checks
    if (currentTopoViewer.forceUpdateAfterCommand) {
      await currentTopoViewer.forceUpdateAfterCommand(currentTopoViewerPanel);
    } else {
      // Fallback to regular update if the new method doesn't exist
      await currentTopoViewer.updatePanelHtml(currentTopoViewerPanel);
    }
  } catch (error) {
    console.error(`Failed to update topoviewer after ${commandType}:`, error);
  }
}
