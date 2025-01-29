import * as vscode from "vscode"
import * as utils from "../utils";
import { ClabInterfaceTreeNode } from "../clabTreeDataProvider"
import { ChildProcess } from "child_process";
import { execCommandInOutput } from "./command";
import { outputChannel } from "../extension";

// hostname to use only for this session.
let sessionHostname: string = "";

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

    if (vscode.env.remoteName === "ssh-remote") {
        vscode.window.showInformationMessage("Attemping to capture with edgeshark...");
        return captureInterfaceWithPacketflix(node);
    }

    let wiresharkCmd: string = 'wireshark';

    // Check what context the extension is running in:
    if (vscode.env.remoteName === "wsl") {
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
            if (data.includes("Capture stopped.")) {
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

    const hostname = await getHostname();
    if (!hostname) { return vscode.window.showErrorMessage("No known hostname/IP address to connect to."); }

    const packetflixUri: string = `packetflix:ws://${hostname}:5001/capture?container={"network-interfaces":["${node.name}"],"name":"${node.nsName}","type":"docker","prefix":""}&nif=${node.name}`

    console.log(`[capture]:\t ${vscode.Uri.parse(packetflixUri)}`);

    vscode.env.openExternal(vscode.Uri.parse(packetflixUri));
}

/**
 * Get the configured hostname for this system. Either for this session or from global settings.
 * Hostnames configured for this session only take precedence.
 * 
 * @returns A string of the hostname if a hostname was found, else undefined.
 */
async function getHostname(): Promise<string | undefined> {
    if (sessionHostname) { return sessionHostname; }

    if (!(vscode.workspace.getConfiguration("containerlab").get("remote.hostname"))) {
        const result = await configureHostname();
        if (!result) { return sessionHostname; };
    }

    return vscode.workspace.getConfiguration("containerlab").get("remote.hostname");
}

/**
 * Get user input to set the hostname for this machine to use in packet capture.
 * Attempt to save the configured value into the VSCode configuration.
 * If this can't be saved, the entered hostname will persist only for the session of VS Code.
 * 
 * @returns Boolean. True if the hostname was saved to the config, false if not.
 */
export async function configureHostname(): Promise<boolean> {
    const opts: vscode.InputBoxOptions = {
        title: `Configure hostname for Containerlab remote.`,
        placeHolder: `IPv4, IPv6 or DNS resolvable hostname of the system that containerlab is running on.`,
        prompt: "This setting will persist.",
        validateInput: (input: string) => {
            if (input.length === 0) { return "Input should not be empty"; }
        }
    }

    const val = await vscode.window.showInputBox(opts);

    if (!val || val.length === 0) { return false; }

    try {
        await vscode.workspace.getConfiguration("containerlab").update("remote.hostname", val)
    } catch (err) {
        sessionHostname = val;
        vscode.window.showWarningMessage(`Unable to persist hostname setting in VSCode settings. ${val} will persist as hostname for this session only. ${err}.`)
        return false
    }

    return true;
}

/**
 * Get user input to set the hostname to use for packetcapture for only this session of VS Code.
 */
export async function setSessionHostname() {
    const opts: vscode.InputBoxOptions = {
        title: `Configure hostname for Containerlab remote.`,
        placeHolder: `IPv4, IPv6 or DNS resolvable hostname of the system that containerlab is running on.`,
        prompt: "This will persist for only this session of VS Code.",
        validateInput: (input: string) => {
            if (input.length === 0) { return "Input should not be empty"; }
        }
    }

    const val = await vscode.window.showInputBox(opts);

    if (!val || val.length === 0) { return false; }
    sessionHostname = val;
}