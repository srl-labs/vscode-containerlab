import { ClabCommand } from './command';
import { ContainerlabNode } from "../containerlabTreeDataProvider";

export function deploy(node: ContainerlabNode) {
    // Removed the second "true" param (sudo) because we now read from settings
    const cmd = new ClabCommand("deploy", node);
    cmd.run(["-c"]);
}
