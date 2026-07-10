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
  setFavoriteApiLabs,
  setFavoriteLabs,
  setLocalLabsProvider,
  setRunningLabsProvider,
  setHelpFeedbackProvider,
  setHideNonOwnedLabsState
} from "./globals";
import { WelcomePage } from "./welcomePage";
import { registerClabImageCompletion } from "./yaml/imageCompletion";
import * as ins from "./treeView/inspector";
import * as c from "./treeView/common";
import {
  LocalLabTreeDataProvider,
  RunningLabTreeDataProvider,
  HelpFeedbackProvider,
  isPollingMode
} from "./treeView";
import { refreshSshxSessions, refreshGottySessions } from "./services";
import { ContainerlabExplorerViewProvider } from "./webviews/explorer/containerlabExplorerViewProvider";
import {
  createWorkspaceBackend,
  getActiveBackend,
  getBackendForResource,
  getWorkspaceBackend,
  registerBackend,
  setActiveBackend
} from "./backends/manager";
import { assertNoWorkspaceApiTrustOverrides } from "./backends/api/apiConfigurationTrust";
import { ApiEndpointController } from "./apiEndpoints/apiEndpointController";
import { showApiEndpointManager } from "./apiEndpoints/apiEndpointPanel";
import { backendHasCapability, type BackendCapability } from "./backends/types";
import { LocalContainerlabBackend } from "./backends/localContainerlabBackend";
import { ApiContainerlabBackend } from "./backends/api/apiContainerlabBackend";
import { registerApiWorkspaceFileSync } from "./commands/apiWorkspaceFiles";

let explorerViewProvider: ContainerlabExplorerViewProvider | undefined;
let providersReady = false;

function isE2ESmokeTest(): boolean {
  return process.env.VSCODE_CONTAINERLAB_E2E === "1";
}

async function promptToInstallContainerlab(): Promise<void> {
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
}

async function ensureContainerlabBinary(e2eSmokeTest: boolean): Promise<boolean> {
  if (containerlabBinaryPath !== "containerlab") {
    return true;
  }

  if (e2eSmokeTest) {
    outputChannel.warn("Containerlab binary not found; continuing in E2E smoke mode.");
    return true;
  }

  await promptToInstallContainerlab();
  return false;
}

function validateUserPermissions(e2eSmokeTest: boolean): boolean {
  outputChannel.debug(`Starting user permissions check`);
  const userInfo = utils.getUserInfo();
  setUsername(userInfo.username);
  if (userInfo.hasPermission) {
    outputChannel.debug(
      `Permission check success for user '${userInfo.username}' (id:${userInfo.uid})`
    );
    return true;
  }

  outputChannel.error(
    `User '${userInfo.username}' (id:${userInfo.uid}) has insufficient permissions`
  );

  if (e2eSmokeTest) {
    outputChannel.warn("Continuing despite insufficient permissions in E2E smoke mode.");
    return true;
  }

  const runtime = utils.getConfig<string>("runtime", "docker");
  const requiredGroups = runtime === "podman" ? "'clab_admins'" : "'clab_admins' and 'docker'";
  vscode.window.showErrorMessage(
    `Local containerlab features are unavailable. Ensure ${userInfo.username} is in the ${requiredGroups} group(s). API endpoints remain available.`
  );
  return false;
}

async function connectDockerSocket(e2eSmokeTest: boolean): Promise<boolean | undefined> {
  try {
    const socketPath = utils.getConfig<string>("dockerSocketPath", "/var/run/docker.sock");
    const docker = new Docker({ socketPath });
    setDockerClient(docker);
    await docker.ping();
    outputChannel.info("Successfully connected to Docker socket");
    return true;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    outputChannel.error(`Failed to connect to Docker socket: ${message}`);
    if (e2eSmokeTest) {
      outputChannel.warn("Continuing without Docker in E2E smoke mode.");
      return false;
    }
    vscode.window.showErrorMessage(
      `Local containerlab features are unavailable. Ensure Docker is running and you have proper permissions. API endpoints remain available.`
    );
    return undefined;
  }
}

async function runFullStartupTasks(
  context: vscode.ExtensionContext,
  config: vscode.WorkspaceConfiguration,
  dockerAvailable: boolean,
  e2eSmokeTest: boolean
): Promise<void> {
  const skipUpdateCheck = config.get<boolean>("skipUpdateCheck", false);
  if (
    backendHasCapability(getActiveBackend(), "local-runtime") &&
    !skipUpdateCheck &&
    !e2eSmokeTest
  ) {
    utils.checkAndUpdateClabIfNeeded(outputChannel, context).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      outputChannel.error(`Update check error: ${message}`);
    });
  }

  if (backendHasCapability(getActiveBackend(), "local-runtime") && dockerAvailable) {
    void utils.refreshDockerImages();
    utils.startDockerImageEventMonitor(context);
  }

  if (e2eSmokeTest) {
    return;
  }

  const welcomePage = new WelcomePage(context);
  await welcomePage.show();
  void ins.update();
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function stopRealtimeBackgroundWorkers(): void {
  ins.stop();
}

function registerProcessShutdownHooks(context: vscode.ExtensionContext): void {
  const handleBeforeExit = () => stopRealtimeBackgroundWorkers();
  const handleExit = () => stopRealtimeBackgroundWorkers();
  const handleDisconnect = () => stopRealtimeBackgroundWorkers();
  const handleSigterm = () => stopRealtimeBackgroundWorkers();
  const handleSigint = () => stopRealtimeBackgroundWorkers();
  const handleSighup = () => stopRealtimeBackgroundWorkers();

  process.once("beforeExit", handleBeforeExit);
  process.once("exit", handleExit);
  process.once("disconnect", handleDisconnect);
  process.once("SIGTERM", handleSigterm);
  process.once("SIGINT", handleSigint);
  process.once("SIGHUP", handleSighup);

  context.subscriptions.push({
    dispose: () => {
      process.removeListener("beforeExit", handleBeforeExit);
      process.removeListener("exit", handleExit);
      process.removeListener("disconnect", handleDisconnect);
      process.removeListener("SIGTERM", handleSigterm);
      process.removeListener("SIGINT", handleSigint);
      process.removeListener("SIGHUP", handleSighup);
      stopRealtimeBackgroundWorkers();
    }
  });
}

// Session refresh functions are available from ./services/sessionRefresh directly

function showOutputChannel() {
  outputChannel.show(true);
}

function manageImpairments(node: c.ClabContainerTreeNode) {
  return cmd.manageNodeImpairments(node, extensionContext);
}

function graphTopoViewer(node?: c.ClabLabTreeNode) {
  return cmd.graphTopoviewer(node, extensionContext);
}

async function openTopoViewerEditorCommand(node?: c.ClabLabTreeNode) {
  // Just delegate to graphTopoViewer which handles everything
  return graphTopoViewer(node);
}

function starterTopology(labName: string): string {
  return `name: ${labName}

topology:
  nodes:
    srl1:
      kind: nokia_srlinux
      type: ixr-d1
      image: ghcr.io/nokia/srlinux:latest
    client1:
      kind: linux
      image: ghcr.io/srl-labs/network-multitool:latest

  links:
    - endpoints: [ "srl1:e1-1", "client1:eth1" ]
`;
}

async function createTopoViewerTemplateFileCommand(target?: unknown) {
  const targetBackend = getBackendForResource(target);
  if (targetBackend instanceof ApiContainerlabBackend) {
    const requestedName = await vscode.window.showInputBox({
      title: "New API topology",
      prompt: `File name on ${targetBackend.getConnectionInfo().url}`,
      value: "new-lab.clab.yml",
      validateInput: (value) =>
        value.trim().length === 0 ? "A topology file name is required." : undefined
    });
    if (requestedName === undefined) return;
    const fileName = /\.clab\.(?:yml|yaml)$/iu.test(requestedName.trim())
      ? path.basename(requestedName.trim())
      : `${path.basename(requestedName.trim()).replace(/\.(?:yml|yaml)$/iu, "")}.clab.yml`;
    const labName = fileName.replace(/\.clab\.(?:yml|yaml)$/iu, "");
    try {
      await targetBackend.operations.writeTopologyYaml(labName, starterTopology(labName));
      const node = new c.ClabLabTreeNode(
        fileName,
        vscode.TreeItemCollapsibleState.None,
        { absolute: "", relative: fileName },
        labName,
        undefined,
        undefined,
        "containerlabLabUndeployed",
        false,
        undefined,
        undefined,
        { backendId: targetBackend.id, labName, remotePath: fileName }
      );
      return await graphTopoViewer(node);
    } catch (error) {
      vscode.window.showErrorMessage(`Could not create API topology: ${getErrorMessage(error)}`);
      return;
    }
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
  const template = starterTopology(labName);
  fs.writeFileSync(filePath, template);

  // Open the file in the editor
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
  await vscode.window.showTextDocument(doc);

  // Open the TopoViewer
  const node = new c.ClabLabTreeNode(
    labName,
    vscode.TreeItemCollapsibleState.None,
    { absolute: filePath, relative: path.basename(filePath) },
    labName
  );
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
  if (e.affectsConfiguration("containerlab.api.tls")) {
    void vscode.window
      .showInformationMessage(
        "Containerlab backend settings changed. Reload the window to reconnect safely.",
        "Reload Window"
      )
      .then((choice) => {
        if (choice === "Reload Window") {
          void vscode.commands.executeCommand("workbench.action.reloadWindow");
        }
      });
  }
}

async function signOutFromApi(): Promise<void> {
  const apiBackends =
    getWorkspaceBackend()
      ?.listBackends()
      .filter((backend) => backend.kind === "api") ?? [];
  if (apiBackends.length === 0) {
    vscode.window.showInformationMessage("No clab-api-server endpoint is connected.");
    return;
  }
  if (apiBackends.length > 1) {
    vscode.window.showInformationMessage(
      "Multiple clab-api-server endpoints are connected. Open the endpoint manager to remove a specific session."
    );
    await vscode.commands.executeCommand("containerlab.api.manageEndpoints");
    return;
  }
  await apiBackends[0].signOut?.();
  getWorkspaceBackend()?.removeBackend(apiBackends[0].id);
  await refreshProvidersAfterAuthenticationChange();
  vscode.window.showInformationMessage("Signed out of clab-api-server.");
}

async function refreshProvidersAfterAuthenticationChange(): Promise<void> {
  if (!providersReady) return;
  await runningLabsProvider.refresh();
  localLabsProvider.forceRefresh();
}

function registerApiAuthenticationCommands(
  context: vscode.ExtensionContext,
  controller: ApiEndpointController
): void {
  const endpointIdFrom = (value: unknown): string | undefined => {
    if (typeof value !== "object" || value === null) return undefined;
    const endpointId = Reflect.get(value, "endpointId");
    return typeof endpointId === "string" && endpointId.trim().length > 0
      ? endpointId.trim()
      : undefined;
  };
  context.subscriptions.push(
    vscode.commands.registerCommand("containerlab.api.manageEndpoints", () =>
      showApiEndpointManager(context, controller)
    ),
    vscode.commands.registerCommand("containerlab.api.login", () =>
      showApiEndpointManager(context, controller)
    ),
    vscode.commands.registerCommand("containerlab.api.logout", signOutFromApi),
    vscode.commands.registerCommand("containerlab.endpoint.reconnect", async (value: unknown) => {
      const endpointId = endpointIdFrom(value);
      if (!endpointId) return await showApiEndpointManager(context, controller);
      const password = await vscode.window.showInputBox({
        title: "Reconnect clab-api-server endpoint",
        prompt: "Password",
        password: true,
        ignoreFocusOut: true
      });
      if (password === undefined) return;
      try {
        await controller.reconnectEndpoint({ endpointId, password });
      } catch (error) {
        vscode.window.showErrorMessage(`Could not reconnect endpoint: ${getErrorMessage(error)}`);
      }
    }),
    vscode.commands.registerCommand("containerlab.endpoint.remove", async (value: unknown) => {
      const endpointId = endpointIdFrom(value);
      if (!endpointId) return await showApiEndpointManager(context, controller);
      const endpoint = (await controller.getState(false)).endpoints.find(
        (candidate) => candidate.id === endpointId
      );
      const confirmation = await vscode.window.showWarningMessage(
        `Remove API endpoint "${endpoint?.label ?? endpointId}"?`,
        { modal: true },
        "Remove"
      );
      if (confirmation === "Remove") await controller.removeEndpoint(endpointId);
    }),
    vscode.commands.registerCommand("containerlab.endpoint.copyUrl", async (value: unknown) => {
      const endpointId = endpointIdFrom(value);
      const endpoint = (await controller.getState(false)).endpoints.find(
        (candidate) => candidate.id === endpointId
      );
      if (!endpoint) {
        vscode.window.showErrorMessage("API endpoint metadata is unavailable.");
        return;
      }
      await vscode.env.clipboard.writeText(endpoint.url);
      vscode.window.showInformationMessage(`Copied ${endpoint.url}`);
    })
  );
}

function registerCommands(context: vscode.ExtensionContext) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const commands: Array<[string, (...args: any[]) => unknown, BackendCapability?]> = [
    ["containerlab.lab.openFile", cmd.openLabFile],
    ["containerlab.lab.addToWorkspace", cmd.addLabFolderToWorkspace],
    ["containerlab.lab.openFolderInNewWindow", cmd.openFolderInNewWindow],
    ["containerlab.lab.copyPath", cmd.copyLabPath],
    ["containerlab.lab.cloneRepo", cmd.cloneRepo],
    ["containerlab.lab.clonePopularRepo", cmd.clonePopularRepo],
    ["containerlab.lab.toggleFavorite", cmd.toggleFavorite],
    ["containerlab.lab.delete", cmd.deleteLab],
    ["containerlab.lab.deploy", cmd.deploy, "lab-lifecycle"],
    ["containerlab.lab.deploy.cleanup", cmd.deployCleanup, "lab-lifecycle"],
    ["containerlab.lab.deploy.specificFile", cmd.deploySpecificFile, "lab-lifecycle"],
    ["containerlab.lab.deployPopular", cmd.deployPopularLab, "lab-lifecycle"],
    ["containerlab.lab.redeploy", cmd.redeploy, "lab-lifecycle"],
    ["containerlab.lab.redeploy.cleanup", cmd.redeployCleanup, "lab-lifecycle"],
    ["containerlab.lab.apply", cmd.apply, "lab-lifecycle"],
    ["containerlab.lab.destroy", cmd.destroy, "lab-lifecycle"],
    ["containerlab.lab.destroy.cleanup", cmd.destroyCleanup, "lab-lifecycle"],
    ["containerlab.lab.start", cmd.startLab, "lab-lifecycle"],
    ["containerlab.lab.stop", cmd.stopLab, "lab-lifecycle"],
    ["containerlab.lab.restart", cmd.restartLab, "lab-lifecycle"],
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
    ["containerlab.node.restart", cmd.restartNode],
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
    ["containerlab.lab.fcli.custom", cmd.fcliCustom],
    ["containerlab.images.manage", (resource: unknown) => cmd.manageImages(context, resource)],
    ["containerlab.file.open", cmd.openApiWorkspaceFile],
    ["containerlab.file.openTopology", cmd.openApiWorkspaceFile],
    ["containerlab.file.newFile", cmd.newApiWorkspaceFile],
    ["containerlab.file.newFolder", cmd.newApiWorkspaceFolder],
    ["containerlab.file.rename", cmd.renameApiWorkspacePath],
    ["containerlab.file.delete", cmd.deleteApiWorkspacePath],
    ["containerlab.file.copyPath", cmd.copyApiWorkspacePath],
    ["containerlab.file.refresh", () => undefined]
  ];
  commands.forEach(([name, handler, requiredCapability]) => {
    const guardedHandler = (...args: unknown[]) => {
      const backend = getBackendForResource(args[0]);
      if (requiredCapability && !backendHasCapability(backend, requiredCapability)) {
        return vscode.window.showInformationMessage(
          `${name} is not available through the selected ${backend.kind} backend.`
        );
      }
      return handler(...args);
    };
    context.subscriptions.push(vscode.commands.registerCommand(name, guardedHandler));
  });
  context.subscriptions.push(
    vscode.commands.registerCommand("containerlab.viewLogs", showOutputChannel)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "containerlab.node.manageImpairments",
      (node: c.ClabContainerTreeNode) => {
        return manageImpairments(node);
      }
    )
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
    vscode.commands.registerCommand("containerlab.inspectAll", () => {
      return cmd.inspectAllLabs(extensionContext);
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("containerlab.inspectOneLab", (node: c.ClabLabTreeNode) => {
      return cmd.inspectOneLab(node, extensionContext);
    })
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
    if (providersReady) localLabsProvider.forceRefresh();
    runningLabsProvider.softRefresh().catch((err: unknown) => {
      console.error("[containerlab extension]: realtime refresh failed", err);
    });
  };

  // Register BOTH listeners - isPollingMode() will dynamically check which one applies
  // This handles the case where events fail and we fall back to polling mid-session

  // Events listener (only fires if events mode is active)
  const disposeRuntimeData = ins.onDataChanged(handleDataChanged);
  context.subscriptions.push({ dispose: disposeRuntimeData });

  // Register listener for container state changes (only relevant in events mode)
  const disposeStateChange = ins.onContainerStateChanged(
    (containerShortId, newState, backendId) => {
      if (!isPollingMode()) {
        runningLabsProvider
          .refreshContainer(containerShortId, newState, backendId)
          .catch((err: unknown) => {
            outputChannel.debug(
              `Failed to refresh container ${containerShortId}: ${err instanceof Error ? err.message : String(err)}`
            );
          });
      }
    }
  );
  context.subscriptions.push({ dispose: disposeStateChange });

  // Stop realtime background workers on deactivate
  context.subscriptions.push({
    dispose: () => {
      stopRealtimeBackgroundWorkers();
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
      const message = getErrorMessage(err);
      outputChannel.warn(`Could not resolve containerlab bin path from sys PATH: ${message}`);
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
    const message = getErrorMessage(err);
    outputChannel.error(`Invalid containerlab.binaryPath "${configPath}": ${message}`);
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
  const e2eSmokeTest = isE2ESmokeTest();
  outputChannel.info("Registered output channel sucessfully.");
  outputChannel.info(`Detected platform: ${process.platform}`);

  const config = vscode.workspace.getConfiguration("containerlab");
  setExtensionContext(context);
  registerApiWorkspaceFileSync(context);
  const workspaceBackend = createWorkspaceBackend();
  setActiveBackend(workspaceBackend);
  const apiEndpointController = new ApiEndpointController(context, {
    providersReady: () => providersReady,
    refreshProviders: refreshProvidersAfterAuthenticationChange
  });
  registerApiAuthenticationCommands(context, apiEndpointController);
  try {
    assertNoWorkspaceApiTrustOverrides(config);
  } catch (error) {
    const message = getErrorMessage(error);
    outputChannel.error(message);
    void vscode.window.showErrorMessage(message, "Open User Settings").then((choice) => {
      if (choice === "Open User Settings") {
        void vscode.commands.executeCommand(
          "workbench.action.openSettings",
          "@ext:srl-labs.vscode-containerlab containerlab.api"
        );
      }
    });
  }
  const isSupportedPlatform = process.platform === "linux" || vscode.env.remoteName === "wsl";
  let dockerAvailable = false;
  if (isSupportedPlatform && setClabBinPath() && (await ensureContainerlabBinary(e2eSmokeTest))) {
    if (validateUserPermissions(e2eSmokeTest)) {
      const localDockerAvailable = await connectDockerSocket(e2eSmokeTest);
      if (localDockerAvailable !== undefined) {
        dockerAvailable = localDockerAvailable;
        registerBackend(new LocalContainerlabBackend());
      }
    }
  }

  await apiEndpointController.restoreSavedEndpoints().catch((error: unknown) => {
    outputChannel.warn(`Could not restore clab-api-server endpoints: ${getErrorMessage(error)}`);
  });

  outputChannel.info("Containerlab extension activated.");
  await runFullStartupTasks(context, config, dockerAvailable, e2eSmokeTest);

  // Explorer data providers (backing model for React explorer)
  setFavoriteLabs(new Set(context.globalState.get<string[]>("favoriteLabs", [])));
  setFavoriteApiLabs(new Set(context.globalState.get<string[]>("favoriteApiLabs", [])));

  const newLocalProvider = new LocalLabTreeDataProvider();
  const newRunningProvider = new RunningLabTreeDataProvider(context);
  const newHelpProvider = new HelpFeedbackProvider();
  setLocalLabsProvider(newLocalProvider);
  setRunningLabsProvider(newRunningProvider);
  setHelpFeedbackProvider(newHelpProvider);
  providersReady = true;

  // Webview views are resolved lazily, so we keep a hidden tree view badge proxy
  // to show running lab count on the activity icon before the explorer is opened.
  const activityBadgeProxyProvider: vscode.TreeDataProvider<vscode.TreeItem> = {
    getTreeItem: (element: vscode.TreeItem) => element,
    getChildren: async () => []
  };
  const activityBadgeProxyView = vscode.window.createTreeView(
    "containerlabActivityBadgeProxyView",
    {
      treeDataProvider: activityBadgeProxyProvider,
      showCollapseAll: false
    }
  );
  const updateActivityBadgeProxy = async () => {
    try {
      const runningLabCount = await newRunningProvider.getRootChildrenCount();
      activityBadgeProxyView.badge =
        runningLabCount > 0
          ? {
              value: runningLabCount,
              tooltip: runningLabCount === 1 ? "1 running lab" : `${runningLabCount} running labs`
            }
          : undefined;
    } catch {
      activityBadgeProxyView.badge = undefined;
    }
  };
  context.subscriptions.push(
    activityBadgeProxyView,
    newRunningProvider.onDidChangeTreeData(() => {
      void updateActivityBadgeProxy();
    })
  );
  if (!e2eSmokeTest) {
    void updateActivityBadgeProxy();
  }

  if (!e2eSmokeTest && backendHasCapability(getActiveBackend(), "local-runtime")) {
    await refreshSshxSessions();
    await refreshGottySessions();
  }
  // Docker images are refreshed on TopoViewer open to avoid unnecessary calls

  // Determine if local capture is allowed.
  const isLocalCaptureAllowed =
    backendHasCapability(getActiveBackend(), "local-runtime") &&
    vscode.env.remoteName !== "ssh-remote" &&
    !utils.isOrbstack();
  void vscode.commands.executeCommand(
    "setContext",
    "containerlab:isLocalCaptureAllowed",
    isLocalCaptureAllowed
  );
  void vscode.commands.executeCommand("setContext", "containerlabExplorerVisible", false);

  explorerViewProvider = new ContainerlabExplorerViewProvider(context, {
    getEndpointState: async () => await apiEndpointController.getState(false),
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
  registerProcessShutdownHooks(context);

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
  providersReady = false;
  explorerViewProvider = undefined;
  stopRealtimeBackgroundWorkers();
  outputChannel.info("Deactivating Containerlab extension.");
}
