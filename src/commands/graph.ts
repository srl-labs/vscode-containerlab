import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { ContainerlabNode } from "../containerlabTreeDataProvider";
import { ClabCommand } from "./clabCommand";
import { SpinnerMsg } from "./command";

/**
 * Graph Lab (Web) => run in Terminal (no spinner).
 */
export function graphNextUI(node: ContainerlabNode) {
  const graphCmd = new ClabCommand("graph", node, undefined, true, "Graph - Web");
  
  graphCmd.run();
}

/**
 * Graph Lab (draw.io) => use spinner, then open .drawio file in hediet.vscode-drawio
 */
export async function graphDrawIO(node: ContainerlabNode) {
  const spinnerMessages: SpinnerMsg = {
    progressMsg: "Generating DrawIO graph...",
    successMsg: "DrawIO Graph Completed!",
    failMsg: "Graph (draw.io) Failed",
  };

  const graphCmd = new ClabCommand("graph", node, spinnerMessages);

  // Figure out the .drawio filename
  if (!node.details?.labPath) {
    vscode.window.showErrorMessage("No lab path found. Cannot open .drawio file.");
    return;
  }
  const labPath = node.details.labPath;
  const drawioPath = labPath.replace(/\.(ya?ml)$/i, ".drawio");
  const drawioUri = vscode.Uri.file(drawioPath);

  // Wait for containerlab to finish generating <labFileName>.drawio
  await graphCmd.run(["--drawio"]).then(
    () => {
      // Verify the file exists
      if (!fs.existsSync(drawioPath)) {
        vscode.window.showErrorMessage(
          `Containerlab generated no .drawio file: ${drawioPath}`
        );
      }

      vscode.commands.executeCommand("vscode.open", drawioUri);
    }
  )
}

/**
 * Graph Lab (draw.io, Interactive) => always run in Terminal
 */
export function graphDrawIOInteractive(node: ContainerlabNode) {
  const graphCmd = new ClabCommand("graph", node, undefined, true, "Graph - drawio Interactive");
  
  graphCmd.run(["--drawio", "--drawio-args", `"-I"`]);
}