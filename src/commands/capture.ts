import * as vscode from "vscode"
import { execSync } from "child_process";
import { outputChannel } from "../extension";
import * as utils from "../helpers/utils";
import { ClabInterfaceTreeNode } from "../treeView/common";
import { getEdgesharkInstallCmd } from "./edgeshark";

let sessionHostname: string = "";

/**
 * Begin packet capture on an interface.
 */
export async function captureInterface(node: ClabInterfaceTreeNode) {
  if (!node) {
    return vscode.window.showErrorMessage("No interface to capture found.");
  }

  outputChannel.appendLine(`[DEBUG] captureInterface() called for node=${node.parentName}, interface=${node.name}`);
  outputChannel.appendLine(`[DEBUG] remoteName = ${vscode.env.remoteName || "(none)"}; isOrbstack=${utils.isOrbstack()}`);

  // Settings override
  const preferredCaptureMethod = vscode.workspace.getConfiguration("containerlab").get<string>("capture.preferredAction");
  switch (preferredCaptureMethod) {
    case "Edgeshark":
      return captureInterfaceWithPacketflix(node);
    case "Wireshark VNC":
      return captureEdgesharkVNC(node);
  }

  // Default to VNC capture
  return captureEdgesharkVNC(node);
}


// Build the packetflix:ws: URI
async function genPacketflixURI(node: ClabInterfaceTreeNode,
  allSelectedNodes?: ClabInterfaceTreeNode[]  // [CHANGED]
) {
  if (!node) {
    return vscode.window.showErrorMessage("No interface to capture found.");
  }
  outputChannel.appendLine(`[DEBUG] captureInterfaceWithPacketflix() called for node=${node.parentName} if=${node.name}`);

  // Check edgeshark is available on the host
  // - make a simple API call to get version of packetflix
  let edgesharkOk = false
  try {
    const res = await fetch('http://127.0.0.1:5001/version');
    edgesharkOk = res.ok
  } catch {
    // Port is probably closed, edgeshark not running
  }
  if(!edgesharkOk) {
    const selectedOpt = await vscode.window.showInformationMessage("Capture: Edgeshark is not running. Would you like to start it?", { modal: false }, "Yes")
    if(selectedOpt === "Yes") {
      execSync(getEdgesharkInstallCmd())
    }
    else {
      return
    }
  }

  // If user multi‐selected items, we capture them all.
  const selected = allSelectedNodes && allSelectedNodes.length > 0
    ? allSelectedNodes
    : [node];

  // If multiple selected
  if (selected.length > 1) {
    // Check if they are from the same container
    const uniqueContainers = new Set(selected.map(i => i.parentName));
    if (uniqueContainers.size > 1) {
      // from different containers => spawn multiple edgeshark sessions
      outputChannel.appendLine("[DEBUG] Edgeshark multi selection => multiple containers => launching individually");
      for (const nd of selected) {
        await captureInterfaceWithPacketflix(nd); // re-call for single
      }
      return;
    }

    // All from same container => build multi-interface edgeshark link
    return await captureMultipleEdgeshark(selected);
  }

  // [ORIGINAL SINGLE-INTERFACE EDGESHARK LOGIC]
  outputChannel.appendLine(`[DEBUG] captureInterfaceWithPacketflix() single mode for node=${node.parentName}/${node.name}`);

  // Make sure we have a valid hostname
  const hostname = await getHostname();
  if (!hostname) {
    return vscode.window.showErrorMessage(
      "No known hostname/IP address to connect to for packet capture."
    );
  }

  // If it's an IPv6 literal, bracket it. e.g. ::1 => [::1]
  const bracketed = hostname.includes(":") ? `[${hostname}]` : hostname;

  const config = vscode.workspace.getConfiguration("containerlab");
  const packetflixPort = config.get<number>("remote.packetflixPort", 5001);

  const containerStr = encodeURIComponent(`{"network-interfaces":["${node.name}"],"name":"${node.parentName}","type":"docker"}`)

  const uri = `packetflix:ws://${bracketed}:${packetflixPort}/capture?container=${containerStr}&nif=${node.name}`

  vscode.window.showInformationMessage(
    `Starting edgeshark capture on ${node.parentName}/${node.name}...`
  );

  outputChannel.appendLine(`[DEBUG] single-edgeShark => ${uri.toString()}`);

  return [uri, bracketed]
}

// Capture multiple interfaces with Edgeshark
async function captureMultipleEdgeshark(nodes: ClabInterfaceTreeNode[]) {
  const base = nodes[0];
  const ifNames = nodes.map(n => n.name);
  outputChannel.appendLine(`[DEBUG] multi-interface edgeshark for container=${base.parentName} ifaces=[${ifNames.join(", ")}]`);

  // We optionally store "netns" in node if needed.
  const netnsVal = (base as any).netns || 4026532270; // example if you track netns
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
  const packetflixPort = config.get<number>("remote.packetflixPort", 5001);

  const packetflixUri = `packetflix:ws://${bracketed}:${packetflixPort}/capture?container=${containerStr}&nif=${nifParam}`;

  vscode.window.showInformationMessage(
    `Starting multi-interface edgeshark on ${base.parentName} for: ${ifNames.join(", ")}`
  );
  outputChannel.appendLine(`[DEBUG] multi-edgeShark => ${packetflixUri}`);

  return [packetflixUri, bracketed]
}

/**
 * Start capture on an interface using edgeshark/packetflix.
 * This method builds a 'packetflix:' URI that calls edgeshark.
 */
export async function captureInterfaceWithPacketflix(
  node: ClabInterfaceTreeNode,
  allSelectedNodes?: ClabInterfaceTreeNode[]  // [CHANGED]
) {

  const packetflixUri = await genPacketflixURI(node, allSelectedNodes)
  if (!packetflixUri) {
    return
  }

  vscode.env.openExternal(vscode.Uri.parse(packetflixUri[0]));
}

// Capture using Edgeshark + Wireshark via VNC in a webview
export async function captureEdgesharkVNC(
  node: ClabInterfaceTreeNode,
  allSelectedNodes?: ClabInterfaceTreeNode[]  // [CHANGED]
) {

  const packetflixUri = await genPacketflixURI(node, allSelectedNodes)
  if (!packetflixUri) {
    return
  }

  const wsConfig = vscode.workspace.getConfiguration("containerlab")
  const dockerImage = wsConfig.get<string>("capture.wireshark.dockerImage", "ghcr.io/kaelemc/wireshark-vnc-docker:latest")
  const dockerPullPolicy = wsConfig.get<string>("capture.wireshark.pullPolicy", "always")
  const extraDockerArgs = wsConfig.get<string>("capture.wireshark.extraDockerArgs")
  const wiresharkThemeSetting = wsConfig.get<string>("capture.wireshark.theme")
  const keepOpenInBackground = wsConfig.get<boolean>("capture.wireshark.stayOpenInBackground")

  let darkModeEnabled = false;

  switch (wiresharkThemeSetting) {
    case "Dark":
      darkModeEnabled = true
      break;
    case "Light":
      darkModeEnabled = false
      break;
    default: {
      // Follow VS Code system theme
      const vscThemeKind = vscode.window.activeColorTheme.kind
      switch (vscThemeKind) {
        case vscode.ColorThemeKind.Dark:
          darkModeEnabled = true
          break;
        case vscode.ColorThemeKind.HighContrast:
          darkModeEnabled = true
          break;
        default:
          darkModeEnabled = false
          break;
      }
    }
  }

  const darkModeSetting = darkModeEnabled ? "-e DARK_MODE=1" : "";

  // Check if Edgeshark is running and get its network
  let edgesharkNetwork = "";
  try {
    const edgesharkInfo = execSync(`docker ps --filter "name=edgeshark" --format "{{.Names}}" | head -1`, { encoding: 'utf-8' }).trim();
    if (edgesharkInfo) {
      const networks = execSync(`docker inspect ${edgesharkInfo} --format '{{range .NetworkSettings.Networks}}{{.NetworkID}} {{end}}'`, { encoding: 'utf-8' }).trim();
      const networkId = networks.split(' ')[0];
      if (networkId) {
        const networkName = execSync(`docker network inspect ${networkId} --format '{{.Name}}'`, { encoding: 'utf-8' }).trim();
        edgesharkNetwork = `--network ${networkName}`;
      }
    }
  } catch {
    // If we can't find the network, continue without it
  }

  // Get the lab directory from the container labels to mount for saving pcap files
  let volumeMount = "";
  try {
    const labDir = execSync(`docker inspect ${node.parentName} --format '{{index .Config.Labels "clab-node-lab-dir"}}' 2>/dev/null`, { encoding: 'utf-8' }).trim();
    if (labDir && labDir !== '<no value>') {
      // Go up two levels to get the actual lab directory (from node-specific dir to lab root)
      const pathParts = labDir.split('/');
      pathParts.pop(); // Remove node name (e.g., "srl1")
      pathParts.pop(); // Remove lab name (e.g., "clab-vlan")
      const labRootDir = pathParts.join('/');
      volumeMount = `-v "${labRootDir}:/pcaps"`;
      outputChannel.appendLine(`[DEBUG] Mounting lab directory: ${labRootDir} as /pcaps`);
    }
  } catch {
    // If we can't get the lab directory, continue without mounting
  }

  // Replace localhost with host.docker.internal or the actual host IP
  let modifiedPacketflixUri = packetflixUri[0];
  if (modifiedPacketflixUri.includes('localhost') || modifiedPacketflixUri.includes('127.0.0.1')) {
    // When using the edgeshark network, we need to use the edgeshark container name
    if (edgesharkNetwork) {
      modifiedPacketflixUri = modifiedPacketflixUri.replace(/localhost|127\.0\.0\.1/g, 'edgeshark-edgeshark-1');
    } else {
      // Otherwise use host.docker.internal which works on Docker Desktop
      modifiedPacketflixUri = modifiedPacketflixUri.replace(/localhost|127\.0\.0\.1/g, 'host.docker.internal');
    }
  }

  const port = await utils.getFreePort()
  const containerId = await utils.execWithProgress(`docker run -d --rm --pull ${dockerPullPolicy} -p 127.0.0.1:${port}:5800 ${edgesharkNetwork} ${volumeMount} ${darkModeSetting} -e PACKETFLIX_LINK="${modifiedPacketflixUri}" ${extraDockerArgs} --name clab_vsc_ws-${node.parentName}_${node.name}-${Date.now()} ${dockerImage}`, "Starting Wireshark")

  // let vscode port forward for us
  const localUri = vscode.Uri.parse(`http://localhost:${port}`);
  const externalUri = (await vscode.env.asExternalUri(localUri)).toString();

  const panel = vscode.window.createWebviewPanel(
    'clabWiresharkVNC',
    `Wireshark (${node.parentName}:${node.name})`,
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: keepOpenInBackground
    }
  );

  panel.onDidDispose(() => {
    execSync(`docker rm -f ${containerId}`)
  })

  const iframeUrl = externalUri;

  // Show info about where to save pcap files if volume is mounted
  if (volumeMount) {
    vscode.window.showInformationMessage(
      `Wireshark started. Save pcap files to /pcaps to persist them in the lab directory.`
    );
  }

  // Wait a bit for the VNC server to be ready
  setTimeout(() => {
    panel.webview.html = `
    <!DOCTYPE html>
    <html>
      <style>
        html, body {
          margin: 0;
          padding: 0;
          overflow: hidden;
          height: 100%;
          width: 100%;
          background: #1e1e1e;
        }
        iframe {
          border: none;
          position: absolute;
          top: 0;
          left: 0;
          bottom: 0;
          right: 0;
          width: 100%;
          height: 100%;
        }
        .loading {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          color: #ccc;
          font-family: sans-serif;
          text-align: center;
        }
        .info {
          color: #999;
          font-size: 0.9em;
          margin-top: 10px;
        }
      </style>
      <body>
        <div class="loading" id="loading">
          Loading Wireshark...
          ${volumeMount ? '<div class="info">Tip: Save pcap files to /pcaps to persist them in the lab directory</div>' : ''}
        </div>
        <iframe id="vnc-frame" frameborder="0" width="100%" height="100%" style="display: none;"></iframe>
        <script>
          const iframe = document.getElementById('vnc-frame');
          const loading = document.getElementById('loading');
          const url = "${iframeUrl}";

          // Try to load the iframe
          function loadVNC() {
            iframe.src = url;
            iframe.onload = function() {
              loading.style.display = 'none';
              iframe.style.display = 'block';
            };
            iframe.onerror = function() {
              // Retry after a delay
              setTimeout(loadVNC, 1000);
            };
          }

          // Initial delay to ensure VNC server is ready
          setTimeout(loadVNC, 500);

          // Force a reload if the iframe doesn't load within 10 seconds
          setTimeout(() => {
            if (iframe.style.display === 'none') {
              iframe.src = url;
              loading.style.display = 'none';
              iframe.style.display = 'block';
            }
          }, 10000);
        </script>
      </body>
    </html>
    `;
  }, 1000);

}

export async function killAllWiresharkVNCCtrs() {
  const dockerImage = vscode.workspace.getConfiguration("containerlab").get<string>("capture.wireshark.dockerImage", "ghcr.io/kaelemc/wireshark-vnc-docker:latest")
  utils.execWithProgress(`docker rm -f $(docker ps --filter "name=clab_vsc_ws-" --filter "ancestor=${dockerImage}" --format "{{.ID}}")`, "Killing Wireshark container:")
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
 * - If in an Orbstack environment (regardless of SSH), always use the IPv4 address from "ip -4 add show eth0".
 * - If in an SSH remote session (and not Orbstack), use the remote IP from SSH_CONNECTION.
 * - Otherwise, if a session hostname was set, use it.
 * - Otherwise, default to "localhost".
 */
export async function getHostname(): Promise<string> {
  // 1. Global configuration takes highest priority.
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

  // 3. If in an Orbstack environment (whether SSH or not), always use IPv4.
  if (utils.isOrbstack()) {
    try {
      const ipOutput = execSync("ip -4 add show eth0", {
        stdio: ["pipe", "pipe", "ignore"],
      }).toString();
      const ipMatch = ipOutput.match(/inet (\d+\.\d+\.\d+\.\d+)/);
      if (ipMatch && ipMatch[1]) {
        outputChannel.appendLine(
          `[DEBUG] (Orbstack) Using IPv4 from 'ip -4 add show eth0': ${ipMatch[1]}`
        );
        return ipMatch[1];
      } else {
        outputChannel.appendLine(
          "[DEBUG] (Orbstack) Could not extract IPv4 address from 'ip -4 add show eth0'"
        );
      }
    } catch (e: any) {
      outputChannel.appendLine(
        `[DEBUG] (Orbstack) Error retrieving IPv4: ${e.message || e.toString()}`
      );
    }
  }

  // 4. If in an SSH remote session (and not Orbstack), use the remote IP from SSH_CONNECTION.
  if (vscode.env.remoteName === "ssh-remote") {
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

  // 5. If a session hostname was manually set, use it.
  if (sessionHostname) {
    outputChannel.appendLine(`[DEBUG] Using sessionHostname: ${sessionHostname}`);
    return sessionHostname;
  }

  // 6. Fallback: default to "localhost".
  outputChannel.appendLine("[DEBUG] No suitable hostname found; defaulting to 'localhost'");
  return "localhost";
}