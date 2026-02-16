import * as path from "path";
import * as fs from "fs";
import { execSync } from "child_process";

import * as vscode from "vscode";
import Docker from "dockerode";

import * as cmd from "./commands";
import * as utils from "./utils";
import {
  outputChannel,
  containerlabBinaryPath,
  runningLabsProvider,
  localLabsProvider,
  extensionContext,
  setOutputChannel,
  setUsername,
  setDockerClient,
  setContainerlabBinaryPath,
  setExtensionContext,
  setFavoriteLabs,
  setLocalLabsProvider,
  setRunningLabsProvider,
  setHelpFeedbackProvider,
  setHideNonOwnedLabsState
} from "./globals";
import { WelcomePage } from "./welcomePage";
import { registerClabImageCompletion } from "./yaml/imageCompletion";
import * as ins from "./treeView/inspector";
import type * as c from "./treeView/common";
import {
  LocalLabTreeDataProvider,
  RunningLabTreeDataProvider,
  HelpFeedbackProvider,
  isPollingMode
} from "./treeView";
import {
  refreshSshxSessions,
  refreshGottySessions,
  onEventsDataChanged,
  onContainerStateChanged,
  onFallbackDataChanged,
  stopFallbackPolling
} from "./services";
import { ContainerlabExplorerViewProvider } from "./webviews/explorer/containerlabExplorerViewProvider";

let explorerViewProvider: ContainerlabExplorerViewProvider | undefined;

function registerUnsupportedViews(context: vscode.ExtensionContext) {
  let warningShown = false;
  const showWarningOnce = () => {
    if (warningShown) {
      return;
    }
    warningShown = true;
    vscode.window.showWarningMessage(
      "The Containerlab extension is only supported on Linux or WSL. Features are disabled on this platform."
    );
  };

  const unsupportedProvider: vscode.WebviewViewProvider = {
    resolveWebviewView(webviewView) {
      webviewView.webview.options = {
        enableScripts: false
      };
      webviewView.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    html, body {
      margin: 0;
      padding: 0;
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
    }
    .wrap {
      padding: 12px;
    }
    a {
      color: var(--vscode-textLink-foreground);
    }
  </style>
</head>
<body>
  <div class="wrap">
    <h3>Containerlab Requires Linux or WSL</h3>
    <p>Features are disabled on this platform.</p>
    <p><a href="https://containerlab.dev/manual/vsc-extension/">Open documentation</a></p>
  </div>
</body>
</html>`;

      context.subscriptions.push(
        webviewView.onDidChangeVisibility(() => {
          if (webviewView.visible) {
            showWarningOnce();
          }
        })
      );
    }
  };

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      ContainerlabExplorerViewProvider.viewType,
      unsupportedProvider
    )
  );
}

// Session refresh functions are available from ./services/sessionRefresh directly

function showOutputChannel() {
  outputChannel.show(true);
}

async function refreshLabViews() {
  await ins.update();
  localLabsProvider.forceRefresh();
  Promise.resolve(runningLabsProvider.refresh()).catch(() => {
    /* ignore */
  });
  explorerViewProvider?.requestRefresh();
}

function manageImpairments(node: c.ClabContainerTreeNode) {
  return cmd.manageNodeImpairments(node, extensionContext);
}

function graphTopoViewer(node: c.ClabLabTreeNode) {
  return cmd.graphTopoviewer(node, extensionContext);
}

async function openTopoViewerEditorCommand(node?: c.ClabLabTreeNode) {
  // Just delegate to graphTopoViewer which handles everything
  return graphTopoViewer(node as c.ClabLabTreeNode);
}

async function createTopoViewerTemplateFileCommand() {
  const ctx = extensionContext;
  if (!ctx) {
    return;
  }
  const uri = await vscode.window.showSaveDialog({
    title: "Enter containerlab topology template file name",
    defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri,
    saveLabel: "Create Containerlab topology template file",
    filters: { "Containerlab YAML": ["clab.yml", "clab.yaml"], YAML: ["yaml", "yml"] }
  });
  if (!uri) {
    vscode.window.showWarningMessage("No file path selected. Operation canceled.");
    return;
  }

  // Ensure the file has .clab.yml extension
  let filePath = uri.fsPath;
  if (!/\.clab\.(yml|yaml)$/i.test(filePath)) {
    // Replace .yml/.yaml with .clab.yml, or append if no extension
    filePath = filePath.replace(/\.(yml|yaml)$/i, "") + ".clab.yml";
  }

  // Create a starter template file with example nodes
  const baseName = path.basename(filePath);
  const labName = baseName.replace(/\.clab\.(yml|yaml)$/i, "").replace(/\.(yml|yaml)$/i, "");
  const template = `name: ${labName}

topology:
  nodes:
    srl1:
      kind: nokia_srlinux
      type: ixrd1
      image: ghcr.io/nokia/srlinux:latest
    client1:
      kind: linux
      image: ghcr.io/srl-labs/network-multitool:latest

  links:
    - endpoints: [ "srl1:e1-1", "client1:eth1" ]
`;
  fs.writeFileSync(filePath, template);

  // Open the file in the editor
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
  await vscode.window.showTextDocument(doc);

  // Open the TopoViewer
  const node = {
    labPath: { absolute: filePath, relative: path.basename(filePath) },
    name: labName
  } as c.ClabLabTreeNode;
  return graphTopoViewer(node);
}

function updateHideNonOwnedLabs(hide: boolean) {
  setHideNonOwnedLabsState(hide);
}

function hideNonOwnedLabsCommand() {
  runningLabsProvider.refreshWithoutDiscovery();
  updateHideNonOwnedLabs(true);
}

function showNonOwnedLabsCommand() {
  runningLabsProvider.refreshWithoutDiscovery();
  updateHideNonOwnedLabs(false);
}

function onDidChangeConfiguration(e: vscode.ConfigurationChangeEvent) {
  if (e.affectsConfiguration("containerlab.autoSync")) {
    // Setting changed; no action required here
  }
}

function registerCommands(context: vscode.ExtensionContext) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const commands: Array<[string, (...args: any[]) => unknown]> = [
    ["containerlab.lab.openFile", cmd.openLabFile],
    ["containerlab.lab.addToWorkspace", cmd.addLabFolderToWorkspace],
    ["containerlab.lab.openFolderInNewWindow", cmd.openFolderInNewWindow],
    ["containerlab.lab.copyPath", cmd.copyLabPath],
    ["containerlab.lab.cloneRepo", cmd.cloneRepo],
    ["containerlab.lab.clonePopularRepo", cmd.clonePopularRepo],
    ["containerlab.lab.toggleFavorite", cmd.toggleFavorite],
    ["containerlab.lab.delete", cmd.deleteLab],
    ["containerlab.lab.deploy", cmd.deploy],
    ["containerlab.lab.deploy.cleanup", cmd.deployCleanup],
    ["containerlab.lab.deploy.specificFile", cmd.deploySpecificFile],
    ["containerlab.lab.deployPopular", cmd.deployPopularLab],
    ["containerlab.lab.redeploy", cmd.redeploy],
    ["containerlab.lab.redeploy.cleanup", cmd.redeployCleanup],
    ["containerlab.lab.destroy", cmd.destroy],
    ["containerlab.lab.destroy.cleanup", cmd.destroyCleanup],
    ["containerlab.lab.save", cmd.saveLab],
    ["containerlab.lab.sshx.attach", cmd.sshxAttach],
    ["containerlab.lab.sshx.detach", cmd.sshxDetach],
    ["containerlab.lab.sshx.reattach", cmd.sshxReattach],
    ["containerlab.lab.sshx.copyLink", cmd.sshxCopyLink],
    ["containerlab.lab.gotty.attach", cmd.gottyAttach],
    ["containerlab.lab.gotty.detach", cmd.gottyDetach],
    ["containerlab.lab.gotty.reattach", cmd.gottyReattach],
    ["containerlab.lab.gotty.copyLink", cmd.gottyCopyLink],
    ["containerlab.lab.sshToAllNodes", cmd.sshToLab],
    ["containerlab.lab.graph.drawio.horizontal", cmd.graphDrawIOHorizontal],
    ["containerlab.lab.graph.drawio.vertical", cmd.graphDrawIOVertical],
    ["containerlab.lab.graph.drawio.interactive", cmd.graphDrawIOInteractive],
    ["containerlab.node.start", cmd.startNode],
    ["containerlab.node.stop", cmd.stopNode],
    ["containerlab.node.pause", cmd.pauseNode],
    ["containerlab.node.unpause", cmd.unpauseNode],
    ["containerlab.node.save", cmd.saveNode],
    ["containerlab.node.attachShell", cmd.attachShell],
    ["containerlab.node.ssh", cmd.sshToNode],
    ["containerlab.node.telnet", cmd.telnetToNode],
    ["containerlab.node.showLogs", cmd.showLogs],
    ["containerlab.node.openBrowser", cmd.openBrowser],
    ["containerlab.node.copyIPv4Address", cmd.copyContainerIPv4Address],
    ["containerlab.node.copyIPv6Address", cmd.copyContainerIPv6Address],
    ["containerlab.node.copyName", cmd.copyContainerName],
    ["containerlab.node.copyID", cmd.copyContainerID],
    ["containerlab.node.copyKind", cmd.copyContainerKind],
    ["containerlab.node.copyImage", cmd.copyContainerImage],
    ["containerlab.interface.capture", cmd.captureInterface],
    ["containerlab.interface.captureWithEdgeshark", cmd.captureInterfaceWithPacketflix],
    ["containerlab.interface.captureWithEdgesharkVNC", cmd.captureEdgesharkVNC],
    ["containerlab.interface.setDelay", cmd.setLinkDelay],
    ["containerlab.interface.setJitter", cmd.setLinkJitter],
    ["containerlab.interface.setLoss", cmd.setLinkLoss],
    ["containerlab.interface.setRate", cmd.setLinkRate],
    ["containerlab.interface.setCorruption", cmd.setLinkCorruption],
    ["containerlab.interface.setImpairment", cmd.setImpairment],
    ["containerlab.interface.copyMACAddress", cmd.copyMACAddress],
    ["containerlab.install.edgeshark", cmd.installEdgeshark],
    ["containerlab.uninstall.edgeshark", cmd.uninstallEdgeshark],
    ["containerlab.capture.killAllWiresharkVNC", cmd.killAllWiresharkVNCCtrs],
    ["containerlab.set.sessionHostname", cmd.setSessionHostname],
    ["containerlab.openLink", cmd.openLink],
    ["containerlab.lab.fcli.bgpPeers", cmd.fcliBgpPeers],
    ["containerlab.lab.fcli.bgpRib", cmd.fcliBgpRib],
    ["containerlab.lab.fcli.ipv4Rib", cmd.fcliIpv4Rib],
    ["containerlab.lab.fcli.lldp", cmd.fcliLldp],
    ["containerlab.lab.fcli.mac", cmd.fcliMac],
    ["containerlab.lab.fcli.ni", cmd.fcliNi],
    ["containerlab.lab.fcli.subif", cmd.fcliSubif],
    ["containerlab.lab.fcli.sysInfo", cmd.fcliSysInfo],
    ["containerlab.lab.fcli.custom", cmd.fcliCustom]
  ];
  commands.forEach(([name, handler]) => {
    context.subscriptions.push(vscode.commands.registerCommand(name, handler));
  });
  context.subscriptions.push(
    vscode.commands.registerCommand("containerlab.refresh", refreshLabViews)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("containerlab.viewLogs", showOutputChannel)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("containerlab.node.manageImpairments", manageImpairments)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("containerlab.lab.graph.topoViewer", graphTopoViewer)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "containerlab.editor.topoViewerEditor.open",
      openTopoViewerEditorCommand
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "containerlab.editor.topoViewerEditor",
      createTopoViewerTemplateFileCommand
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("containerlab.inspectAll", () =>
      cmd.inspectAllLabs(extensionContext)
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("containerlab.inspectOneLab", (node: c.ClabLabTreeNode) =>
      cmd.inspectOneLab(node, extensionContext)
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "containerlab.treeView.runningLabs.hideNonOwnedLabs",
      hideNonOwnedLabsCommand
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "containerlab.treeView.runningLabs.showNonOwnedLabs",
      showNonOwnedLabsCommand
    )
  );
}

function registerRealtimeUpdates(context: vscode.ExtensionContext) {
  // Common handler for data changes (used by both events and fallback)
  const handleDataChanged = () => {
    ins.refreshFromEventStream();
    if (runningLabsProvider) {
      runningLabsProvider.softRefresh().catch((err: unknown) => {
        console.error("[containerlab extension]: realtime refresh failed", err);
      });
    }
  };

  // Register BOTH listeners - isPollingMode() will dynamically check which one applies
  // This handles the case where events fail and we fall back to polling mid-session

  // Events listener (only fires if events mode is active)
  const disposeEventsRealtime = onEventsDataChanged(() => {
    if (!isPollingMode()) {
      handleDataChanged();
    }
  });
  context.subscriptions.push({ dispose: disposeEventsRealtime });

  // Fallback polling listener (only fires if polling mode is active)
  const disposeFallbackRealtime = onFallbackDataChanged(() => {
    if (isPollingMode()) {
      handleDataChanged();
    }
  });
  context.subscriptions.push({ dispose: disposeFallbackRealtime });

  // Register listener for container state changes (only relevant in events mode)
  const disposeStateChange = onContainerStateChanged((containerShortId, newState) => {
    if (!isPollingMode() && runningLabsProvider) {
      runningLabsProvider.refreshContainer(containerShortId, newState).catch((err: unknown) => {
        outputChannel.debug(
          `Failed to refresh container ${containerShortId}: ${err instanceof Error ? err.message : String(err)}`
        );
      });
    }
  });
  context.subscriptions.push({ dispose: disposeStateChange });

  // Stop fallback polling on deactivate
  context.subscriptions.push({
    dispose: () => {
      stopFallbackPolling();
    }
  });

  ins.refreshFromEventStream();
}

function setClabBinPath(): boolean {
  const configPath = vscode.workspace
    .getConfiguration("containerlab")
    .get<string>("binaryPath", "");

  // if empty fall back to resolving from PATH
  if (!configPath || configPath.trim() === "") {
    try {
      // eslint-disable-next-line sonarjs/no-os-command-from-path
      const stdout = execSync("which containerlab", { encoding: "utf-8" });
      const resolvedPath = stdout.trim();
      if (resolvedPath) {
        setContainerlabBinaryPath(resolvedPath);
        outputChannel.info(`Resolved containerlab binary from sys PATH as: ${resolvedPath}`);
        return true;
      }
    } catch (err) {
      outputChannel.warn(`Could not resolve containerlab bin path from sys PATH: ${err}`);
    }
    setContainerlabBinaryPath("containerlab");
    return true;
  }

  try {
    // Check if file exists and is executable
    fs.accessSync(configPath, fs.constants.X_OK);
    setContainerlabBinaryPath(configPath);
    outputChannel.info(`Using user configured containerlab binary: ${configPath}`);
    return true;
  } catch (err) {
    // Path is invalid or not executable - try to resolve from PATH as fallback
    outputChannel.error(`Invalid containerlab.binaryPath "${configPath}": ${err}`);
    vscode.window.showErrorMessage(
      `Configured containerlab binary path "${configPath}" is invalid or not executable.`
    );
  }
  return false;
}

/**
 * Called when VSCode activates your extension.
 */
export async function activate(context: vscode.ExtensionContext) {
  // Create and register the output channel
  const channel = vscode.window.createOutputChannel("Containerlab", { log: true });
  setOutputChannel(channel);
  context.subscriptions.push(channel);
  outputChannel.info("Registered output channel sucessfully.");
  outputChannel.info(`Detected platform: ${process.platform}`);

  const config = vscode.workspace.getConfiguration("containerlab");
  const isSupportedPlatform = process.platform === "linux" || vscode.env.remoteName === "wsl";

  // Allow activation only on Linux or when connected via WSL.
  // If unsupported, stay silent until the user opens the Containerlab view, then show a warning.
  if (!isSupportedPlatform) {
    registerUnsupportedViews(context);
    return;
  }

  if (!setClabBinPath()) {
    // don't activate
    outputChannel.error(`Error setting containerlab binary. Exiting activation.`);
    return;
  }

  // Ensure clab is installed if the binpath was unable to be set.
  if (containerlabBinaryPath === "containerlab") {
    const installChoice = await vscode.window.showWarningMessage(
      "Containerlab is not installed. Would you like to install it?",
      "Install",
      "Cancel"
    );
    if (installChoice === "Install") {
      utils.installContainerlab();
      vscode.window
        .showInformationMessage(
          "Please complete the installation in the terminal, then reload the window.",
          "Reload Window"
        )
        .then((choice) => {
          if (choice === "Reload Window") {
            vscode.commands.executeCommand("workbench.action.reloadWindow");
          }
        });
    }
    return;
  }

  outputChannel.info("Containerlab extension activated.");

  outputChannel.debug(`Starting user permissions check`);
  // 1) Check if user has required permissions
  const userInfo = utils.getUserInfo();
  setUsername(userInfo.username);
  if (!userInfo.hasPermission) {
    outputChannel.error(
      `User '${userInfo.username}' (id:${userInfo.uid}) has insufficient permissions`
    );

    vscode.window.showErrorMessage(
      `Extension activation failed. Insufficient permissions.\nEnsure ${userInfo.username} is in the 'clab_admins' and 'docker' groups.`
    );
    return;
  }
  outputChannel.debug(
    `Permission check success for user '${userInfo.username}' (id:${userInfo.uid})`
  );

  // 2) Check for updates
  const skipUpdateCheck = config.get<boolean>("skipUpdateCheck", false);
  if (!skipUpdateCheck) {
    utils.checkAndUpdateClabIfNeeded(outputChannel, context).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      outputChannel.error(`Update check error: ${message}`);
    });
  }

  /**
   * CONNECT TO DOCKER SOCKET VIA DOCKERODE
   */
  try {
    const docker = new Docker({ socketPath: "/var/run/docker.sock" });
    setDockerClient(docker);
    // verify we are connected
    await docker.ping();
    outputChannel.info("Successfully connected to Docker socket");
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    outputChannel.error(`Failed to connect to Docker socket: ${message}`);
    vscode.window.showErrorMessage(
      `Failed to connect to Docker. Ensure Docker is running and you have proper permissions.`
    );
    return;
  }

  /**
   * At this stage we should have successfully connected to the docker socket.
   * now we can:
   *  - Initially load docker images cache
   *  - Start the docker images listener
   */
  void utils.refreshDockerImages();
  utils.startDockerImageEventMonitor(context);

  // Show welcome page
  const welcomePage = new WelcomePage(context);
  await welcomePage.show();

  // Initial pull of inspect data
  void ins.update();

  // Explorer data providers (backing model for React explorer)
  setExtensionContext(context);
  setFavoriteLabs(new Set(context.globalState.get<string[]>("favoriteLabs", [])));

  const newLocalProvider = new LocalLabTreeDataProvider();
  const newRunningProvider = new RunningLabTreeDataProvider(context);
  const newHelpProvider = new HelpFeedbackProvider();
  setLocalLabsProvider(newLocalProvider);
  setRunningLabsProvider(newRunningProvider);
  setHelpFeedbackProvider(newHelpProvider);

  await refreshSshxSessions();
  await refreshGottySessions();
  // Docker images are refreshed on TopoViewer open to avoid unnecessary calls

  // Determine if local capture is allowed.
  const isLocalCaptureAllowed = vscode.env.remoteName !== "ssh-remote" && !utils.isOrbstack();
  void vscode.commands.executeCommand(
    "setContext",
    "containerlab:isLocalCaptureAllowed",
    isLocalCaptureAllowed
  );
  void vscode.commands.executeCommand("setContext", "containerlabExplorerVisible", false);

  explorerViewProvider = new ContainerlabExplorerViewProvider(context, {
    runningProvider: newRunningProvider,
    localProvider: newLocalProvider,
    helpProvider: newHelpProvider,
    isLocalCaptureAllowed
  });
  void vscode.commands.executeCommand(
    "setContext",
    "containerlabExplorerFilterActive",
    explorerViewProvider.isFilterActive()
  );
  context.subscriptions.push(
    explorerViewProvider,
    explorerViewProvider.onDidChangeVisibility((visible) => {
      void vscode.commands.executeCommand("setContext", "containerlabExplorerVisible", visible);
    }),
    vscode.window.registerWebviewViewProvider(
      ContainerlabExplorerViewProvider.viewType,
      explorerViewProvider,
      {
        webviewOptions: { retainContextWhenHidden: true }
      }
    )
  );

  registerRealtimeUpdates(context);

  // Language features (YAML completion)
  registerClabImageCompletion(context);

  // Register commands
  registerCommands(context);
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(onDidChangeConfiguration));

  // Expose a stable API surface for other extensions to access providers safely.
  return {
    getLocalLabsProvider: () => localLabsProvider,
    getRunningLabsProvider: () => runningLabsProvider
  };
}

export function deactivate() {
  explorerViewProvider = undefined;
  if (outputChannel) {
    outputChannel.info("Deactivating Containerlab extension.");
  }
}
