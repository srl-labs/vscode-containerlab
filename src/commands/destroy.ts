import { ClabLabTreeNode } from "../clabTreeDataProvider";
import { ClabCommand } from "./clabCommand";
import { SpinnerMsg } from "./command";

export function destroy(node: ClabLabTreeNode) {
  const spinnerMessages: SpinnerMsg = {
    progressMsg: "Destroying Lab...",
    successMsg: "Lab destroyed successfully!"
  };
  const destroyCmd = new ClabCommand("destroy", node, spinnerMessages);
  destroyCmd.run();
}

export function destroyCleanup(node: ClabLabTreeNode) {
  const spinnerMessages: SpinnerMsg = {
    progressMsg: "Destroying Lab (cleanup)...",
    successMsg: "Lab destroyed (cleanup) successfully!"
  };
  const destroyCmd = new ClabCommand("destroy", node, spinnerMessages);
  destroyCmd.run(["-c"]);
}
