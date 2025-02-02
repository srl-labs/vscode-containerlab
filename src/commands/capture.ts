import * as vscode from "vscode"
import * as utils from "../utils";
import { ClabInterfaceTreeNode } from "../clabTreeDataProvider"
import { ChildProcess, execSync } from "child_process";
import { execCommandInOutput } from "./command";
import { outputChannel } from "../extension";

let sessionHostname: string = "";

/**
 * Begin packet capture on an interface.
 */
export async function captureInterface(node: ClabInterfaceTreeNode) {
    if (!node) {
        return vscode.window.showErrorMessage("No interface to capture found.");
    }

    // For an SSH-Remote session, prefer edgeshark/packetflix approach
    if (vscode.env.remoteName === "ssh-remote") {
        vscode.window.showInformationMessage("Attempting to capture with edgeshark...");
        return captureInterfaceWithPacketflix(node);
    }

    // Otherwise, spawn Wireshark locally or in WSL
    const captureCmd = `${utils.getSudo()}ip netns exec ${node.nsName} tcpdump -U -nni ${node.name} -w -`;
    let wiresharkCmd = 'wireshark';

    if (vscode.env.remoteName === "wsl") {
        const cfgWiresharkPath = vscode.workspace
          .getConfiguration("containerlab")
          .get<string>("wsl.wiresharkPath");
        // default path if user didn’t override
        wiresharkCmd = cfgWiresharkPath
            ? `"${cfgWiresharkPath}"`
            : '"/mnt/c/Program Files/Wireshark/wireshark.exe"';
    }

    const cmd = `${captureCmd} | ${wiresharkCmd} -k -i -`;

    vscode.window.showInformationMessage(`Starting capture on ${node.name} for ${node.nsName}.`);
    execCommandInOutput(cmd, false,
        undefined,
        (proc: ChildProcess, data: string) => {
            if (data.includes("Capture stopped.")) {
                proc.kill();
                vscode.window.showInformationMessage(`Ended capture on ${node.name} for ${node.nsName}.`);
                outputChannel.appendLine("\tCapture done.");
            }
        }
    );
}

/**
 * Start capture on an interface, but use edgeshark to pcap
 * by capturing with the `packetflix` URI scheme.
 */
export async function captureInterfaceWithPacketflix(node: ClabInterfaceTreeNode) {
    if (!node) {
        return vscode.window.showErrorMessage("No interface to capture found.");
    }

    const hostname = await getHostname();
    if (!hostname) {
        return vscode.window.showErrorMessage("No known hostname/IP address to connect to for packet capture.");
    }

    const packetflixUri = `packetflix:ws://${hostname}:5001/capture?container={"network-interfaces":["${node.name}"],"name":"${node.nsName}","type":"docker"}&nif=${node.name}`;

    console.log(`[capture] Launching edgeshark with: ${packetflixUri}`);
    vscode.env.openExternal(vscode.Uri.parse(packetflixUri));
}

/**
 * If a user calls the "Set session hostname" command, we store it in-memory here,
 * overriding the auto-detected or config-based hostname until the user closes VS Code.
 */
export async function setSessionHostname() {
    const opts: vscode.InputBoxOptions = {
        title: `Configure hostname for Containerlab remote (this session only)`,
        placeHolder: `IPv4, IPv6 or DNS resolvable hostname of the system where containerlab is running`,
        prompt: "This will persist for only this session of VS Code.",
        validateInput: (input: string) => {
            if (input.trim().length === 0) {
                return "Input should not be empty";
            }
        }
    };

    const val = await vscode.window.showInputBox(opts);
    if (!val) {
        return false;
    }
    sessionHostname = val.trim();
    vscode.window.showInformationMessage(`Session hostname is set to: ${sessionHostname}`);
    return true;
}

/**
 * Determine the best hostname to use for packet capture:
 *   1. If the user has set a "session" hostname, use it.
 *   2. If we're in SSH-Remote, parse SSH_CONNECTION env variable.
 *   3. If we detect OrbStack, try <hostname>.orb.local or fallback to "host.orbstack.internal".
 *   4. If we're in WSL or local, default to "localhost".
 *   5. If still none, check global `containerlab.remote.hostname`.
 *   6. Prompt user if no solution found, or fallback to "".
 */
async function getHostname(): Promise<string> {
    // 1) If sessionHostname is set in-memory, use that
    if (sessionHostname) {
        return sessionHostname;
    }

    // 2) If in an SSH-Remote context, parse SSH_CONNECTION env var
    if (vscode.env.remoteName === "ssh-remote") {
        const sshConnection = process.env.SSH_CONNECTION;
        if (sshConnection) {
            const parts = sshConnection.split(" ");
            // Typically: `client_ip client_port server_ip server_port`
            if (parts.length >= 3) {
                const remoteIp = parts[2];
                if (remoteIp) {
                    return remoteIp;
                }
            }
            vscode.window.showWarningMessage(`SSH_CONNECTION was present but in an unexpected format: ${sshConnection}`);
        } else {
            vscode.window.showWarningMessage("No SSH_CONNECTION variable found. Could not auto-detect remote IP.");
        }
    }

    // 3) OrbStack detection & attempt to use <hostname>.orb.local
    if (utils.isOrbstack()) {
        try {
            const orbHost = execSync("hostname").toString().trim();
            if (orbHost) {
                return orbHost + ".orb.local";
            }
        } catch {
            // fallback
            return "host.orbstack.internal";
        }
    }

    // 4) If in WSL or local, just use localhost
    if (vscode.env.remoteName === "wsl" || !vscode.env.remoteName) {
        return "localhost";
    }

    // 5) If we still have no hostname, read from user settings
    const configHostname = vscode.workspace.getConfiguration("containerlab").get<string>("remote.hostname", "");
    if (configHostname) {
        return configHostname;
    }

    // 6) Otherwise, prompt the user
    const yesBtn = "Set Hostname";
    const noBtn = "Cancel";
    const choice = await vscode.window.showWarningMessage(
        "No remote hostname is configured. Do you want to set it now?",
        yesBtn, noBtn
    );
    if (choice === yesBtn) {
        await configureHostname();
        return sessionHostname; // user just typed something above
    }

    // If user declines, return empty and let the caller handle
    return "";
}

/**
 * Interactively configure a hostname **persisted** in the global containerlab.remote.hostname setting,
 * or fallback to sessionHostname if we can’t persist it.
 */
async function configureHostname(): Promise<boolean> {
    const opts: vscode.InputBoxOptions = {
        title: "Configure remote hostname (global user setting)",
        placeHolder: "IPv4, IPv6 or DNS name of the remote machine running containerlab",
        validateInput: (input: string) => {
            if (input.trim().length === 0) {
                return "Input should not be empty";
            }
        }
    };

    const input = await vscode.window.showInputBox(opts);
    if (!input) {
        return false;
    }

    const val = input.trim();
    try {
        // Attempt to store in user settings
        await vscode.workspace
            .getConfiguration("containerlab")
            .update("remote.hostname", val, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(`Global setting "containerlab.remote.hostname" updated to "${val}".`);
    } catch (err) {
        sessionHostname = val;
        vscode.window.showWarningMessage(
            `Could not persist global setting. Will use session hostname = "${val}" until VS Code restarts.`
        );
    }
    return true;
}
