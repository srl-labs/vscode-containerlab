import * as os from "os";

import * as vscode from "vscode";


import type * as c from "../treeView/common";
import { outputChannel } from "../globals";

import * as utils from "./utils";

let sessionHostname = "";

/**
 * Generate a packetflix URI for one or more interfaces. Assumes all nodes belong
 * to the same container when multiple nodes are provided.
 */
export async function genPacketflixURI(
  selectedNodes: c.ClabInterfaceTreeNode[],
  forVNC?: boolean
): Promise<[string, string] | undefined> {
  if (!selectedNodes || selectedNodes.length === 0) {
    vscode.window.showErrorMessage("No interface to capture found.");
    return undefined;
  }

  const edgesharkReady = await ensureEdgesharkAvailable();
  if (!edgesharkReady) {
    return undefined;
  }

  if (selectedNodes.length > 1) {
    return await captureMultipleEdgeshark(selectedNodes);
  }

  const node = selectedNodes[0];
  outputChannel.debug(`genPacketflixURI() single mode for node=${node.parentName}/${node.name}`);

  const hostname = forVNC ? "127.0.0.1" : await getHostname();
  if (!hostname) {
    vscode.window.showErrorMessage(
      "No known hostname/IP address to connect to for packet capture."
    );
    return undefined;
  }

  const bracketed = hostname.includes(":") ? `[${hostname}]` : hostname;

  const config = vscode.workspace.getConfiguration("containerlab");
  const packetflixPort = config.get<number>("capture.packetflixPort", 5001);

  const containerStr = encodeURIComponent(
    `{"network-interfaces":["${node.name}"],"name":"${node.parentName}","type":"docker"}`
  );

  const uri = `packetflix:ws://${bracketed}:${packetflixPort}/capture?container=${containerStr}&nif=${node.name}`;

  vscode.window.showInformationMessage(
    `Starting edgeshark capture on ${node.parentName}/${node.name}...`
  );

  outputChannel.debug(`single-edgeShark => ${uri}`);

  return [uri, bracketed];
}

// Ensure Edgeshark API is up; optionally prompt to start it
async function ensureEdgesharkAvailable(): Promise<boolean> {
  let edgesharkOk = false;
  try {
    const res = await fetch("http://127.0.0.1:5001/version");
    edgesharkOk = res.ok;
  } catch {
    // Port is probably closed, edgeshark not running
  }
  if (edgesharkOk) return true;

  const selectedOpt = await vscode.window.showInformationMessage(
    "Capture: Edgeshark is not running. Would you like to start it?",
    { modal: false },
    "Yes"
  );
  if (selectedOpt === "Yes") {
    // Dynamic import to avoid circular dependency
    const { installEdgeshark } = await import("../commands/edgeshark");
    await installEdgeshark();

    const maxRetries = 30;
    const delayMs = 1000;
    for (let i = 0; i < maxRetries; i++) {
      try {
        const res = await fetch("http://127.0.0.1:5001/version");
        if (res.ok) {
          return true;
        }
      } catch {
        // wait and retry
      }
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    vscode.window.showErrorMessage("Edgeshark did not start in time. Please try again.");
    return false;
  }
  return false;
}

// Capture multiple interfaces with Edgeshark
async function captureMultipleEdgeshark(nodes: c.ClabInterfaceTreeNode[]): Promise<[string, string]> {
  const base = nodes[0];
  const ifNames = nodes.map(n => n.name);
  outputChannel.debug(`multi-interface edgeshark for container=${base.parentName} ifaces=[${ifNames.join(", ")}]`);

  const netnsVal = (base as any).netns || 4026532270;
  const containerObj = {
    netns: netnsVal,
    "network-interfaces": ifNames,
    name: base.parentName,
    type: "docker",
    prefix: ""
  };

  const containerStr = encodeURIComponent(JSON.stringify(containerObj));
  const nifParam = encodeURIComponent(ifNames.join("/"));

  const hostname = await getHostname();
  const bracketed = hostname.includes(":") ? `[${hostname}]` : hostname;
  const config = vscode.workspace.getConfiguration("containerlab");
  const packetflixPort = config.get<number>("capture.packetflixPort", 5001);

  const packetflixUri = `packetflix:ws://${bracketed}:${packetflixPort}/capture?container=${containerStr}&nif=${nifParam}`;

  vscode.window.showInformationMessage(
    `Starting multi-interface edgeshark on ${base.parentName} for: ${ifNames.join(", ")}`
  );
  outputChannel.debug(`multi-edgeShark => ${packetflixUri}`);

  return [packetflixUri, bracketed];
}

/**
 * If a user calls the "Set session hostname" command, we store it in-memory here,
 * overriding the auto-detected or config-based hostname until the user closes VS Code.
 */
export async function setSessionHostname(): Promise<boolean> {
  const opts: vscode.InputBoxOptions = {
    title: `Configure hostname for Containerlab remote (this session only)`,
    placeHolder: `IPv4, IPv6 or DNS resolvable hostname of the system where containerlab is running`,
    prompt: "This will persist for only this session of VS Code.",
    validateInput: (input: string): string | undefined => {
      if (input.trim().length === 0) {
        return "Input should not be empty";
      }
      return undefined;
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

function resolveOrbstackIPv4(): string | undefined {
  try {
    const nets = os.networkInterfaces();
    const eth0 = nets["eth0"] ?? [];
    const v4 = (eth0 as any[]).find(
      (n: any) => (n.family === "IPv4" || n.family === 4) && !n.internal
    );
    return v4?.address as string | undefined;
  } catch (e: any) {
    outputChannel.debug(`(Orbstack) Error retrieving IPv4: ${e.message || e.toString()}`);
    return undefined;
  }
}

/**
 * Determine the hostname (or IP) to use for packet capture based on environment.
 */
export async function getHostname(): Promise<string> {
  const cfgHost = vscode.workspace
    .getConfiguration("containerlab")
    .get<string>("capture.remoteHostname", "");
  if (cfgHost) {
    outputChannel.debug(
      `Using containerlab.capture.remoteHostname from settings: ${cfgHost}`
    );
    return cfgHost;
  }

  if (vscode.env.remoteName === "wsl") {
    outputChannel.debug("Detected WSL environment; using 'localhost'");
    return "localhost";
  }

  if (utils.isOrbstack()) {
    const v4 = resolveOrbstackIPv4();
    if (v4) {
      outputChannel.debug(`(Orbstack) Using IPv4 from networkInterfaces: ${v4}`);
      return v4;
    }
    outputChannel.debug("(Orbstack) Could not determine IPv4 from networkInterfaces");
  }

  if (vscode.env.remoteName === "ssh-remote") {
    const sshConnection = process.env.SSH_CONNECTION;
    outputChannel.debug(`(SSH non-Orb) SSH_CONNECTION: ${sshConnection}`);
    if (sshConnection) {
      const parts = sshConnection.split(" ");
      if (parts.length >= 3) {
        const remoteIp = parts[2];
        outputChannel.debug(
          `(SSH non-Orb) Using remote IP from SSH_CONNECTION: ${remoteIp}`
        );
        return remoteIp;
      }
    }
  }

  if (sessionHostname) {
    outputChannel.debug(`Using sessionHostname: ${sessionHostname}`);
    return sessionHostname;
  }

  outputChannel.debug("No suitable hostname found; defaulting to 'localhost'");
  return "localhost";
}
