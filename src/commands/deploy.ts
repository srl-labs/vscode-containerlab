import { ClabLabTreeNode } from "../clabTreeDataProvider";
import { ClabCommand } from "./clabCommand";
import { SpinnerMsg } from "./command";
import * as vscode from "vscode";

export function deploy(node: ClabLabTreeNode) {
  const spinnerMessages: SpinnerMsg = {
    progressMsg: "Deploying Lab... Check the Output window (Containerlab) for detailed progress.",
    successMsg: "Lab deployed successfully!"
  };
  const deployCmd = new ClabCommand("deploy", node, spinnerMessages);
  deployCmd.run();
}

export function deployCleanup(node: ClabLabTreeNode) {
  const spinnerMessages: SpinnerMsg = {
    progressMsg: "Deploying Lab (cleanup)... Check the Output window (Containerlab) for detailed progress.",
    successMsg: "Lab deployed (cleanup) successfully!"
  };
  const deployCmd = new ClabCommand("deploy", node, spinnerMessages);
  deployCmd.run(["-c"]);
}

export function deploySpecificFile() {

  const opts: vscode.OpenDialogOptions = {
    title: "Select containerlab topology file",
    filters: {
      yaml: ["yaml", "yml"]
    },
  };

  vscode.window.showOpenDialog(opts).then(uri => {
    if (!uri || !uri.length) {
      return;
    }
    const picked = uri[0].fsPath;
    const tempNode = new ClabLabTreeNode("", vscode.TreeItemCollapsibleState.None, {absolute: picked, relative: ""});
    deploy(tempNode);
  });
}
