import { ContainerlabNode } from "../containerlabTreeDataProvider";
import { ClabCommand } from "./clabCommand";
import { SpinnerMsg } from "./command";

export function destroy(node: ContainerlabNode) {

  const spinnerMessages: SpinnerMsg = {
    progressMsg: "Destroying Lab...",
    successMsg: "Lab destroyed Successfully!",
  }

  const destroyCmd = new ClabCommand("destroy", node, spinnerMessages);

  destroyCmd.run(["-c"]);
}