import * as vscode from "vscode"
import * as utils from "../utils";
import { ClabInterfaceTreeNode } from "../clabTreeDataProvider"
import { ChildProcess } from "child_process";
import { execCommandInOutput } from "./command";
import { outputChannel } from "../extension";

/**
 * Begin packet capture on an interface.
 * 
 * @param node ClabInterfaceTreeNode which the capture was started on.
 */
export async function captureInterface(node: ClabInterfaceTreeNode) {

    if (!node || !(node instanceof ClabInterfaceTreeNode)) {
        return vscode.window.showErrorMessage("No interface to capture found.");
    }

    const captureCmd = `${utils.getSudo()}ip netns exec ${node.nsName} tcpdump -U -nni ${node.name} -w -`

    if(vscode.env.remoteName === "ssh-remote") { 
        vscode.window.showInformationMessage("Attemping to capture with edgeshark...");
        return captureInterfaceWithPacketflix(node);
     }

    let wiresharkCmd: string = 'wireshark';

    // Check what context the extension is running in:
    if(vscode.env.remoteName === "wsl") { 
        const cfgWiresharkPath = vscode.workspace.getConfiguration("containerlab").get<string | undefined>("wsl.wiresharkPath");
        wiresharkCmd = cfgWiresharkPath ? `"${cfgWiresharkPath}"` : '"/mnt/c/Program Files/Wireshark/wireshark.exe"'; 
    }
    // build the command
    const cmd = `${captureCmd} | ${wiresharkCmd} -k -i -`;

    vscode.window.showInformationMessage(`Starting capture on ${node.name} for ${node.nsName}.`);

    // Begin the capture.
    execCommandInOutput(cmd, false,
        undefined,
        (proc: ChildProcess, data: string) => {
            if(data.includes("Capture stopped.")) { 
                proc.kill();
                vscode.window.showInformationMessage(`Ended capture on ${node.name} for ${node.nsName}.`)
                outputChannel.appendLine("\tCapture done.");
            }
        }
    );
}

/**
 * Start capture on an interface, but use edgeshark to pcap
 * by capturing with the packetflix:ws:// URI.
 * 
 * @param node ClabInterfaceTreeNode which the capture was started on.
 */
export async function captureInterfaceWithPacketflix(node: ClabInterfaceTreeNode) {
    if (!node || !(node instanceof ClabInterfaceTreeNode)) {
        return vscode.window.showErrorMessage("No interface to capture found.");
    }

    const hostname = "localhost:5001"

    const packetflixUri: string = `packetflix:ws://${hostname}/capture?container={"network-interfaces":["${node.name}"],"name":"${node.nsName}","type":"docker","prefix":""}&nif=${node.name}`

    console.log(`[capture]:\t ${vscode.Uri.parse(packetflixUri)}`);
    
    vscode.env.openExternal(vscode.Uri.parse(packetflixUri));
}