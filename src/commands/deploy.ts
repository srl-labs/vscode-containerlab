import { ContainerlabNode } from "../containerlabTreeDataProvider";
import { ClabCommand } from "./clabCommand";
import { SpinnerMsg } from "./command";

export function deploy(node: ContainerlabNode) {

  const spinnerMessages: SpinnerMsg = {
    progressMsg: "Deploying Lab...",
    successMsg: "Lab deployed Successfully!",
  }

  const deployCmd = new ClabCommand("deploy", node, spinnerMessages);

  deployCmd.run();
}