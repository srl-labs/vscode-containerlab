import * as vscode from 'vscode';
import { promisify } from 'util';
import { exec } from 'child_process';
import { TopoViewer } from './topoViewer/backend/topoViewerWebUiFacade';
import {
  deploy,
  deployCleanup,
  deploySpecificFile,
  destroy,
  destroyCleanup,
  redeploy,
  redeployCleanup,
  inspectAllLabs,
  inspectOneLab,
  openLabFile,
  openFolderInNewWindow,
  startNode,
  stopNode,
  attachShell,
  sshToNode,
  showLogs,
  graphNextUI,
  graphDrawIO,
  graphDrawIOInteractive,
  addLabFolderToWorkspace,
  copyLabPath,
  copyContainerIPv4Address,
  copyContainerIPv6Address,
  copyContainerName,
  copyContainerID,
  copyContainerImage,
  copyContainerKind
} from './commands/index';
import { ClabTreeDataProvider } from './clabTreeDataProvider';
import { log } from 'console';




export let outputChannel: vscode.OutputChannel;
const execAsync = promisify(exec);
export const execCmdMapping = require('../resources/exec_cmd.json');

console.log(execCmdMapping);

export async function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel("Containerlab");
  context.subscriptions.push(outputChannel);

  // Check if containerlab is installed
  let versionOutput: string;
  try {
    const { stdout } = await execAsync('sudo containerlab version');
    versionOutput = stdout;
  } catch (err) {
    // Show error message with button to open installation guide
    const installAction = 'Open Installation Guide';
    const selection = await vscode.window.showErrorMessage(
      'containerlab not detected. Please install it first.',
      installAction
    );

    if (selection === installAction) {
      vscode.env.openExternal(vscode.Uri.parse('https://containerlab.dev/install/'));
    }
    versionOutput = '';
  }

  // const provider = new ContainerlabTreeDataProvider(context);
  const provider = new ClabTreeDataProvider(context);
  vscode.window.registerTreeDataProvider('containerlabExplorer', provider);

  context.subscriptions.push(vscode.commands.registerCommand('containerlab.refresh', () => {
    provider.refresh();
  }));

  context.subscriptions.push(vscode.commands.registerCommand('containerlab.lab.openFile', openLabFile));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.lab.addToWorkspace', addLabFolderToWorkspace));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.lab.openFolderInNewWindow', openFolderInNewWindow));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.lab.copyPath', copyLabPath));

  context.subscriptions.push(vscode.commands.registerCommand('containerlab.lab.deploy', deploy));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.lab.deploy.cleanup', deployCleanup));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.lab.deploy.specificFile', deploySpecificFile));

  context.subscriptions.push(vscode.commands.registerCommand('containerlab.lab.redeploy', redeploy));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.lab.redeploy.cleanup', redeployCleanup));

  context.subscriptions.push(vscode.commands.registerCommand('containerlab.lab.destroy', destroy));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.lab.destroy.cleanup', destroyCleanup));

  context.subscriptions.push(
    vscode.commands.registerCommand("containerlab.inspectAll", () => inspectAllLabs(context))
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("containerlab.inspectOneLab", (node) => inspectOneLab(node, context))
  );

  context.subscriptions.push(vscode.commands.registerCommand('containerlab.lab.graph', graphNextUI));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.lab.graph.drawio', graphDrawIO));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.lab.graph.drawio.interactive', graphDrawIOInteractive));

  context.subscriptions.push(vscode.commands.registerCommand('containerlab.node.start', startNode));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.node.stop', stopNode));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.node.attachShell', attachShell));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.node.ssh', sshToNode));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.node.showLogs', showLogs));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.node.copyIPv4Address', copyContainerIPv4Address));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.node.copyIPv6Address', copyContainerIPv6Address));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.node.copyName', copyContainerName));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.node.copyID', copyContainerID));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.node.copyKind', copyContainerKind));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.node.copyImage', copyContainerImage));

  const config = vscode.workspace.getConfiguration("containerlab");
  const refreshInterval = config.get<number>("refreshInterval", 10000);

  const intervalId = setInterval(() => {
    provider.refresh();
  }, refreshInterval);
  context.subscriptions.push({ dispose: () => clearInterval(intervalId) });


  // Create an instance of TopoViewer

  // prepare providerData
  // const clabTreeDataToTopoviewer = (JSON.
  //   stringify(await provider.
  //     discoverInspectLabs(), null, "\t"))

  // aarafat-tag:
  // parse the JSON data of provider.discoverInspectLabs() to clabTreeDataToTopoviewer safely
  const clabTreeDataToTopoviewer = await provider.discoverInspectLabs();

  const viewer = new TopoViewer(context);
  const cmd = vscode.commands.registerCommand('containerlab.topoViewer', async (node) => {
    if (!node) {
      vscode.window.showErrorMessage('No lab node selected.');
      return;
    }

    const labPath = node.labPath.absolute;

    // const labPath = node.details?.labPath;
    const labLabel = node.label || "Lab";
    if (!labPath) {
      vscode.window.showErrorMessage('No labPath to redeploy.');
      return;
    }

    // const yamlFilePath = path.join(__dirname, '..', 'clab-demo.yaml');
    try {
      // await viewer.openViewer(yamlFilePath);

      await viewer.openViewer(labPath, clabTreeDataToTopoviewer);

    } catch (err) {
      vscode.window.showErrorMessage(`Failed to open Topology Viewer: ${err}`);
      console.error(`[ERROR] Failed to open topology viewer`, err);
    }
  });
  context.subscriptions.push(cmd);

  // End of Create an instance of TopoViewer

}


export function deactivate() { }