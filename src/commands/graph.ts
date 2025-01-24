import { ClabCommand } from './command';
import { ContainerlabNode } from "../containerlabTreeDataProvider";

export function graphNextUI(node: ContainerlabNode) {
    const cmd = new ClabCommand("graph", node);
    cmd.run();
}

export function graphDrawIOInteractive(node: ContainerlabNode) {
    const cmd = new ClabCommand("graph", node);
    cmd.run(["--drawio", `--drawio-args "-I"`]);
}

// Graph Lab (draw.io) => run in Output
export function graphDrawIO(node: ContainerlabNode) {
    const cmd = new ClabCommand("graph", node, true);
    cmd.run(["--drawio"]);
}