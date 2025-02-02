import * as vscode from "vscode"
import { execSync } from "child_process";
import { runWithSudo } from "../helpers/containerlabUtils";
import { outputChannel } from "../extension";
import * as utils from "../utils";
import { ClabInterfaceTreeNode } from "../clabTreeDataProvider";

let sessionHostname: string = "";

/**
 * Begin packet capture on an interface.
 *   - If remoteName = ssh-remote, we always do edgeshark/packetflix.
 *   - If on OrbStack (Mac), we also do edgeshark because netns approach doesn't work well on macOS.
 *   - Otherwise, we spawn tcpdump + Wireshark locally (or in WSL).
 */
export async function captureInterface(node: ClabInterfaceTreeNode) {
    if (!node) {
        return vscode.window.showErrorMessage("No interface to capture found.");
    }

    outputChannel.appendLine(`[DEBUG] captureInterface() called for node=${node.nsName}, interface=${node.name}`);
    outputChannel.appendLine(`[DEBUG] remoteName = ${vscode.env.remoteName || "(none)"}; isOrbstack=${utils.isOrbstack()}`);

    // SSH-remote => use edgeshark/packetflix
    if (vscode.env.remoteName === "ssh-remote") {
        outputChannel.appendLine("[DEBUG] In SSH-Remote environment → captureInterfaceWithPacketflix()");
        return captureInterfaceWithPacketflix(node);
    }

    // On OrbStack macOS, netns is typically not workable => edgeshark
    if (utils.isOrbstack()) {
        outputChannel.appendLine("[DEBUG] Detected OrbStack environment → captureInterfaceWithPacketflix()");
        return captureInterfaceWithPacketflix(node);
    }

    // Otherwise, we do local capture with tcpdump|Wireshark
    const captureCmd = `ip netns exec "${node.nsName}" tcpdump -U -nni "${node.name}" -w -`;
    const wifiCmd = await resolveWiresharkCommand();
    const finalCmd = `${captureCmd} | ${wifiCmd} -k -i -`;

    outputChannel.appendLine(`[DEBUG] Attempting local capture with command:\n    ${finalCmd}`);

    vscode.window.showInformationMessage(`Starting capture on ${node.nsName}/${node.name}... check "Containerlab" output for logs.`);

    // We can run tcpdump with sudo. Then pipe stdout -> Wireshark.
    // We'll wrap that in a small script. Alternatively, we can do something like:
    // runWithSudo('ip netns exec ...', 'Packet capture', ...) but we also must
    // handle the pipe. So let's do a naive approach:
    runCaptureWithPipe(finalCmd, node.nsName, node.name);
}

/**
 * Spawn Wireshark or Wireshark.exe in WSL.
 */
async function resolveWiresharkCommand(): Promise<string> {
    // Default: 'wireshark'
    // If in WSL, try user config "containerlab.wsl.wiresharkPath"
    if (vscode.env.remoteName === "wsl") {
        const cfgWiresharkPath = vscode.workspace
            .getConfiguration("containerlab")
            .get<string>("wsl.wiresharkPath");
        if (cfgWiresharkPath) {
            return `"${cfgWiresharkPath}"`;
        }
        // fallback
        return `"/mnt/c/Program Files/Wireshark/wireshark.exe"`;
    }
    return "wireshark";
}

/**
 * Actually run the pipe (tcpdump -> Wireshark) using the same approach as execCommandInOutput,
 * but with extra logging and runWithSudo for the tcpdump part if needed.
 *
 * The easiest approach is to write a small shell snippet to a temp script and run it with sudo.
 */
function runCaptureWithPipe(pipeCmd: string, nsName: string, ifName: string) {
    // We'll do a short script like:
    //    bash -c '<pipeCmd>'
    // Because runWithSudo() can handle prompting for password if needed.
    const scriptToRun = `bash -c '${pipeCmd}'`;

    outputChannel.appendLine(`[DEBUG] runCaptureWithPipe() => runWithSudo(script=${scriptToRun})`);

    runWithSudo(
        scriptToRun,
        `TCPDump capture on ${nsName}/${ifName}`,
        outputChannel
    )
    .then(() => {
        outputChannel.appendLine("[DEBUG] Capture process completed or exited");
    })
    .catch(err => {
        vscode.window.showErrorMessage(
          `Failed to start tcpdump capture:\n${err.message || err}`
        );
        outputChannel.appendLine(
          `[ERROR] runCaptureWithPipe() => ${err.message || err}`
        );
    });
}

/**
 * Start capture on an interface using edgeshark/packetflix. 
 * This method builds a 'packetflix:' URI that calls edgeshark.
 */
export async function captureInterfaceWithPacketflix(node: ClabInterfaceTreeNode) {
    if (!node) {
        return vscode.window.showErrorMessage("No interface to capture found.");
    }
    outputChannel.appendLine(`[DEBUG] captureInterfaceWithPacketflix() called for node=${node.nsName} if=${node.name}`);

    // Make sure we have a valid hostname to connect back to
    const hostname = await getHostname();
    if (!hostname) {
        return vscode.window.showErrorMessage(
          "No known hostname/IP address to connect to for packet capture."
        );
    }

    // If it's an IPv6 literal, bracket it. e.g. ::1 => [::1]
    const bracketed = hostname.includes(":") ? `[${hostname}]` : hostname;

    const packetflixUri = `packetflix:ws://${bracketed}:5001/capture?container={"network-interfaces":["${node.name}"],"name":"${node.nsName}","type":"docker"}&nif=${node.name}`;
    outputChannel.appendLine(`[DEBUG] edgeshark/packetflix URI:\n    ${packetflixUri}`);

    vscode.window.showInformationMessage(
      `Starting edgeshark capture on ${node.nsName}/${node.name}...`
    );
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
 * Determine the hostname (or IP) to use for packet capture based on environment:
 *
 * - If a global setting "containerlab.remote.hostname" is set, that value is used.
 * - If in a WSL environment (or SSH in WSL), always return "localhost".
 * - If in an SSH remote session:
 *     - If also in an Orbstack environment:
 *         * Run the "hostname" command.
 *         * If the returned hostname is not fully qualified (doesn't contain a dot),
 *           append ".orb.local" and use that.
 *         * If the hostname is empty or "localhost", fall back to obtaining the IPv4 address.
 *     - Otherwise (SSH but not Orbstack): use the remote IP from SSH_CONNECTION.
 * - If in an Orbstack environment (and not SSH), use the hostname from the "hostname" command.
 *     * If that hostname does not appear fully qualified, append ".orb.local".
 * - Otherwise, if a session hostname is set, use it.
 * - Finally, default to "localhost".
 */
export async function getHostname(): Promise<string> {
  // 1. Global configuration: highest priority.
  const cfgHost = vscode.workspace
    .getConfiguration("containerlab")
    .get<string>("remote.hostname", "");
  if (cfgHost) {
    outputChannel.appendLine(
      `[DEBUG] Using containerlab.remote.hostname from settings: ${cfgHost}`
    );
    return cfgHost;
  }

  // 2. If in a WSL environment, always use "localhost".
  if (vscode.env.remoteName === "wsl") {
    outputChannel.appendLine("[DEBUG] Detected WSL environment; using 'localhost'");
    return "localhost";
  }

  // 3. If in an SSH remote session.
  if (vscode.env.remoteName === "ssh-remote") {
    // 3.a. If also in Orbstack.
    if (utils.isOrbstack()) {
      try {
        let host = execSync("hostname", {
          stdio: ["pipe", "pipe", "ignore"],
        })
          .toString()
          .trim();
        outputChannel.appendLine(
          `[DEBUG] (SSH+Orb) 'hostname' command returned: ${host}`
        );
        if (host && host !== "localhost") {
          // If the hostname is not fully qualified, append ".orb.local"
          if (!host.includes(".")) {
            host = host + ".orb.local";
          }
          outputChannel.appendLine(`[DEBUG] (SSH+Orb) Using hostname: ${host}`);
          return host;
        } else {
          outputChannel.appendLine(
            `[DEBUG] (SSH+Orb) Hostname is empty or "localhost"; falling back to IPv4`
          );
        }
      } catch (e: any) {
        outputChannel.appendLine(
          `[DEBUG] (SSH+Orb) Error retrieving hostname: ${e.message || e.toString()}`
        );
      }
      // Fallback: try to get an IPv4 address from "ip -4 add show eth0".
      try {
        const ipOutput = execSync("ip -4 add show eth0", {
          stdio: ["pipe", "pipe", "ignore"],
        }).toString();
        const ipMatch = ipOutput.match(/inet (\d+\.\d+\.\d+\.\d+)/);
        if (ipMatch && ipMatch[1]) {
          const ip = ipMatch[1];
          outputChannel.appendLine(
            `[DEBUG] (SSH+Orb) Using IP from 'ip -4 add show eth0': ${ip}`
          );
          return ip;
        }
      } catch (e: any) {
        outputChannel.appendLine(
          `[DEBUG] (SSH+Orb) Error retrieving IPv4: ${e.message || e.toString()}`
        );
      }
    } else {
      // 3.b. SSH remote without Orbstack: use remote IP from SSH_CONNECTION.
      const sshConnection = process.env.SSH_CONNECTION;
      outputChannel.appendLine(`[DEBUG] (SSH non-Orb) SSH_CONNECTION: ${sshConnection}`);
      if (sshConnection) {
        const parts = sshConnection.split(" ");
        if (parts.length >= 3) {
          const remoteIp = parts[2];
          outputChannel.appendLine(
            `[DEBUG] (SSH non-Orb) Using remote IP from SSH_CONNECTION: ${remoteIp}`
          );
          return remoteIp;
        }
      }
    }
  } else {
    // 4. Not SSH remote.
    if (utils.isOrbstack()) {
      // In a local Orbstack environment, use the hostname.
      try {
        let host = execSync("hostname", {
          stdio: ["pipe", "pipe", "ignore"],
        })
          .toString()
          .trim();
        outputChannel.appendLine(`[DEBUG] (Orb non-SSH) 'hostname' command returned: ${host}`);
        if (host && host !== "localhost") {
          if (!host.includes(".")) {
            host = host + ".orb.local";
          }
          outputChannel.appendLine(`[DEBUG] (Orb non-SSH) Using hostname: ${host}`);
          return host;
        }
      } catch (e: any) {
        outputChannel.appendLine(
          `[DEBUG] (Orb non-SSH) Error retrieving hostname: ${e.message || e.toString()}`
        );
      }
    }
  }

  // 5. If a session hostname was manually set, use it.
  if (sessionHostname) {
    outputChannel.appendLine(`[DEBUG] Using sessionHostname: ${sessionHostname}`);
    return sessionHostname;
  }

  // 6. Fallback: default to "localhost".
  outputChannel.appendLine("[DEBUG] No suitable hostname found; defaulting to 'localhost'");
  return "localhost";
}

/**
 * Let user persist a hostname in global user settings if possible.
 * If that fails (e.g. permission issues), fallback to sessionHostname.
 */
async function configureHostname(): Promise<boolean> {
    outputChannel.appendLine("[DEBUG] configureHostname() called.");

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
        outputChannel.appendLine(`[DEBUG] Attempting to store containerlab.remote.hostname=${val}`);
        await vscode.workspace
            .getConfiguration("containerlab")
            .update("remote.hostname", val, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(
          `Global setting "containerlab.remote.hostname" updated to "${val}".`
        );
        // Also store in session so it’s immediate
        sessionHostname = val;
        return true;
    } catch (err: any) {
        outputChannel.appendLine(`[ERROR] Could not persist global setting => ${err?.message || err}`);
        sessionHostname = val;
        vscode.window.showWarningMessage(
            `Could not persist global setting. Using sessionHostname="${val}" for now.`
        );
    }
    return true;
}
