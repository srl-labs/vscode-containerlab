import { ContainerlabNode } from "../containerlabTreeDataProvider";
import { ClabCommand } from "./clabCommand";
import { SpinnerMsg } from "./command";
import * as vscode from "vscode";

export function deploy(node: ContainerlabNode) {
  const spinnerMessages: SpinnerMsg = {
    progressMsg: "Deploying Lab...",
    successMsg: "Lab deployed successfully!"
  };
  const deployCmd = new ClabCommand("deploy", node, spinnerMessages);
  deployCmd.run();
}

export function deployCleanup(node: ContainerlabNode) {
  const spinnerMessages: SpinnerMsg = {
    progressMsg: "Deploying Lab (cleanup)...",
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
  }

  vscode.window.showOpenDialog(opts).then(uri => {
    if (!uri || !uri.length) {
      return;
    }
    const picked = uri[0].fsPath;
    const tempNode = new ContainerlabNode("", vscode.TreeItemCollapsibleState.None, { labPath: picked }, "");
    deploy(tempNode);
  });
}
