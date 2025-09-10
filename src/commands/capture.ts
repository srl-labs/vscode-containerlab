import * as vscode from "vscode"
import * as os from "os";
import { outputChannel } from "../extension";
import * as utils from "../helpers/utils";
import { ClabInterfaceTreeNode } from "../treeView/common";
import { installEdgeshark } from "./edgeshark";

let sessionHostname: string = "";

/**
 * Begin packet capture on an interface.
 */
export async function captureInterface(node: ClabInterfaceTreeNode) {
  if (!node) {
    return vscode.window.showErrorMessage("No interface to capture found.");
  }

  outputChannel.debug(`captureInterface() called for node=${node.parentName}, interface=${node.name}`);
  outputChannel.debug(`remoteName = ${vscode.env.remoteName || "(none)"}; isOrbstack=${utils.isOrbstack()}`);

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
  outputChannel.debug(`captureInterfaceWithPacketflix() called for node=${node.parentName} if=${node.name}`);

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
      await installEdgeshark()
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
      outputChannel.debug("Edgeshark multi selection => multiple containers => launching individually");
      for (const nd of selected) {
        await captureInterfaceWithPacketflix(nd); // re-call for single
      }
      return;
    }

    // All from same container => build multi-interface edgeshark link
    return await captureMultipleEdgeshark(selected);
  }

  // [ORIGINAL SINGLE-INTERFACE EDGESHARK LOGIC]
  outputChannel.debug(`captureInterfaceWithPacketflix() single mode for node=${node.parentName}/${node.name}`);

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

  outputChannel.debug(`single-edgeShark => ${uri.toString()}`);

  return [uri, bracketed]
}

// Capture multiple interfaces with Edgeshark
async function captureMultipleEdgeshark(nodes: ClabInterfaceTreeNode[]) {
  const base = nodes[0];
  const ifNames = nodes.map(n => n.name);
  outputChannel.debug(`multi-interface edgeshark for container=${base.parentName} ifaces=[${ifNames.join(", ")}]`);

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
  outputChannel.debug(`multi-edgeShark => ${packetflixUri}`);

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

function isDarkModeEnabled(themeSetting?: string): boolean {
  switch (themeSetting) {
    case "Dark":
      return true
    case "Light":
      return false
    default: {
      const vscThemeKind = vscode.window.activeColorTheme.kind
      return (
        vscThemeKind === vscode.ColorThemeKind.Dark ||
        vscThemeKind === vscode.ColorThemeKind.HighContrast
      )
    }
  }
}

async function getEdgesharkNetwork(): Promise<string> {
  try {
    const psOut = await utils.runWithSudo(`docker ps --filter "name=edgeshark" --format "{{.Names}}"`, 'List edgeshark containers', outputChannel, 'generic', true) as string;
    const firstName = (psOut || '').split(/\r?\n/).find(Boolean)?.trim() || '';
    if (firstName) {
      const netsOut = await utils.runWithSudo(`docker inspect ${firstName} --format '{{range .NetworkSettings.Networks}}{{.NetworkID}} {{end}}'`, 'Inspect edgeshark networks', outputChannel, 'generic', true) as string;
      const networkId = (netsOut || '').trim().split(/\s+/)[0] || '';
      if (networkId) {
        const nameOut = await utils.runWithSudo(`docker network inspect ${networkId} --format '{{.Name}}'`, 'Inspect network name', outputChannel, 'generic', true) as string;
        const netName = (nameOut || '').trim();
        if (netName) return `--network ${netName}`;
      }
    }
  } catch {
    // ignore
  }
  return ""
}

async function getVolumeMount(nodeName: string): Promise<string> {
  try {
    const out = await utils.runWithSudo(
      `docker inspect ${nodeName} --format '{{index .Config.Labels "clab-node-lab-dir"}}'`,
      'Inspect lab dir label',
      outputChannel,
      'generic',
      true
    ) as string;
    const labDir = (out || '').trim();
    if (labDir && labDir !== '<no value>') {
      const pathParts = labDir.split('/')
      pathParts.pop()
      pathParts.pop()
      const labRootDir = pathParts.join('/')
      outputChannel.debug(`Mounting lab directory: ${labRootDir} as /pcaps`)
      return `-v "${labRootDir}:/pcaps"`
    }
  } catch {
    // ignore
  }
  return ""
}

function adjustPacketflixHost(uri: string, edgesharkNetwork: string): string {
  if (uri.includes('localhost') || uri.includes('127.0.0.1')) {
    return edgesharkNetwork
      ? uri.replace(/localhost|127\.0\.0\.1/g, 'edgeshark-edgeshark-1')
      : uri.replace(/localhost|127\.0\.0\.1/g, 'host.docker.internal')
  }
  return uri
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

  const darkModeSetting = isDarkModeEnabled(wiresharkThemeSetting) ? "-e DARK_MODE=1" : ""
  const edgesharkNetwork = await getEdgesharkNetwork()
  const volumeMount = await getVolumeMount(node.parentName)
  const modifiedPacketflixUri = adjustPacketflixHost(packetflixUri[0], edgesharkNetwork)

  const port = await utils.getFreePort()
  const ctrName = utils.sanitize(`clab_vsc_ws-${node.parentName}_${node.name}-${Date.now()}`)
  let containerId = '';
  try {
    const command = `docker run -d --rm --pull ${dockerPullPolicy} -p 127.0.0.1:${port}:5800 ${edgesharkNetwork} ${volumeMount} ${darkModeSetting} -e PACKETFLIX_LINK="${modifiedPacketflixUri}" ${extraDockerArgs || ''} --name ${ctrName} ${dockerImage}`;
    const out = await utils.runWithSudo(command, 'Start Wireshark VNC', outputChannel, 'generic', true, true) as string;
    containerId = (out || '').trim().split(/\s+/)[0] || '';
  } catch (err: any) {
    vscode.window.showErrorMessage(`Starting Wireshark: ${err.message || String(err)}`);
    return;
  }

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
    void utils.runWithSudo(`docker rm -f ${containerId}`, 'Remove Wireshark container', outputChannel).catch(() => undefined);
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

          // Poll the VNC server until it's reachable, then load it
          function checkVNCReady() {
            fetch(url, { mode: 'no-cors' })
              .then(() => loadVNC())
              .catch(() => setTimeout(checkVNCReady, 500));
          }

          checkVNCReady();

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
  try {
    const idsOut = await utils.runWithSudo(
      `docker ps --filter "name=clab_vsc_ws-" --filter "ancestor=${dockerImage}" --format "{{.ID}}"`,
      'List Wireshark VNC containers',
      outputChannel,
      'generic',
      true
    ) as string;
    const ids = (idsOut || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    if (ids.length > 0) {
      await utils.runWithSudo(`docker rm -f ${ids.join(' ')}`, 'Remove Wireshark VNC containers', outputChannel);
    }
  } catch (err: any) {
    vscode.window.showErrorMessage(`Killing Wireshark container: ${err.message || String(err)}`);
  }
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
    outputChannel.debug(
      `Using containerlab.remote.hostname from settings: ${cfgHost}`
    );
    return cfgHost;
  }

  // 2. If in a WSL environment, always use "localhost".
  if (vscode.env.remoteName === "wsl") {
    outputChannel.debug("Detected WSL environment; using 'localhost'");
    return "localhost";
  }

  // 3. If in an Orbstack environment (whether SSH or not), always use IPv4.
  if (utils.isOrbstack()) {
    try {
      const nets = os.networkInterfaces();
      const eth0 = nets['eth0'] || [];
      const v4 = (eth0 as any[]).find((n: any) => (n.family === 'IPv4' || n.family === 4) && !n.internal);
      if (v4 && v4.address) {
        outputChannel.debug(`(Orbstack) Using IPv4 from networkInterfaces: ${v4.address}`);
        return v4.address as string;
      }
      outputChannel.debug("(Orbstack) Could not determine IPv4 from networkInterfaces");
    } catch (e: any) {
      outputChannel.debug(`(Orbstack) Error retrieving IPv4: ${e.message || e.toString()}`);
    }
  }

  // 4. If in an SSH remote session (and not Orbstack), use the remote IP from SSH_CONNECTION.
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

  // 5. If a session hostname was manually set, use it.
  if (sessionHostname) {
    outputChannel.debug(`Using sessionHostname: ${sessionHostname}`);
    return sessionHostname;
  }

  // 6. Fallback: default to "localhost".
  outputChannel.debug("No suitable hostname found; defaulting to 'localhost'");
  return "localhost";
}
