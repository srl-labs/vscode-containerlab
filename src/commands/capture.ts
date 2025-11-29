import * as vscode from "vscode"
import { outputChannel, dockerClient, username } from "../extension";
import * as utils from "../utils/index";
import { ClabInterfaceTreeNode } from "../treeView/common";
import { genPacketflixURI } from "../utils/packetflix";
import { DEFAULT_WIRESHARK_VNC_DOCKER_IMAGE, DEFAULT_WIRESHARK_VNC_DOCKER_PULL_POLICY, ImagePullPolicy, WIRESHARK_VNC_CTR_NAME_PREFIX } from "../utils/consts";

export { getHostname, setSessionHostname } from "../utils/packetflix";

/**
 * Begin packet capture on an interface.
 */
export async function captureInterface(
  node: ClabInterfaceTreeNode,
  allSelectedNodes?: ClabInterfaceTreeNode[]
) {
  if (!node) {
    return vscode.window.showErrorMessage("No interface to capture found.");
  }

  outputChannel.debug(`captureInterface() called for node=${node.parentName}, interface=${node.name}`);
  outputChannel.debug(`remoteName = ${vscode.env.remoteName || "(none)"}; isOrbstack=${utils.isOrbstack()}`);

  // Settings override
  const preferredCaptureMethod = vscode.workspace.getConfiguration("containerlab").get<string>("capture.preferredAction");
  switch (preferredCaptureMethod) {
    case "Edgeshark":
      return captureInterfaceWithPacketflix(node, allSelectedNodes);
    case "Wireshark VNC":
      return captureEdgesharkVNC(node, allSelectedNodes);
  }

  // Default to VNC capture
  return captureEdgesharkVNC(node, allSelectedNodes);
}


async function buildPacketflixUri(
  node: ClabInterfaceTreeNode,
  allSelectedNodes?: ClabInterfaceTreeNode[],
  forVNC?: boolean
): Promise<[string, string] | undefined> {
  if (!node) {
    vscode.window.showErrorMessage("No interface to capture found.");
    return undefined;
  }

  const selected = allSelectedNodes && allSelectedNodes.length > 0
    ? allSelectedNodes
    : [node];

  if (selected.length > 1) {
    const uniqueContainers = new Set(selected.map(i => i.parentName));
    if (uniqueContainers.size > 1) {
      outputChannel.debug("Edgeshark multi selection => multiple containers => launching individually");
      for (const nd of selected) {
        if (forVNC) {
          await captureEdgesharkVNC(nd);
        } else {
          await captureInterfaceWithPacketflix(nd);
        }
      }
      return undefined;
    }
  }

  return await genPacketflixURI(selected, forVNC);
}


/**
 * Start capture on an interface using edgeshark/packetflix.
 * This method builds a 'packetflix:' URI that calls edgeshark.
 */
export async function captureInterfaceWithPacketflix(
  node: ClabInterfaceTreeNode,
  allSelectedNodes?: ClabInterfaceTreeNode[]  // [CHANGED]
) {

  const packetflixUri = await buildPacketflixUri(node, allSelectedNodes)
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
    if (!dockerClient) {
      outputChannel.debug("getEdgesharkNetwork() failed: docker client unavailable.")
      return "";
    }
    // List containers using edgeshark as name filter
    const containers = await dockerClient.listContainers({
      filters: { name: ['edgeshark'] }
    });

    if (containers.length === 0) {
      return "";
    }

    // get info of the 0th ctr
    const container = dockerClient.getContainer(containers[0].Id);
    const containerInfo = await container.inspect();

    const networks = containerInfo.NetworkSettings.Networks || {};
    const networkIds = Object.values(networks).map((net: any) => net.NetworkID).filter(Boolean);

    if (networkIds.length === 0) {
      return "";
    }

    const networkId = networkIds[0];
    if (!networkId) {
      return "";
    }

    // Get network name from network ID
    const network = dockerClient.getNetwork(networkId);
    const networkInfo = await network.inspect();
    const netName = networkInfo.Name;

    if (netName) {
      return `--network ${netName}`;
    }
  } catch {
    // ignore
  }
  return ""
}

async function getVolumeMount(nodeName: string): Promise<string> {
  try {
    if (!dockerClient) {
      outputChannel.debug("getVolumeMount() failed: docker client unavailable.")
      return "";
    }

    const container = dockerClient.getContainer(nodeName);
    const containerInfo = await container.inspect();
    const labDir = containerInfo.Config.Labels?.['clab-node-lab-dir'];

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

const VOLUME_MOUNT_REGEX = /-v\s+"?([^"]+)"?/;

function buildVolumeBinds(volumeMount?: string): string[] {
  if (!volumeMount) {
    return [];
  }
  const match = VOLUME_MOUNT_REGEX.exec(volumeMount);
  return match ? [match[1]] : [];
}

function buildWiresharkEnvVars(packetflixLink: string, themeSetting?: string): string[] {
  const env = [`PACKETFLIX_LINK=${packetflixLink}`];
  if (isDarkModeEnabled(themeSetting)) {
    env.push('DARK_MODE=1');
  }
  return env;
}

type WiresharkContainerOptions = {
  dockerImage: string;
  dockerPullPolicy: ImagePullPolicy.Always | ImagePullPolicy.Missing | ImagePullPolicy.Never;
  edgesharkNetwork: string;
  volumeMount?: string;
  packetflixUri: string;
  themeSetting?: string;
  ctrName: string;
  port: number;
};

async function startWiresharkContainer(options: WiresharkContainerOptions): Promise<string | undefined> {
  if (!dockerClient) {
    outputChannel.debug("captureEdgesharkVNC() failed: docker client unavailable.")
    vscode.window.showErrorMessage("Unable to start capture: Docker client unavailable")
    return undefined;
  }

  try {
    await utils.checkAndPullDockerImage(options.dockerImage, options.dockerPullPolicy);

    const networkName = options.edgesharkNetwork.replace('--network ', '').trim();
    const volumeBinds = buildVolumeBinds(options.volumeMount);
    const env = buildWiresharkEnvVars(options.packetflixUri, options.themeSetting);

    const container = await dockerClient.createContainer({
      Image: options.dockerImage,
      name: options.ctrName,
      Env: env,
      HostConfig: {
        AutoRemove: true,
        PortBindings: {
          '5800/tcp': [{ HostIp: '127.0.0.1', HostPort: options.port.toString() }]
        },
        NetworkMode: networkName || 'bridge',
        Binds: volumeBinds.length > 0 ? volumeBinds : undefined
      }
    });
    await container.start();
    outputChannel.info(`Started Wireshark VNC container: ${container.id}`);
    return container.id;
  } catch (err: any) {
    vscode.window.showErrorMessage(`Starting Wireshark: ${err.message || String(err)}`);
    return undefined;
  }
}

// Capture using Edgeshark + Wireshark via VNC in a webview
export async function captureEdgesharkVNC(node: ClabInterfaceTreeNode, allSelectedNodes?: ClabInterfaceTreeNode[]) {

  // Handle settings
  const wsConfig = vscode.workspace.getConfiguration("containerlab");
  const dockerImage = wsConfig.get<string>("capture.wireshark.dockerImage", DEFAULT_WIRESHARK_VNC_DOCKER_IMAGE);
  const dockerPullPolicy = wsConfig.get<ImagePullPolicy.Always | ImagePullPolicy.Missing | ImagePullPolicy.Never>("capture.wireshark.pullPolicy", DEFAULT_WIRESHARK_VNC_DOCKER_PULL_POLICY);
  const wiresharkThemeSetting = wsConfig.get<string>("capture.wireshark.theme");
  const keepOpenInBackground = wsConfig.get<boolean>("capture.wireshark.stayOpenInBackground");

  const packetflixUri = await buildPacketflixUri(node, allSelectedNodes, true)
  if (!packetflixUri) {
    return
  }
  const edgesharkNetwork = await getEdgesharkNetwork()
  const volumeMount = await getVolumeMount(node.parentName)
  const modifiedPacketflixUri = adjustPacketflixHost(packetflixUri[0], edgesharkNetwork)

  const port = await utils.getFreePort()
  const ctrName = utils.sanitize(`${WIRESHARK_VNC_CTR_NAME_PREFIX}-${username}-${node.parentName}_${node.name}-${Date.now()}`)
  const containerId = await startWiresharkContainer({
    dockerImage,
    dockerPullPolicy,
    edgesharkNetwork,
    volumeMount,
    packetflixUri: modifiedPacketflixUri,
    themeSetting: wiresharkThemeSetting,
    ctrName,
    port
  });
  if (!containerId) {
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

  panel.onDidDispose(async () => {
    try {
      if (!dockerClient) {
        outputChannel.debug("captureEdgesharkVNC() VNC webview dispose failed: docker client unavailable.")
        return;
      }
      if (!containerId) {
        outputChannel.debug("captureEdgesharkVNC() VNC webview dispose failed: nil container ID.")
        return;
      }
      const container = dockerClient.getContainer(containerId);
      await container.stop();
      outputChannel.info(`Stopped Wireshark VNC container: ${containerId}`);
    } catch {
      // ignore
    }
  })

  const iframeUrl = externalUri;

  // Show info about where to save pcap files if volume is mounted
  if (volumeMount) {
    vscode.window.showInformationMessage(
      `Wireshark started. Save pcap files to /pcaps to persist them in the lab directory.`
    );
  }

  panel.webview.html = buildWiresharkVncHtml(iframeUrl, Boolean(volumeMount));

  const readinessMonitor = createVncReadinessMonitor(panel, localUri.toString(), iframeUrl);

  panel.webview.onDidReceiveMessage(message => {
    if (!message || typeof message !== 'object') {
      return;
    }

    if ((message as { type?: string }).type === 'retry-check') {
      readinessMonitor.start(true);
    }
  });

  // Readiness checks are triggered by the webview via postMessage.
}

function buildWiresharkVncHtml(iframeUrl: string, showVolumeTip: boolean): string {
  const volumeTip = showVolumeTip
    ? '<div class="info">Tip: Save pcap files to /pcaps to persist them in the lab directory</div>'
    : ''

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; frame-src https: http:; connect-src https: http:;" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Wireshark Capture</title>
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
          .retry-info {
            color: #888;
            font-size: 0.85em;
            margin-top: 15px;
          }
        </style>
      </head>
      <body>
        <div class="loading" id="loading">
          Loading Wireshark...
          ${volumeTip}
          <div class="retry-info" id="retry-info"></div>
        </div>
        <iframe id="vnc-frame" frameborder="0" width="100%" height="100%" style="display: none;"></iframe>
        <script>
          (function() {
            const vscode = acquireVsCodeApi();
            const iframe = document.getElementById('vnc-frame');
            const loading = document.getElementById('loading');
            const retryInfo = document.getElementById('retry-info');
            let pendingRetry = false;
            const fallbackUrl = ${JSON.stringify(iframeUrl)};
            let latestUrl = fallbackUrl;

            function appendCacheBuster(url) {
              const separator = url.includes('?') ? '&' : '?';
              return url + separator + 't=' + Date.now();
            }

            function loadVNC(url, forceReload) {
              const nextUrl = url || latestUrl || fallbackUrl;
              if (!nextUrl) {
                return;
              }

              latestUrl = nextUrl;
              const targetUrl = forceReload ? appendCacheBuster(nextUrl) : nextUrl;
              loading.style.display = 'block';
              iframe.style.display = 'none';
              iframe.src = targetUrl;
            }

            iframe.onload = function() {
              loading.style.display = 'none';
              iframe.style.display = 'block';
              retryInfo.textContent = '';
              pendingRetry = false;
            };

            iframe.onerror = function() {
              loading.style.display = 'block';
              iframe.style.display = 'none';
              retryInfo.textContent = 'Connection failed - retrying...';
              if (!pendingRetry) {
                pendingRetry = true;
                vscode.postMessage({ type: 'retry-check' });
              }
            };

            window.addEventListener('message', function(event) {
              const message = event.data || {};
              if (!message || !message.type) {
                return;
              }

              switch (message.type) {
                case 'vnc-progress': {
                  pendingRetry = false;
                  const attempt = typeof message.attempt === 'number' ? message.attempt : 0;
                  const maxAttempts = typeof message.maxAttempts === 'number' ? message.maxAttempts : 0;
                  if (attempt <= 1) {
                    retryInfo.textContent = 'Waiting for VNC server...';
                  } else if (maxAttempts > 0) {
                    retryInfo.textContent = 'Waiting for VNC server... (attempt ' + attempt + '/' + maxAttempts + ')';
                  } else {
                    retryInfo.textContent = 'Waiting for VNC server... (attempt ' + attempt + ')';
                  }
                  break;
                }
                case 'vnc-ready': {
                  pendingRetry = false;
                  retryInfo.textContent = 'VNC server ready, loading...';
                  loadVNC(message.url, false);
                  break;
                }
                case 'vnc-timeout': {
                  pendingRetry = false;
                  retryInfo.textContent = 'Connection timeout - attempting to load anyway...';
                  loadVNC(message.url, true);
                  break;
                }
                default:
                  break;
              }
            });

            vscode.postMessage({ type: 'retry-check' });
          })();
        </script>
      </body>
    </html>
  `
}

type VncMonitorToken = { cancelled: boolean }

function createVncReadinessMonitor(panel: vscode.WebviewPanel, localUrl: string, iframeUrl: string) {
  let disposed = false
  let currentToken: VncMonitorToken | undefined

  panel.onDidDispose(() => {
    disposed = true
    if (currentToken) {
      currentToken.cancelled = true
    }
  })

  const start = (force = false) => {
    if (disposed) {
      return
    }
    if (currentToken && !force) {
      return
    }

    if (currentToken) {
      currentToken.cancelled = true
    }

    const token: VncMonitorToken = { cancelled: false }
    currentToken = token

    void runVncReadinessLoop(panel, localUrl, iframeUrl, token, () => disposed)
      .finally(() => {
        if (currentToken === token) {
          currentToken = undefined
        }
      })
  }

  return { start }
}

async function runVncReadinessLoop(
  panel: vscode.WebviewPanel,
  localUrl: string,
  iframeUrl: string,
  token: VncMonitorToken,
  isDisposed: () => boolean
): Promise<void> {
  const maxAttempts = 60
  const delayMs = 1000

  if (isDisposed() || token.cancelled) {
    return
  }

  await utils.tryPostMessage(panel, { type: 'vnc-progress', attempt: 0, maxAttempts })

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (isDisposed() || token.cancelled) {
      return
    }

    const ready = await utils.isHttpEndpointReady(localUrl)
    if (isDisposed() || token.cancelled) {
      return
    }

    if (ready) {
      await utils.tryPostMessage(panel, { type: 'vnc-ready', url: iframeUrl })
      return
    }

    await utils.tryPostMessage(panel, { type: 'vnc-progress', attempt, maxAttempts })
    await utils.delay(delayMs)
  }

  if (!isDisposed() && !token.cancelled) {
    await utils.tryPostMessage(panel, { type: 'vnc-timeout', url: iframeUrl })
  }
}

export async function killAllWiresharkVNCCtrs() {
  const dockerImage = vscode.workspace.getConfiguration("containerlab").get<string>("capture.wireshark.dockerImage", DEFAULT_WIRESHARK_VNC_DOCKER_IMAGE)
  try {
    if (!dockerClient) {
      outputChannel.debug("killAllWiresharkVNCCtrs() failed: docker client unavailable.")
    }

    const ctrNamePrefix = `${WIRESHARK_VNC_CTR_NAME_PREFIX}-${username}`;

    // List containers which have that name + use the configured image
    const containers = await dockerClient.listContainers({
      filters: {
        name: [ctrNamePrefix],
        ancestor: [dockerImage]
      }
    });

    if (containers.length > 0) {
      // equivalent of docker rm -f for each container
      await Promise.all(
        containers.map(async (containerInfo: any) => {
          try {
            const container = dockerClient.getContainer(containerInfo.Id);
            await container.remove(
              {
                force: true
              }
            );
            outputChannel.info(`Removed Wireshark VNC container: ${containerInfo.Id}`);
          } catch (err) {
            outputChannel.warn(`Failed to remove container ${containerInfo.Id}: ${err}`);
          }
        })
      );
    }
  } catch (err: any) {
    vscode.window.showErrorMessage(`Failed to remove Wireshark VNC containers: ${err.message}`);
  }
}
