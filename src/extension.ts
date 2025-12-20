import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';

import * as vscode from 'vscode';
import Docker from 'dockerode';

import * as cmd from './commands/index';
import * as utils from './utils/index';
import * as ins from "./treeView/inspector"
import * as c from './treeView/common';
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
  setLocalTreeView,
  setRunningTreeView,
  setHelpTreeView,
  setHideNonOwnedLabsState,
} from './globals';
import { refreshSshxSessions, refreshGottySessions } from './services/sessionRefresh';

// Note: Most globals are now in ./globals.ts - import from there instead of extension.ts

import { WelcomePage } from './welcomePage';
import { LocalLabTreeDataProvider } from './treeView/localLabsProvider';
import { RunningLabTreeDataProvider } from './treeView/runningLabsProvider';
import { HelpFeedbackProvider } from './treeView/helpFeedbackProvider';
import { registerClabImageCompletion } from './yaml/imageCompletion';
import { onDataChanged as onEventsDataChanged, onContainerStateChanged } from "./services/containerlabEvents";
import { onDataChanged as onFallbackDataChanged, stopPolling as stopFallbackPolling } from "./services/containerlabInspectFallback";
import { isPollingMode } from "./treeView/inspector";

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

  const unsupportedProvider: vscode.TreeDataProvider<vscode.TreeItem> = {
    getTreeItem: (item: vscode.TreeItem) => item,
    getChildren: () => {
      const item = new vscode.TreeItem(
        "Containerlab extension requires Linux or WSL.",
        vscode.TreeItemCollapsibleState.None
      );
      item.description = "Features are disabled on this platform.";
      item.iconPath = new vscode.ThemeIcon('warning');
      item.command = {
        command: 'vscode.open',
        title: 'Open docs',
        arguments: [vscode.Uri.parse('https://containerlab.dev/manual/vsc-extension/')]
      };
      return [item];
    }
  };

  ['runningLabs', 'localLabs', 'helpFeedback'].forEach(viewId => {
    const view = vscode.window.createTreeView(viewId, {
      treeDataProvider: unsupportedProvider,
      canSelectMany: false
    });
    context.subscriptions.push(
      view.onDidChangeVisibility(e => {
        if (e.visible) {
          showWarningOnce();
        }
      })
    );
    context.subscriptions.push(view);
  });
}

// Re-export session refresh functions for backward compatibility
export { refreshSshxSessions, refreshGottySessions } from './services/sessionRefresh';



function showOutputChannel() {
  outputChannel.show(true);
}

async function refreshLabViews() {
  await ins.update();
  localLabsProvider.forceRefresh();
  runningLabsProvider.refresh();
}

function manageImpairments(node: any) {
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
    title: 'Enter containerlab topology template file name',
    defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri,
    saveLabel: 'Create Containerlab topology template file',
    filters: { YAML: ['yaml', 'yml'] }
  });
  if (!uri) {
    vscode.window.showWarningMessage('No file path selected. Operation canceled.');
    return;
  }

  // Create a minimal template file
  const baseName = path.basename(uri.fsPath);
  const labName = baseName.replace(/\.clab\.(yml|yaml)$/i, '').replace(/\.(yml|yaml)$/i, '');
  const template = `name: ${labName}

topology:
  nodes:
`;
  fs.writeFileSync(uri.fsPath, template);

  // Open the file in the editor
  const doc = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(doc);

  // Open the TopoViewer
  const node = {
    labPath: { absolute: uri.fsPath, relative: path.basename(uri.fsPath) },
    name: labName
  } as c.ClabLabTreeNode;
  return graphTopoViewer(node);
}

function updateHideNonOwnedLabs(hide: boolean) {
  setHideNonOwnedLabsState(hide);
  vscode.commands.executeCommand('setContext', 'containerlab:nonOwnedLabsHidden', hide);
}

function hideNonOwnedLabsCommand() {
  runningLabsProvider.refreshWithoutDiscovery();
  updateHideNonOwnedLabs(true);
}

function showNonOwnedLabsCommand() {
  runningLabsProvider.refreshWithoutDiscovery();
  updateHideNonOwnedLabs(false);
}

async function filterRunningLabsCommand() {
  const val = await vscode.window.showInputBox({
    placeHolder: 'Filter running labs',
    prompt: 'use * for wildcard, # for numbers: "srl*", "spine#-leaf*", "^spine.*"'
  });
  if (val !== undefined) {
    runningLabsProvider.setTreeFilter(val);
  }
}

function clearRunningLabsFilterCommand() {
  runningLabsProvider.clearTreeFilter();
}

async function filterLocalLabsCommand() {
  const val = await vscode.window.showInputBox({
    placeHolder: 'Filter local labs',
    prompt: 'use * for wildcard, # for numbers: "spine", "*test*", "lab#", "^my-.*"'
  });
  if (val !== undefined) {
    localLabsProvider.setTreeFilter(val);
  }
}

function clearLocalLabsFilterCommand() {
  localLabsProvider.clearTreeFilter();
}

function onDidChangeConfiguration(e: vscode.ConfigurationChangeEvent) {
  if (e.affectsConfiguration('containerlab.autoSync')) {
    // Setting changed; no action required here
  }
}

function registerCommands(context: vscode.ExtensionContext) {
  const commands: Array<[string, any]> = [
    ['containerlab.lab.openFile', cmd.openLabFile],
    ['containerlab.lab.addToWorkspace', cmd.addLabFolderToWorkspace],
    ['containerlab.lab.openFolderInNewWindow', cmd.openFolderInNewWindow],
    ['containerlab.lab.copyPath', cmd.copyLabPath],
    ['containerlab.lab.cloneRepo', cmd.cloneRepo],
    ['containerlab.lab.clonePopularRepo', cmd.clonePopularRepo],
    ['containerlab.lab.toggleFavorite', cmd.toggleFavorite],
    ['containerlab.lab.delete', cmd.deleteLab],
    ['containerlab.lab.deploy', cmd.deploy],
    ['containerlab.lab.deploy.cleanup', cmd.deployCleanup],
    ['containerlab.lab.deploy.specificFile', cmd.deploySpecificFile],
    ['containerlab.lab.deployPopular', cmd.deployPopularLab],
    ['containerlab.lab.redeploy', cmd.redeploy],
    ['containerlab.lab.redeploy.cleanup', cmd.redeployCleanup],
    ['containerlab.lab.destroy', cmd.destroy],
    ['containerlab.lab.destroy.cleanup', cmd.destroyCleanup],
    ['containerlab.lab.save', cmd.saveLab],
    ['containerlab.lab.sshx.attach', cmd.sshxAttach],
    ['containerlab.lab.sshx.detach', cmd.sshxDetach],
    ['containerlab.lab.sshx.reattach', cmd.sshxReattach],
    ['containerlab.lab.sshx.copyLink', cmd.sshxCopyLink],
    ['containerlab.lab.gotty.attach', cmd.gottyAttach],
    ['containerlab.lab.gotty.detach', cmd.gottyDetach],
    ['containerlab.lab.gotty.reattach', cmd.gottyReattach],
    ['containerlab.lab.gotty.copyLink', cmd.gottyCopyLink],
    ['containerlab.lab.sshToAllNodes', cmd.sshToLab],
    ['containerlab.lab.graph.drawio.horizontal', cmd.graphDrawIOHorizontal],
    ['containerlab.lab.graph.drawio.vertical', cmd.graphDrawIOVertical],
    ['containerlab.lab.graph.drawio.interactive', cmd.graphDrawIOInteractive],
    ['containerlab.node.start', cmd.startNode],
    ['containerlab.node.stop', cmd.stopNode],
    ['containerlab.node.pause', cmd.pauseNode],
    ['containerlab.node.unpause', cmd.unpauseNode],
    ['containerlab.node.save', cmd.saveNode],
    ['containerlab.node.attachShell', cmd.attachShell],
    ['containerlab.node.ssh', cmd.sshToNode],
    ['containerlab.node.telnet', cmd.telnetToNode],
    ['containerlab.node.showLogs', cmd.showLogs],
    ['containerlab.node.openBrowser', cmd.openBrowser],
    ['containerlab.node.copyIPv4Address', cmd.copyContainerIPv4Address],
    ['containerlab.node.copyIPv6Address', cmd.copyContainerIPv6Address],
    ['containerlab.node.copyName', cmd.copyContainerName],
    ['containerlab.node.copyID', cmd.copyContainerID],
    ['containerlab.node.copyKind', cmd.copyContainerKind],
    ['containerlab.node.copyImage', cmd.copyContainerImage],
    ['containerlab.interface.capture', cmd.captureInterface],
    ['containerlab.interface.captureWithEdgeshark', cmd.captureInterfaceWithPacketflix],
    ['containerlab.interface.captureWithEdgesharkVNC', cmd.captureEdgesharkVNC],
    ['containerlab.interface.setDelay', cmd.setLinkDelay],
    ['containerlab.interface.setJitter', cmd.setLinkJitter],
    ['containerlab.interface.setLoss', cmd.setLinkLoss],
    ['containerlab.interface.setRate', cmd.setLinkRate],
    ['containerlab.interface.setCorruption', cmd.setLinkCorruption],
    ['containerlab.interface.copyMACAddress', cmd.copyMACAddress],
    ['containerlab.install.edgeshark', cmd.installEdgeshark],
    ['containerlab.uninstall.edgeshark', cmd.uninstallEdgeshark],
    ['containerlab.capture.killAllWiresharkVNC', cmd.killAllWiresharkVNCCtrs],
    ['containerlab.set.sessionHostname', cmd.setSessionHostname],
    ['containerlab.openLink', cmd.openLink],
    ['containerlab.lab.fcli.bgpPeers', cmd.fcliBgpPeers],
    ['containerlab.lab.fcli.bgpRib', cmd.fcliBgpRib],
    ['containerlab.lab.fcli.ipv4Rib', cmd.fcliIpv4Rib],
    ['containerlab.lab.fcli.lldp', cmd.fcliLldp],
    ['containerlab.lab.fcli.mac', cmd.fcliMac],
    ['containerlab.lab.fcli.ni', cmd.fcliNi],
    ['containerlab.lab.fcli.subif', cmd.fcliSubif],
    ['containerlab.lab.fcli.sysInfo', cmd.fcliSysInfo],
    ['containerlab.lab.fcli.custom', cmd.fcliCustom]
  ];
  commands.forEach(([name, handler]) => {
    context.subscriptions.push(vscode.commands.registerCommand(name, handler));
  });
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.refresh', refreshLabViews));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.viewLogs', showOutputChannel));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.node.manageImpairments', manageImpairments));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.lab.graph.topoViewer', graphTopoViewer));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.editor.topoViewerEditor.open', openTopoViewerEditorCommand));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.editor.topoViewerEditor', createTopoViewerTemplateFileCommand));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.inspectAll', () => cmd.inspectAllLabs(extensionContext)));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.inspectOneLab', (node: c.ClabLabTreeNode) => cmd.inspectOneLab(node, extensionContext)));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.treeView.runningLabs.hideNonOwnedLabs', hideNonOwnedLabsCommand));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.treeView.runningLabs.showNonOwnedLabs', showNonOwnedLabsCommand));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.treeView.runningLabs.filter', filterRunningLabsCommand));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.treeView.runningLabs.clearFilter', clearRunningLabsFilterCommand));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.treeView.localLabs.filter', filterLocalLabsCommand));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.treeView.localLabs.clearFilter', clearLocalLabsFilterCommand));
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
        outputChannel.debug(`Failed to refresh container ${containerShortId}: ${err instanceof Error ? err.message : String(err)}`);
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
  const configPath = vscode.workspace.getConfiguration('containerlab').get<string>('binaryPath', '');

  // if empty fall back to resolving from PATH
  if (!configPath || configPath.trim() === '') {
    try {
      // eslint-disable-next-line sonarjs/no-os-command-from-path
      const stdout = execSync('which containerlab', { encoding: 'utf-8' });
      const resolvedPath = stdout.trim();
      if (resolvedPath) {
        setContainerlabBinaryPath(resolvedPath);
        outputChannel.info(`Resolved containerlab binary from sys PATH as: ${resolvedPath}`);
        return true;
      }
    } catch (err) {
      outputChannel.warn(`Could not resolve containerlab bin path from sys PATH: ${err}`);
    }
    setContainerlabBinaryPath('containerlab');
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
  const channel = vscode.window.createOutputChannel('Containerlab', { log: true });
  setOutputChannel(channel);
  context.subscriptions.push(channel);
  outputChannel.info('Registered output channel sucessfully.');
  outputChannel.info(`Detected platform: ${process.platform}`);

  const config = vscode.workspace.getConfiguration('containerlab');
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
  if (containerlabBinaryPath === 'containerlab') {
    const installChoice = await vscode.window.showWarningMessage(
      'Containerlab is not installed. Would you like to install it?',
      'Install',
      'Cancel'
    );
    if (installChoice === 'Install') {
      utils.installContainerlab();
      vscode.window.showInformationMessage(
        'Please complete the installation in the terminal, then reload the window.',
        'Reload Window'
      ).then(choice => {
        if (choice === 'Reload Window') {
          vscode.commands.executeCommand('workbench.action.reloadWindow');
        }
      });
    }
    return;
  }

  outputChannel.info('Containerlab extension activated.');

  outputChannel.debug(`Starting user permissions check`);
  // 1) Check if user has required permissions
  const userInfo = utils.getUserInfo();
  setUsername(userInfo.username);
  if (!userInfo.hasPermission) {
    outputChannel.error(`User '${userInfo.username}' (id:${userInfo.uid}) has insufficient permissions`);

    vscode.window.showErrorMessage(
      `Extension activation failed. Insufficient permissions.\nEnsure ${userInfo.username} is in the 'clab_admins' and 'docker' groups.`
    )
    return;
  }
  outputChannel.debug(`Permission check success for user '${userInfo.username}' (id:${userInfo.uid})`);

  // 2) Check for updates
  const skipUpdateCheck = config.get<boolean>('skipUpdateCheck', false);
  if (!skipUpdateCheck) {
    utils.checkAndUpdateClabIfNeeded(outputChannel, context).catch(err => {
      outputChannel.error(`Update check error: ${err.message}`);
    });
  }

  /**
   * CONNECT TO DOCKER SOCKET VIA DOCKERODE
   */
  try {
    const docker = new Docker({ socketPath: '/var/run/docker.sock' });
    setDockerClient(docker);
    // verify we are connected
    await docker.ping();
    outputChannel.info('Successfully connected to Docker socket');
  } catch (err: any) {
    outputChannel.error(`Failed to connect to Docker socket: ${err.message}`);
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
  utils.refreshDockerImages();
  utils.startDockerImageEventMonitor(context);

  // Show welcome page
  const welcomePage = new WelcomePage(context);
  await welcomePage.show();

  // Initial pull of inspect data
  ins.update();

  // Tree data provider
  setExtensionContext(context);
  setFavoriteLabs(new Set(context.globalState.get<string[]>('favoriteLabs', [])));

  const newLocalProvider = new LocalLabTreeDataProvider();
  const newRunningProvider = new RunningLabTreeDataProvider(context);
  const newHelpProvider = new HelpFeedbackProvider();
  setLocalLabsProvider(newLocalProvider);
  setRunningLabsProvider(newRunningProvider);
  setHelpFeedbackProvider(newHelpProvider);

  await refreshSshxSessions();
  await refreshGottySessions();
  // Docker images are refreshed on TopoViewer open to avoid unnecessary calls


  setLocalTreeView(vscode.window.createTreeView('localLabs', {
    treeDataProvider: newLocalProvider,
    canSelectMany: true
  }));

  setRunningTreeView(vscode.window.createTreeView('runningLabs', {
    treeDataProvider: newRunningProvider,
    canSelectMany: true
  }));

  setHelpTreeView(vscode.window.createTreeView('helpFeedback', {
    treeDataProvider: newHelpProvider,
    canSelectMany: false
  }));

  registerRealtimeUpdates(context);

  // Determine if local capture is allowed.
  const isLocalCaptureAllowed =
    vscode.env.remoteName !== "ssh-remote" && !utils.isOrbstack();
  vscode.commands.executeCommand(
    'setContext',
    'containerlab:isLocalCaptureAllowed',
    isLocalCaptureAllowed
  );

  // Language features (YAML completion)
  registerClabImageCompletion(context);

  // Register commands
  registerCommands(context);
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(onDidChangeConfiguration));
}

export function deactivate() {
  if (outputChannel) {
    outputChannel.info('Deactivating Containerlab extension.');
  }
}
