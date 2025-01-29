import * as vscode from "vscode"
import { ClabInterfaceTreeNode } from "../clabTreeDataProvider"
import { execCommandInTerminal } from "./command";
import * as utils from "../utils";

/**
 * Begin packet capture on an interface.
 * 
 * @param node ClabInterfaceTreeNode which the capture was started on.
 */
export function captureInterface(node: ClabInterfaceTreeNode) {

    if (!node || !(node instanceof ClabInterfaceTreeNode)) {
        return vscode.window.showErrorMessage("No interface to capture found.");
    }

    const captureCmd = `${utils.getSudo()}ip netns exec ${node.nsName} tcpdump -U -nni ${node.name} -w -`

    if(vscode.env.remoteName === "ssh-remote") { return vscode.window.showErrorMessage("Capture on SSH remote sessions is not currently supported."); }

    let wiresharkCmd: string = 'wireshark';

    // Check what context the extension is running in:
    if(vscode.env.remoteName === "wsl") { wiresharkCmd = '"/mnt/c/Program Files/Wireshark/wireshark.exe"'; }

    const cmd = `${captureCmd} | ${wiresharkCmd} -k -i -`;

    execCommandInTerminal(cmd, `Capture - ${node.nsName}:${node.name}`);
}


function invokeCaptureExtension(cmd: string) {


}