import { ClabCommand } from './command'
import { ContainerlabNode } from "../containerlabTreeDataProvider";

export function deploy(node: ContainerlabNode) {

    const cmd = new ClabCommand("deploy", true, node);

    cmd.run(["-c"]);
}