import { ClabCommand } from './command';
import { ContainerlabNode } from "../containerlabTreeDataProvider";

export function redeploy(node: ContainerlabNode) {
    const cmd = new ClabCommand("redeploy", node, true);
    cmd.run();
}