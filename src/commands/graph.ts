import * as vscode from "vscode";
import * as fs from "fs";
import { ClabCommand } from "./clabCommand";
import { ClabLabTreeNode } from "../treeView/common";

import { TopoViewer } from "../topoViewerTs/backend/topoViewerWebUiFacade";
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
        return vscode.window.showErrorMessage(
          `Containerlab failed to generate .drawio file for lab: ${node.name}.`
        );
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

  const graphCmd = new ClabCommand("graph", node);

  graphCmd.run(["--drawio", "--drawio-args", `"-I"`]);
}



/**
 * Graph Lab (TopoViewer)
 */

let currentTopoViewer: TopoViewer | undefined;
let currentTopoViewerPanel: vscode.WebviewPanel | undefined;


export async function graphTopoviewer(node?: ClabLabTreeNode, context?: vscode.ExtensionContext) {
  // Get node if not provided
  node = await getSelectedLabNode(node);

  let labPath: string;

  if (node && node.labPath && node.labPath.absolute) {
    labPath = node.labPath.absolute;
  } else {
    // Try to get from active editor
    const editor = vscode.window.activeTextEditor;
    if (!editor || !editor.document.uri.fsPath.match(/\.clab\.(yaml|yml)$/)) {
      vscode.window.showErrorMessage(
        'No lab node or topology file selected'
      );
      return;
    }
    labPath = editor.document.uri.fsPath;
  }

  if (!context) {
    vscode.window.showErrorMessage('Extension context not available');
    return;
  }

  // 1) create a new TopoViewer
  const viewer = new TopoViewer(context);

  // 2) store the viewer in the global variable
  currentTopoViewer = viewer;

  try {
    // 3) call openViewer, which returns (panel | undefined).
    // Pass undefined for clabTreeDataToTopoviewer - let openViewer handle discovery internally
    currentTopoViewerPanel = await viewer.openViewer(labPath, undefined);

    // 4) If the panel is undefined, do nothing or return
    if (!currentTopoViewerPanel) {
      return;
    }

    // 5) Set context so reload button can appear
    vscode.commands.executeCommand("setContext", "isTopoviewerActive", true);

    // 6) Track disposal
    currentTopoViewerPanel.onDidDispose(() => {
      currentTopoViewerPanel = undefined;
      currentTopoViewer = undefined; // also nullify the viewer reference
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

  // 3) Now call updatePanelHtml on the existing panel
  currentTopoViewer.updatePanelHtml(currentTopoViewerPanel);
}
