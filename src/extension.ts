import * as vscode from 'vscode';
import * as cmd from './commands/index';
import * as utils from './utils';
import * as ins from "./treeView/inspector"
import * as c from './treeView/common';
import * as path from 'path';

import {
  ensureClabInstalled,
  checkAndUpdateClabIfNeeded,
  runWithSudo
} from './helpers/containerlabUtils';
import { TopoViewerEditor } from './topoViewerEditor/backend/topoViewerEditorWebUiFacade'; // adjust the import path as needed


import { WelcomePage } from './welcomePage';
import { LocalLabTreeDataProvider } from './treeView/localLabsProvider';
import { RunningLabTreeDataProvider } from './treeView/runningLabsProvider';
import { HelpFeedbackProvider } from './treeView/helpFeedbackProvider';

/** Our global output channel */
export let outputChannel: vscode.OutputChannel;
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

export const extensionVersion = vscode.extensions.getExtension('srl-labs.vscode-containerlab')?.packageJSON.version;

export async function refreshSshxSessions() {
  try {
    const out = await runWithSudo(
      'containerlab tools sshx list -f json',
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
        let lab: string | undefined;
        if (typeof s.network === 'string' && s.network.startsWith('clab-')) {
          lab = s.network.replace(/^clab-/, '');
        }
        if (!lab && typeof s.name === 'string') {
          const name = s.name;
          if (name.startsWith('sshx-')) {
            lab = name.replace(/^sshx-/, '');
          } else if (name.startsWith('clab-') && name.endsWith('-sshx')) {
            lab = name.slice(5, -5);
          }
        }
        if (lab) {
          sshxSessions.set(lab, s.link);
        }
      });
    }
  } catch (err: any) {
    outputChannel.appendLine(`[ERROR] Failed to refresh SSHX sessions: ${err.message || err}`);
  }
}

export const execCmdMapping = require('../resources/exec_cmd.json');
export const sshUserMapping = require('../resources/ssh_users.json');

/**
 * Called when VSCode activates your extension.
 */
export async function activate(context: vscode.ExtensionContext) {
  // Create and register the output channel
  outputChannel = vscode.window.createOutputChannel('Containerlab');
  context.subscriptions.push(outputChannel);

  outputChannel.appendLine(process.platform);

  // Allow activation only on Linux or when connected via WSL.
  if (process.platform !== "linux" && vscode.env.remoteName !== "wsl") {
    vscode.window.showWarningMessage(
      "The Containerlab extension is only supported on Linux or WSL. It will not be activated on this system."
    );
    return; // Do not activate the extension.
  }

  outputChannel.appendLine('[DEBUG] Containerlab extension activated.');

  // 1) Ensure containerlab is installed
  const clabInstalled = await ensureClabInstalled(outputChannel);
  if (!clabInstalled) {
    // If user declined installation, bail out
    return;
  }

  // 2) If installed, check for updates
  checkAndUpdateClabIfNeeded(outputChannel, context).catch(err => {
    outputChannel.appendLine(`[ERROR] Update check error: ${err.message}`);
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

  // Register commands

  // Refresh the tree view
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.refresh', () => {
      localLabsProvider.refresh();
      runningLabsProvider.refresh();
    })
  );

  // Lab file and workspace commands
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.lab.openFile', cmd.openLabFile)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.lab.addToWorkspace', cmd.addLabFolderToWorkspace)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.lab.openFolderInNewWindow', cmd.openFolderInNewWindow)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.lab.copyPath', cmd.copyLabPath)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.lab.cloneRepo', cmd.cloneRepo)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.lab.clonePopularRepo', cmd.clonePopularRepo)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.lab.toggleFavorite', cmd.toggleFavorite)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.lab.delete', cmd.deleteLab)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.viewLogs', () => {
      outputChannel.show(true);
    })
  );

  // Lab deployment commands
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.lab.deploy', cmd.deploy)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.lab.deploy.cleanup', cmd.deployCleanup)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.lab.deploy.specificFile', cmd.deploySpecificFile)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.lab.deployPopular', cmd.deployPopularLab)
  );

  // Lab redeployment commands
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.lab.redeploy', cmd.redeploy)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.lab.redeploy.cleanup', cmd.redeployCleanup)
  );

  // Lab destruction commands
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.lab.destroy', cmd.destroy)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.lab.destroy.cleanup', cmd.destroyCleanup)
  );

  // Lab save command
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.lab.save', cmd.saveLab)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.lab.sshx.attach', cmd.sshxAttach)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.lab.sshx.detach', cmd.sshxDetach)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.lab.sshx.reattach', cmd.sshxReattach)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.lab.sshx.copyLink', (link: string) => cmd.sshxCopyLink(link))
  );

  // Lab connecto to SSH
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.lab.sshToAllNodes', cmd.sshToLab)
  );

  // Lab inspection commands
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.inspectAll', () =>
      cmd.inspectAllLabs(context)
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.inspectOneLab', node =>
      cmd.inspectOneLab(node, context)
    )
  );

  // Lab graph commands
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'containerlab.lab.graph.drawio.horizontal',
      cmd.graphDrawIOHorizontal
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'containerlab.lab.graph.drawio.vertical',
      cmd.graphDrawIOVertical
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'containerlab.lab.graph.drawio.interactive',
      cmd.graphDrawIOInteractive
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.lab.graph.topoViewer', node =>
      cmd.graphTopoviewer(node, context)
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'containerlab.lab.graph.topoViewerReload',
      cmd.graphTopoviewerReload
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'containerlab.editor.topoViewerEditor.open',
      async (node?: c.ClabLabTreeNode) => {
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

        const labName = path.basename(yamlUri.fsPath, path.extname(yamlUri.fsPath));

        const editor = new TopoViewerEditor(context);

        editor.lastYamlFilePath = yamlUri.fsPath;

        await editor.createWebviewPanel(context, yamlUri, labName);

        await editor.openTemplateFile(yamlUri.fsPath);
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.editor.topoViewerEditor', async () => {

      // Show a single "Save As" dialog where they both pick the folder AND type the filename:
      const uri = await vscode.window.showSaveDialog({
        title: 'Enter containerlab topology template file name',
        defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri,  // start in first workspace folder otherwise in home directory
        saveLabel: 'Create Containerlab topology template file',
        filters: { 'YAML': ['yaml', 'yml'] }
      })

      if (!uri) {
        vscode.window.showWarningMessage('No file path selected. Operation canceled.');
        return;
      }

      // Derive the labName (without extension) from what they typed:
      const labName = path.basename(uri.fsPath, path.extname(uri.fsPath));

      // Delegate to your template‑writer helper:
      const editor = new TopoViewerEditor(context);
      try {
        await editor.createTemplateFile(context, uri);

        // Open the webview panel topoViewerEditor.
        await editor.createWebviewPanel(context, uri, labName)

        // Open the created file in a split editor.
        await editor.openTemplateFile(editor.lastYamlFilePath);

      } catch {
        // createTemplateFile will have already shown an error
        return;
      }

    })
  );

  // Register configuration for file watching
  vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('containerlab.autoSync')) {
      // Access the setting to trigger any watchers
      void vscode.workspace.getConfiguration('containerlab').get('autoSync', true);
    }
  });

  // Node commands
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.node.start', cmd.startNode)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.node.stop', cmd.stopNode)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.node.save', cmd.saveNode)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.node.attachShell', cmd.attachShell)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.node.ssh', cmd.sshToNode)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.node.telnet', cmd.telnetToNode)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.node.showLogs', cmd.showLogs)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.node.openBrowser', cmd.openBrowser)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.node.manageImpairments', node =>
      cmd.manageNodeImpairments(node, context)
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'containerlab.node.copyIPv4Address',
      cmd.copyContainerIPv4Address
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'containerlab.node.copyIPv6Address',
      cmd.copyContainerIPv6Address
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.node.copyName', cmd.copyContainerName)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.node.copyID', cmd.copyContainerID)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.node.copyKind', cmd.copyContainerKind)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.node.copyImage', cmd.copyContainerImage)
  );

  // Interface commands
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.interface.capture', cmd.captureInterface)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'containerlab.interface.captureWithEdgeshark',
      (clickedNode, allSelectedNodes) => {
        cmd.captureInterfaceWithPacketflix(clickedNode, allSelectedNodes);
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.interface.setDelay', cmd.setLinkDelay)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.interface.setJitter', cmd.setLinkJitter)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.interface.setLoss', cmd.setLinkLoss)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.interface.setRate', cmd.setLinkRate)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'containerlab.interface.setCorruption',
      cmd.setLinkCorruption
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.interface.copyMACAddress', cmd.copyMACAddress)
  );

  // Edgeshark install/uninstall
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.install.edgeshark', cmd.installEdgeshark)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.uninstall.edgeshark', cmd.uninstallEdgeshark)
  );

  // Session hostname command
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.set.sessionHostname', cmd.setSessionHostname)
  );

  // Hide/show non-owned labs
  const hideNonOwnedLabs = (hide: boolean) => {
    hideNonOwnedLabsState = hide;
    vscode.commands.executeCommand('setContext', 'containerlab:nonOwnedLabsHidden', hide);
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.treeView.runningLabs.hideNonOwnedLabs', () => {
      runningLabsProvider.refreshWithoutDiscovery();
      hideNonOwnedLabs(true);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.treeView.runningLabs.showNonOwnedLabs', () => {
      runningLabsProvider.refreshWithoutDiscovery();
      hideNonOwnedLabs(false);
    })
  );

  // Filter commands for running labs
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.treeView.runningLabs.filter', async () => {
      const val = await vscode.window.showInputBox({ placeHolder: 'Filter running labs' });
      if (val !== undefined) {
        runningLabsProvider.setTreeFilter(val);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.treeView.runningLabs.clearFilter', () => {
      runningLabsProvider.clearTreeFilter();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.treeView.localLabs.filter', async () => {
      const val = await vscode.window.showInputBox({ placeHolder: 'Filter local labs' });
      if (val !== undefined) {
        localLabsProvider.setTreeFilter(val);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.treeView.localLabs.clearFilter', () => {
      localLabsProvider.clearTreeFilter();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.openLink', (url: string) => {
      cmd.openLink(url);
    })
  );

  // fcli commands
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.lab.fcli.bgpPeers', cmd.fcliBgpPeers)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.lab.fcli.bgpRib', cmd.fcliBgpRib)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.lab.fcli.ipv4Rib', cmd.fcliIpv4Rib)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.lab.fcli.lldp', cmd.fcliLldp)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.lab.fcli.mac', cmd.fcliMac)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.lab.fcli.ni', cmd.fcliNi)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.lab.fcli.subif', cmd.fcliSubif)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.lab.fcli.sysInfo', cmd.fcliSysInfo)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.lab.fcli.custom', cmd.fcliCustom)
  );

  // Auto-refresh the TreeView based on user setting
  const config = vscode.workspace.getConfiguration('containerlab');
  const refreshInterval = config.get<number>('refreshInterval', 10000);

  const refreshTaskID = setInterval(
    async ()=> {
      ins.update().then( () => {
        // Only refresh running labs - local labs use file watchers
        runningLabsProvider.softRefresh();
      })
    }, refreshInterval
  )

  context.subscriptions.push({ dispose: () => clearInterval(refreshTaskID)});
}

export function deactivate() {
  if (outputChannel) {
    outputChannel.appendLine('[DEBUG] Deactivating Containerlab extension.');
  }
}
