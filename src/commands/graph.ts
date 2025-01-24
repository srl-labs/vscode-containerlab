import { ClabCommand } from './command'
import { ContainerlabNode } from "../containerlabTreeDataProvider";

// serve the NeXt-UI graph (default graph)
export function graphNextUI(node: ContainerlabNode) {

    const cmd = new ClabCommand("graph", true, node);

    cmd.run();
}

export function graphDrawIOInteractive(node: ContainerlabNode) {
    const cmd = new ClabCommand("graph", true, node);

    cmd.run(["--drawio", `--drawio-args "-I"`]);
}

export function graphDrawIO(node: ContainerlabNode) {
    const cmd = new ClabCommand("graph", true, node);

    cmd.run(["--drawio"]);
}