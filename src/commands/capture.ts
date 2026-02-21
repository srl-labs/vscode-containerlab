import * as vscode from "vscode";

import { outputChannel, dockerClient, username } from "../globals";
import * as utils from "../utils";
import type { ClabInterfaceTreeNode } from "../treeView/common";
import { genPacketflixURI, getHostname, setSessionHostname } from "../utils/packetflix";
import type { ImagePullPolicy } from "../utils/consts";
import { getWiresharkVncWebviewHtml } from "../webviews/wiresharkVnc/wiresharkVncWebviewHtml";
import {
  DEFAULT_WIRESHARK_VNC_DOCKER_IMAGE,
  DEFAULT_WIRESHARK_VNC_DOCKER_PULL_POLICY,
  WIRESHARK_VNC_CTR_NAME_PREFIX
} from "../utils/consts";

export { getHostname, setSessionHostname };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Begin packet capture on an interface.
 */
export async function captureInterface(
  node: ClabInterfaceTreeNode,
  allSelectedNodes?: ClabInterfaceTreeNode[]
) {
  outputChannel.debug(
    `captureInterface() called for node=${node.parentName}, interface=${node.name}`
  );
  outputChannel.debug(
    `remoteName = ${vscode.env.remoteName ?? "(none)"}; isOrbstack=${utils.isOrbstack()}`
  );

  // Settings override
  const preferredCaptureMethod = vscode.workspace
    .getConfiguration("containerlab")
    .get<string>("capture.preferredAction");
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
  const selected = allSelectedNodes && allSelectedNodes.length > 0 ? allSelectedNodes : [node];

  if (selected.length > 1) {
    const uniqueContainers = new Set(selected.map((i) => i.parentName));
    if (uniqueContainers.size > 1) {
      outputChannel.debug(
        "Edgeshark multi selection => multiple containers => launching individually"
      );
      for (const nd of selected) {
        if (forVNC === true) {
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
  allSelectedNodes?: ClabInterfaceTreeNode[] // [CHANGED]
) {
  const packetflixUri = await buildPacketflixUri(node, allSelectedNodes);
  if (!packetflixUri) {
    return;
  }

  vscode.env.openExternal(vscode.Uri.parse(packetflixUri[0]));
}

function isDarkModeEnabled(themeSetting?: string): boolean {
  switch (themeSetting) {
    case "Dark":
      return true;
    case "Light":
      return false;
    default: {
      const vscThemeKind = vscode.window.activeColorTheme.kind;
      return (
        vscThemeKind === vscode.ColorThemeKind.Dark ||
        vscThemeKind === vscode.ColorThemeKind.HighContrast
      );
    }
  }
}

async function getEdgesharkNetwork(): Promise<string> {
  try {
    // List containers using edgeshark as name filter
    const containers = await dockerClient.listContainers({
      filters: { name: ["edgeshark"] }
    });

    if (containers.length === 0) {
      return "";
    }

    // get info of the 0th ctr
    const container = dockerClient.getContainer(containers[0].Id);
    const containerInfo = await container.inspect();

    const networks = containerInfo.NetworkSettings.Networks;
    const networkIds = Object.values(networks)
      .map((net) => (net as { NetworkID?: string }).NetworkID)
      .filter((id): id is string => Boolean(id));

    if (networkIds.length === 0) {
      return "";
    }

    const networkId: string = networkIds[0];

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
  return "";
}

async function getVolumeMount(nodeName: string): Promise<string> {
  try {
    const container = dockerClient.getContainer(nodeName);
    const containerInfo = await container.inspect();
    const labDir = containerInfo.Config.Labels["clab-node-lab-dir"];

    if (labDir.length > 0 && labDir !== "<no value>") {
      const pathParts = labDir.split("/");
      pathParts.pop();
      pathParts.pop();
      const labRootDir = pathParts.join("/");
      outputChannel.debug(`Mounting lab directory: ${labRootDir} as /pcaps`);
      return `-v "${labRootDir}:/pcaps"`;
    }
  } catch {
    // ignore
  }
  return "";
}

function adjustPacketflixHost(uri: string, edgesharkNetwork: string): string {
  if (uri.includes("localhost") || uri.includes("127.0.0.1")) {
    return edgesharkNetwork
      ? uri.replace(/localhost|127\.0\.0\.1/g, "edgeshark-edgeshark-1")
      : uri.replace(/localhost|127\.0\.0\.1/g, "host.docker.internal");
  }
  return uri;
}

const VOLUME_MOUNT_REGEX = /-v\s+"?([^"]+)"?/;

function buildVolumeBinds(volumeMount?: string): string[] {
  if (volumeMount == null || volumeMount.length === 0) {
    return [];
  }
  const match = VOLUME_MOUNT_REGEX.exec(volumeMount);
  return match ? [match[1]] : [];
}

function buildWiresharkEnvVars(packetflixLink: string, themeSetting?: string): string[] {
  const env = [`PACKETFLIX_LINK=${packetflixLink}`];
  if (isDarkModeEnabled(themeSetting)) {
    env.push("DARK_MODE=1");
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

async function startWiresharkContainer(
  options: WiresharkContainerOptions
): Promise<string | undefined> {
  try {
    await utils.checkAndPullDockerImage(options.dockerImage, options.dockerPullPolicy);

    const networkName = options.edgesharkNetwork.replace("--network ", "").trim();
    const volumeBinds = buildVolumeBinds(options.volumeMount);
    const env = buildWiresharkEnvVars(options.packetflixUri, options.themeSetting);

    const container = await dockerClient.createContainer({
      Image: options.dockerImage,
      name: options.ctrName,
      Env: env,
      HostConfig: {
        AutoRemove: true,
        PortBindings: {
          "5800/tcp": [{ HostIp: "127.0.0.1", HostPort: options.port.toString() }]
        },
        NetworkMode: networkName || "bridge",
        Binds: volumeBinds.length > 0 ? volumeBinds : undefined
      }
    });
    await container.start();
    outputChannel.info(`Started Wireshark VNC container: ${container.id}`);
    return container.id;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Starting Wireshark: ${message}`);
    return undefined;
  }
}

// Capture using Edgeshark + Wireshark via VNC in a webview
export async function captureEdgesharkVNC(
  node: ClabInterfaceTreeNode,
  allSelectedNodes?: ClabInterfaceTreeNode[]
) {
  // Handle settings
  const wsConfig = vscode.workspace.getConfiguration("containerlab");
  const dockerImage = wsConfig.get<string>(
    "capture.wireshark.dockerImage",
    DEFAULT_WIRESHARK_VNC_DOCKER_IMAGE
  );
  const dockerPullPolicy = wsConfig.get<
    ImagePullPolicy.Always | ImagePullPolicy.Missing | ImagePullPolicy.Never
  >("capture.wireshark.pullPolicy", DEFAULT_WIRESHARK_VNC_DOCKER_PULL_POLICY);
  const wiresharkThemeSetting = wsConfig.get<string>("capture.wireshark.theme");
  const keepOpenInBackground = wsConfig.get<boolean>("capture.wireshark.stayOpenInBackground");

  const packetflixUri = await buildPacketflixUri(node, allSelectedNodes, true);
  if (!packetflixUri) {
    return;
  }
  const edgesharkNetwork = await getEdgesharkNetwork();
  const volumeMount = await getVolumeMount(node.parentName);
  const modifiedPacketflixUri = adjustPacketflixHost(packetflixUri[0], edgesharkNetwork);

  const port = await utils.getFreePort();
  const ctrName = utils.sanitize(
    `${WIRESHARK_VNC_CTR_NAME_PREFIX}-${username}-${node.parentName}_${node.name}-${Date.now()}`
  );
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
  if (containerId == null || containerId.length === 0) {
    return;
  }

  // let vscode port forward for us
  const localUri = vscode.Uri.parse(`http://localhost:${port}`);
  const externalUri = (await vscode.env.asExternalUri(localUri)).toString();
  const extensionUri = vscode.extensions.getExtension("srl-labs.vscode-containerlab")?.extensionUri;
  if (!extensionUri) {
    void vscode.window.showErrorMessage(
      "Unable to render Wireshark panel because extension resources are unavailable."
    );
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    "clabWiresharkVNC",
    `Wireshark (${node.parentName}:${node.name})`,
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: keepOpenInBackground,
      localResourceRoots: [
        vscode.Uri.joinPath(extensionUri, "dist"),
        vscode.Uri.joinPath(extensionUri, "resources")
      ]
    }
  );

  panel.onDidDispose(async () => {
    try {
      const container = dockerClient.getContainer(containerId);
      await container.stop();
      outputChannel.info(`Stopped Wireshark VNC container: ${containerId}`);
    } catch {
      // ignore
    }
  });

  const iframeUrl = externalUri;

  // Show info about where to save pcap files if volume is mounted
  if (volumeMount) {
    vscode.window.showInformationMessage(
      `Wireshark started. Save pcap files to /pcaps to persist them in the lab directory.`
    );
  }

  panel.webview.html = getWiresharkVncWebviewHtml(panel.webview, extensionUri, {
    iframeUrl,
    showVolumeTip: Boolean(volumeMount)
  });

  const readinessMonitor = createVncReadinessMonitor(panel, localUri.toString(), iframeUrl);

  panel.webview.onDidReceiveMessage((message) => {
    if (!isRecord(message)) {
      return;
    }

    if (message.type === "retry-check") {
      readinessMonitor.start(true);
    }
  });

  // Readiness checks are triggered by the webview via postMessage.
}

type VncMonitorToken = { cancelled: boolean };

function isTokenCancelled(token: VncMonitorToken): boolean {
  return token.cancelled;
}

function createVncReadinessMonitor(
  panel: vscode.WebviewPanel,
  localUrl: string,
  iframeUrl: string
) {
  let disposed = false;
  let currentToken: VncMonitorToken | undefined;

  panel.onDidDispose(() => {
    disposed = true;
    if (currentToken) {
      currentToken.cancelled = true;
    }
  });

  const start = (force = false) => {
    if (disposed) {
      return;
    }
    if (currentToken && !force) {
      return;
    }

    if (currentToken) {
      currentToken.cancelled = true;
    }

    const token: VncMonitorToken = { cancelled: false };
    currentToken = token;

    void runVncReadinessLoop(panel, localUrl, iframeUrl, token, () => disposed).finally(() => {
      if (currentToken === token) {
        currentToken = undefined;
      }
    });
  };

  return { start };
}

async function runVncReadinessLoop(
  panel: vscode.WebviewPanel,
  localUrl: string,
  iframeUrl: string,
  token: VncMonitorToken,
  isDisposed: () => boolean
): Promise<void> {
  const maxAttempts = 60;
  const delayMs = 1000;

  if (isDisposed() || isTokenCancelled(token)) {
    return;
  }

  await utils.tryPostMessage(panel, { type: "vnc-progress", attempt: 0, maxAttempts });

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (isDisposed() || isTokenCancelled(token)) {
      return;
    }

    const ready = await utils.isHttpEndpointReady(localUrl);
    if (isDisposed() || isTokenCancelled(token)) {
      return;
    }

    if (ready) {
      await utils.tryPostMessage(panel, { type: "vnc-ready", url: iframeUrl });
      return;
    }

    await utils.tryPostMessage(panel, { type: "vnc-progress", attempt, maxAttempts });
    await utils.delay(delayMs);
  }

  if (!isDisposed() && !isTokenCancelled(token)) {
    await utils.tryPostMessage(panel, { type: "vnc-timeout", url: iframeUrl });
  }
}

export async function killAllWiresharkVNCCtrs() {
  const dockerImage = vscode.workspace
    .getConfiguration("containerlab")
    .get<string>("capture.wireshark.dockerImage", DEFAULT_WIRESHARK_VNC_DOCKER_IMAGE);
  try {
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
        containers.map(async (containerInfo) => {
          try {
            const container = dockerClient.getContainer(containerInfo.Id);
            await container.remove({
              force: true
            });
            outputChannel.info(`Removed Wireshark VNC container: ${containerInfo.Id}`);
          } catch (err) {
            outputChannel.warn(`Failed to remove container ${containerInfo.Id}: ${err}`);
          }
        })
      );
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Failed to remove Wireshark VNC containers: ${message}`);
  }
}
