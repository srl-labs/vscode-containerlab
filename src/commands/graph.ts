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
export async function grapTopoviewer(node: ClabLabTreeNode, context: vscode.ExtensionContext) {

  const provider = new ClabTreeDataProvider(context);
  const clabTreeDataToTopoviewer = await provider.discoverInspectLabs();
  const viewer = new TopoViewer(context);

  if (!node) {
    vscode.window.showErrorMessage('No lab node selected.');
    return;
  }

  const labPath = node.labPath.absolute;

  // const labPath = node.details?.labPath;
  const labLabel = node.label || "Lab";
  if (!labPath) {
    vscode.window.showErrorMessage('No labPath to redeploy.');
    return;
  }

  // const yamlFilePath = path.join(__dirname, '..', 'clab-demo.yaml');
  try {
    await viewer.openViewer(labPath, clabTreeDataToTopoviewer);
  } catch (err) {
    vscode.window.showErrorMessage(`Failed to open Topology Viewer: ${err}`);
    console.error(`[ERROR] Failed to open topology viewer`, err);
  }

}