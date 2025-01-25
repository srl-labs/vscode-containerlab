import { ContainerlabNode } from "../containerlabTreeDataProvider";
import { ClabCommand } from "./clabCommand";
import { SpinnerMsg } from "./command";

export function redeploy(node: ContainerlabNode) {

  const spinnerMessages: SpinnerMsg = {
    progressMsg: "Redeploying Lab...",
    successMsg: "Lab redeployed Successfully!",
  }

  const redeployCmd = new ClabCommand("redeploy", node, spinnerMessages);

  redeployCmd.run();
}