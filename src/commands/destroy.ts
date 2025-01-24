import { ClabCommand } from './command'
import { ContainerlabNode } from "../containerlabTreeDataProvider";

export function destroy(node: ContainerlabNode) {

    const cmd = new ClabCommand("destroy", true, node);

    cmd.run(["-c"]);
}