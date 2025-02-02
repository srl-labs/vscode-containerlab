import * as vscode from "vscode";
import * as fs from "fs";
import { ClabCommand } from "./clabCommand";
import { SpinnerMsg } from "./command";
import { ClabLabTreeNode, ClabTreeDataProvider } from "../clabTreeDataProvider";

import { TopoViewer } from "../topoViewer/backend/topoViewerWebUiFacade";


/**
 * Graph Lab (Web) => run in Terminal (no spinner).
 */
export function graphNextUI(node: ClabLabTreeNode) {
  const graphCmd = new ClabCommand("graph", node, undefined, true, "Graph - Web");

  graphCmd.run();
}

/**
 * Graph Lab (draw.io) => use spinner, then open .drawio file in hediet.vscode-drawio
 */
export async function graphDrawIO(node: ClabLabTreeNode) {
  const spinnerMessages: SpinnerMsg = {
    progressMsg: "Generating DrawIO graph...",
    successMsg: "DrawIO Graph Completed!",
    failMsg: "Graph (draw.io) Failed",
  };

  const graphCmd = new ClabCommand("graph", node, spinnerMessages);

  // Figure out the .drawio filename
  if (!node.labPath.absolute) {
    vscode.window.showErrorMessage("No lab path found. Cannot open .drawio file.");
    return;
  }
  const labPath = node.labPath.absolute;
  const drawioPath = labPath.replace(/\.(ya?ml)$/i, ".drawio");
  const drawioUri = vscode.Uri.file(drawioPath);

  // Wait for containerlab to finish generating <labFileName>.drawio
  await graphCmd.run(["--drawio"]).then(
    () => {
      // Verify the file exists
      if (!fs.existsSync(drawioPath)) {
        return vscode.window.showErrorMessage(
          `Containerlab failed to generate .drawio file for lab: ${node.name}.`
        );
      }

      vscode.commands.executeCommand("vscode.open", drawioUri);
    }
  )
}

/**
 * Graph Lab (draw.io, Interactive) => always run in Terminal
 */
export function graphDrawIOInteractive(node: ClabLabTreeNode) {
  const graphCmd = new ClabCommand("graph", node, undefined, true, "Graph - drawio Interactive");

  graphCmd.run(["--drawio", "--drawio-args", `"-I"`]);
}


/**
 * Graph Lab (TopoViewer) 
 */

let currentTopoViewer: TopoViewer | undefined;
let currentTopoViewerPanel: vscode.WebviewPanel | undefined;


export async function graphTopoviewer(node: ClabLabTreeNode, context: vscode.ExtensionContext) {
  // 1) create a new TopoViewer
  const viewer = new TopoViewer(context);

  // 2) store the viewer in the global variable
  currentTopoViewer = viewer;

  // do the same logic as before...
  const provider = new ClabTreeDataProvider(context);5
  const clabTreeDataToTopoviewer = await provider.discoverInspectLabs();

  // if node, if labPath, etc...
  const yamlFilePath = node.labPath.absolute;
  if (!yamlFilePath) {
    vscode.window.showErrorMessage('No labPath to redeploy.');
    return;
  }

  try {
    // 3) call openViewer, which returns (panel | undefined).
    currentTopoViewerPanel = await viewer.openViewer(yamlFilePath, clabTreeDataToTopoviewer);

    // await viewer.openViewer(yamlFilePath, clabTreeDataToTopoviewer);
    // currentTopoViewerPanel = viewer.currentTopoViewerPanel

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

  } catch (err) {
    // ...
  }
}



export async function graphTopoviewerReload(context: vscode.ExtensionContext) {
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