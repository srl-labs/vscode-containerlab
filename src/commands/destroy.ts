import { ContainerlabNode } from "../containerlabTreeDataProvider";
import { ClabCommand } from "./clabCommand";
import { SpinnerMsg } from "./command";

export function destroy(node: ContainerlabNode) {
  const spinnerMessages: SpinnerMsg = {
    progressMsg: "Destroying Lab...",
    successMsg: "Lab destroyed successfully!"
  };
  const destroyCmd = new ClabCommand("destroy", node, spinnerMessages);
  destroyCmd.run();
}

export function destroyCleanup(node: ContainerlabNode) {
  const spinnerMessages: SpinnerMsg = {
    progressMsg: "Destroying Lab (cleanup)...",
    successMsg: "Lab destroyed (cleanup) successfully!"
  };
  const destroyCmd = new ClabCommand("destroy", node, spinnerMessages);
  destroyCmd.run(["-c"]);
}
