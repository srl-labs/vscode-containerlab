import { ClabCommand } from './command'
import { ContainerlabNode } from "../containerlabTreeDataProvider";

export function redeploy(node: ContainerlabNode) {

    const cmd = new ClabCommand("redeploy", true, node);

    cmd.run(["-c"]);
}