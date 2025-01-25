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
 * Graph Lab (draw.io) => Use spinner
 */
export function graphDrawIO(node: ContainerlabNode) {
  const spinnerMessages: SpinnerMsg = {
    progressMsg: "Generating DrawIO graph...",
    successMsg: "DrawIO Graph Completed!",
    failMsg: "Graph (draw.io) Failed",
  };

  const graphCmd = new ClabCommand("graph", node, spinnerMessages);

  graphCmd.run(["--drawio"]);
}

/**
 * Graph Lab (draw.io, Interactive) => always run in Terminal
 */
export function graphDrawIOInteractive(node: ContainerlabNode) {
  const graphCmd = new ClabCommand("graph", node, undefined, true, "Graph - drawio Interactive");
  
  graphCmd.run(["--drawio", "--drawio-args", `"-I"`]);
}