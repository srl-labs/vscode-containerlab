import * as vscode from 'vscode';
import * as cmd from './commands/index';
import * as utils from './helpers/utils';
import * as ins from "./treeView/inspector"
import * as c from './treeView/common';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';

import { TopoViewerEditor } from './topoViewer/providers/topoViewerEditorWebUiFacade';
import { setCurrentTopoViewer } from './commands/graph';


import { WelcomePage } from './welcomePage';
import { LocalLabTreeDataProvider } from './treeView/localLabsProvider';
import { RunningLabTreeDataProvider } from './treeView/runningLabsProvider';
import { HelpFeedbackProvider } from './treeView/helpFeedbackProvider';
import { registerClabImageCompletion } from './yaml/imageCompletion';
import { onDataChanged } from "./services/containerlabEvents";

/** Our global output channel */
export let outputChannel: vscode.LogOutputChannel;
export let treeView: any;
export let localTreeView: any;
export let runningTreeView: any;
export let helpTreeView: any;
export let username: string;
export let hideNonOwnedLabsState: boolean = false;
export let favoriteLabs: Set<string> = new Set();
export let extensionContext: vscode.ExtensionContext;
export let localLabsProvider: LocalLabTreeDataProvider;
export let runningLabsProvider: RunningLabTreeDataProvider;
export let helpFeedbackProvider: HelpFeedbackProvider;
export let sshxSessions: Map<string, string> = new Map();
export let gottySessions: Map<string, string> = new Map();
export const DOCKER_IMAGES_STATE_KEY = 'dockerImages';

export const extensionVersion = vscode.extensions.getExtension('srl-labs.vscode-containerlab')?.packageJSON.version;

export let containerlabBinaryPath: string = 'containerlab';

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

function extractLabName(session: any, prefix: string): string | undefined {
  if (typeof session.network === 'string' && session.network.startsWith('clab-')) {
    return session.network.slice(5);
  }
  if (typeof session.name !== 'string') {
    return undefined;
  }
  const name = session.name;
  if (name.startsWith(`${prefix}-`)) {
    return name.slice(prefix.length + 1);
  }
  if (name.startsWith('clab-') && name.endsWith(`-${prefix}`)) {
    return name.slice(5, -(prefix.length + 1));
  }
  return undefined;
}

export async function refreshSshxSessions() {
  try {
    const out = await utils.runWithSudo(
      `${containerlabBinaryPath} tools sshx list -f json`,
      'List SSHX sessions',
      outputChannel,
      'containerlab',
      true
    ) as string;
    sshxSessions.clear();
    if (out) {
      const parsed = JSON.parse(out);
      parsed.forEach((s: any) => {
        if (!s.link || s.link === 'N/A') {
          return;
        }
        const lab = extractLabName(s, 'sshx');
        if (lab) {
          sshxSessions.set(lab, s.link);
        }
      });
    }
  } catch (err: any) {
    outputChannel.error(`Failed to refresh SSHX sessions: ${err.message || err}`);
  }
}

export async function refreshGottySessions() {
  try {
    const out = await utils.runWithSudo(
      `${containerlabBinaryPath} tools gotty list -f json`,
      'List GoTTY sessions',
      outputChannel,
      'containerlab',
      true
    ) as string;
    gottySessions.clear();
    if (out) {
      const parsed = JSON.parse(out);
      const { getHostname } = await import('./commands/capture');
      const hostname = await getHostname();

      parsed.forEach((s: any) => {
        if (!s.port || !hostname) {
          return;
        }
        const lab = extractLabName(s, 'gotty');
        if (lab) {
          // Construct the URL using hostname and port
          const bracketed = hostname.includes(":") ? `[${hostname}]` : hostname;
          const url = `http://${bracketed}:${s.port}`;
          gottySessions.set(lab, url);
        }
      });
    }
  } catch (err: any) {
    outputChannel.error(`Failed to refresh GoTTY sessions: ${err.message || err}`);
  }
}

/**
 * Refreshes the cached list of local Docker images and stores them in extension global state.
 * The list is a unique, sorted array of strings in the form "repository:tag".
 */
export async function refreshDockerImages(context?: vscode.ExtensionContext): Promise<void> {
  // Fail silently if docker is not available or any error occurs.
  const ctx = context ?? extensionContext;
  if (!ctx) return;
  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    const { stdout } = await execAsync('docker images --format "{{.Repository}}:{{.Tag}}"');
    const images = (stdout || '')
      .split(/\r?\n/)
      .map(s => s.trim())
      .filter(s => s && !s.endsWith(':<none>') && !s.startsWith('<none>'));
    const unique = Array.from(new Set(images)).sort((a, b) => a.localeCompare(b));
    await ctx.globalState.update(DOCKER_IMAGES_STATE_KEY, unique);
  } catch {
    // On failure, do not prompt or log; leave cache as-is.
    return;
  }
}

import * as execCmdJson from '../resources/exec_cmd.json';
import * as sshUserJson from '../resources/ssh_users.json';

export const execCmdMapping = execCmdJson;
export const sshUserMapping = sshUserJson;

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
  const ctx = extensionContext;
  if (!ctx) {
    return;
  }
  if (!node) {
    node = runningTreeView?.selection[0] || localTreeView?.selection[0];
  }
  let yamlUri: vscode.Uri | undefined;
  if (node && node.labPath) {
    yamlUri = vscode.Uri.file(node.labPath.absolute);
  } else if (vscode.window.activeTextEditor) {
    yamlUri = vscode.window.activeTextEditor.document.uri;
  }
  if (!yamlUri) {
    vscode.window.showErrorMessage('No lab node or topology file selected');
    return;
  }
  const baseName = path.basename(yamlUri.fsPath);
  const labName = baseName.replace(/\.clab\.(yml|yaml)$/i, '').replace(/\.(yml|yaml)$/i, '');
  const editor = new TopoViewerEditor(ctx);
  setCurrentTopoViewer(editor);
  editor.lastYamlFilePath = yamlUri.fsPath;
  await editor.createWebviewPanel(ctx, yamlUri, labName);
  // Ensure the global TopoViewer state tracks the created panel so command callbacks can update it
  setCurrentTopoViewer(editor);
  if (editor.currentPanel) {
    editor.currentPanel.onDidDispose(() => {
      setCurrentTopoViewer(undefined);
    });
  }
  await editor.openTemplateFile(yamlUri.fsPath);
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
  const baseName = path.basename(uri.fsPath);
  const labName = baseName.replace(/\.clab\.(yml|yaml)$/i, '').replace(/\.(yml|yaml)$/i, '');
  const editor = new TopoViewerEditor(ctx);
  setCurrentTopoViewer(editor);
  try {
    await editor.createTemplateFile(uri);
    await editor.createWebviewPanel(ctx, uri, labName);
    // Update the global viewer reference now that the panel is available
    setCurrentTopoViewer(editor);
    if (editor.currentPanel) {
      editor.currentPanel.onDidDispose(() => {
        setCurrentTopoViewer(undefined);
      });
    }
    await editor.openTemplateFile(editor.lastYamlFilePath);
  } catch {
    return;
  }
}

function updateHideNonOwnedLabs(hide: boolean) {
  hideNonOwnedLabsState = hide;
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
    ['containerlab.lab.graph.topoViewerReload', cmd.graphTopoviewerReload],
    ['containerlab.node.start', cmd.startNode],
    ['containerlab.node.stop', cmd.stopNode],
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
  const disposeRealtime = onDataChanged(() => {
    ins.refreshFromEventStream();
    if (runningLabsProvider) {
      void runningLabsProvider.softRefresh().catch(err => {
        console.error("[containerlab extension]: realtime refresh failed", err);
      });
    }
  });
  context.subscriptions.push({ dispose: disposeRealtime });
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
        containerlabBinaryPath = resolvedPath;
        outputChannel.info(`Resolved containerlab binary from sys PATH as: ${resolvedPath}`);
        return true;
      }
    } catch (err) {
      outputChannel.warn(`Could not resolve containerlab bin path from sys PATH: ${err}`);
    }
    containerlabBinaryPath = 'containerlab';
    return true;
  }

  try {
    // Check if file exists and is executable
    fs.accessSync(configPath, fs.constants.X_OK);
    containerlabBinaryPath = configPath;
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
  outputChannel = vscode.window.createOutputChannel('Containerlab', { log: true });
  context.subscriptions.push(outputChannel);

  outputChannel.info(process.platform);

  if (!setClabBinPath()) {
    // dont activate
    return;
  }


  // Allow activation only on Linux or when connected via WSL.
  // If unsupported, stay silent until the user opens the Containerlab view, then show a warning.
  if (!isSupportedPlatform) {
    registerUnsupportedViews(context);
    return;
  // If unsupported, stay silent until the user opens the Containerlab view, then show a warning.
  if (!isSupportedPlatform) {
    registerUnsupportedViews(context);
    return;
  }

  outputChannel.info('Containerlab extension activated.');

  // 1) Ensure containerlab is installed (or skip based on user setting)
  const skipInstallationCheck = config.get<boolean>('skipInstallationCheck', false);
  const clabInstalled = skipInstallationCheck
    ? await utils.isClabInstalled(outputChannel)
    : await utils.ensureClabInstalled(outputChannel);
  // 1) Ensure containerlab is installed (or skip based on user setting)
  const skipInstallationCheck = config.get<boolean>('skipInstallationCheck', false);
  const clabInstalled = skipInstallationCheck
    ? await utils.isClabInstalled(outputChannel)
    : await utils.ensureClabInstalled(outputChannel);
  if (!clabInstalled) {
    if (skipInstallationCheck) {
      outputChannel.info('containerlab not detected; skipping activation because installation checks are disabled.');
    }
    if (skipInstallationCheck) {
      outputChannel.info('containerlab not detected; skipping activation because installation checks are disabled.');
    }
    return;
  }

  // 2) If installed, check for updates
  utils.checkAndUpdateClabIfNeeded(outputChannel, context).catch(err => {
    outputChannel.error(`Update check error: ${err.message}`);
  });

  // Show welcome page
  const welcomePage = new WelcomePage(context);
  await welcomePage.show();

  // Initial pull of inspect data
  ins.update();

  // Tree data provider
  extensionContext = context;
  favoriteLabs = new Set(context.globalState.get<string[]>('favoriteLabs', []));

  localLabsProvider = new LocalLabTreeDataProvider();
  runningLabsProvider = new RunningLabTreeDataProvider(context);
  helpFeedbackProvider = new HelpFeedbackProvider();

  await refreshSshxSessions();
  await refreshGottySessions();
  // Docker images are refreshed on TopoViewer open to avoid unnecessary calls


  localTreeView = vscode.window.createTreeView('localLabs', {
    treeDataProvider: localLabsProvider,
    canSelectMany: true
  });

  runningTreeView = vscode.window.createTreeView('runningLabs', {
    treeDataProvider: runningLabsProvider,
    canSelectMany: true
  });

  helpTreeView = vscode.window.createTreeView('helpFeedback', {
    treeDataProvider: helpFeedbackProvider,
    canSelectMany: false
  });

  registerRealtimeUpdates(context);

  // get the username
  username = utils.getUsername();

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

  // Auto-refresh the TreeView based on user setting
  refreshInterval = config.get<number>('refreshInterval', 5000);

  // Only refresh when window is focused to prevent queue buildup when tabbed out
  context.subscriptions.push(
    vscode.window.onDidChangeWindowState(e => {
      if (e.focused) {
        // Window gained focus - refresh immediately, then start interval
        refreshTask();
        startRefreshInterval();
      } else {
        // Window lost focus - stop the interval to prevent queue buildup
        stopRefreshInterval();
      }
    })
  );

  // Start the interval if window is already focused
  if (vscode.window.state.focused) {
    startRefreshInterval();
  }

  context.subscriptions.push({ dispose: () => stopRefreshInterval() });
}

export function deactivate() {
  if (outputChannel) {
    outputChannel.info('Deactivating Containerlab extension.');
  }
}
