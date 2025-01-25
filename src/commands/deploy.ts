import { ContainerlabNode } from "../containerlabTreeDataProvider";
import { ClabCommand } from "./clabCommand";
import { SpinnerMsg } from "./command";
import * as vscode from "vscode";
import * as utils from "../utils";

export function deploy(node: ContainerlabNode) {

  const spinnerMessages: SpinnerMsg = {
    progressMsg: "Deploying Lab...",
    successMsg: "Lab deployed Successfully!",
  }

  const deployCmd = new ClabCommand("deploy", node, spinnerMessages);

  deployCmd.run();
}

export function deployForce(node: ContainerlabNode) {

  const spinnerMessages: SpinnerMsg = {
    progressMsg: "Force deploying Lab...",
    successMsg: "Lab deployed Successfully!",
  }

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

  vscode.window.showOpenDialog(opts).then(
    (uri) => {
      const newUriObj = vscode.Uri.parse(uri!.toString());

      const tempNode = new ContainerlabNode("", vscode.TreeItemCollapsibleState.None, {labPath: newUriObj.fsPath}, "")
      deploy(tempNode);
    }
  )
}