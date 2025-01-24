import { ClabCommand } from './command';
import { ContainerlabNode } from "../containerlabTreeDataProvider";

export function destroy(node: ContainerlabNode) {
    const cmd = new ClabCommand("destroy", node, true);
    cmd.run(["-c"]);
}