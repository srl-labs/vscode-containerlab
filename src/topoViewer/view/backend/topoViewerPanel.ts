import * as vscode from 'vscode';
import { TopoViewerAdaptorClab } from './topoViewerAdaptorClab';
import { log } from './logger';
import { generateWebviewHtml, ViewerTemplateParams } from '../../common/htmlTemplateUtils';
import { ClabContainerTreeNode, ClabInterfaceTreeNode } from '../../../treeView/common';
import { DeploymentState, ViewerMode } from './deploymentUtils';

/* eslint-disable no-unused-vars */
export interface PanelOptions {
  context: vscode.ExtensionContext;
  adaptor: TopoViewerAdaptorClab;
  folderName: string;
  deploymentState: DeploymentState;
  viewerMode: ViewerMode;
  allowedHostname: string;
  findContainerNode: (name: string) => ClabContainerTreeNode | undefined;
  findInterfaceNode: (nodeName: string, intf: string) => ClabInterfaceTreeNode | undefined;
  onUpdatePanelHtml: () => Promise<void>;
}
/* eslint-enable no-unused-vars */

export async function createTopoViewerPanel(options: PanelOptions): Promise<vscode.WebviewPanel> {
  const {
    context,
    adaptor,
    folderName,
    deploymentState,
    viewerMode,
    findContainerNode,
    findInterfaceNode,
    onUpdatePanelHtml,
  } = options;

  const panel = vscode.window.createWebviewPanel(
    'topoViewer',
    `Containerlab Topology: ${folderName}`,
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(context.extensionUri, 'topoViewerData', folderName),
        vscode.Uri.joinPath(context.extensionUri, 'dist'),
      ],
    }
  );

  const iconUri = vscode.Uri.joinPath(context.extensionUri, 'resources', 'containerlab.png');
  panel.iconPath = iconUri;

  await vscode.commands.executeCommand('setContext', 'isTopoviewerActive', true);
  log.info(`Context key 'isTopoviewerActive' set to true`);

  const themeChangeListener = vscode.window.onDidChangeActiveColorTheme(() => {
    log.info('Theme change detected, refreshing TopoViewer');
    onUpdatePanelHtml().catch(err =>
      log.error(`Failed to refresh panel on theme change: ${err}`)
    );
  });

  panel.onDidDispose(
    () => {
      vscode.commands.executeCommand('setContext', 'isTopoviewerActive', false);
      log.info(`Context key 'isTopoviewerActive' set to false`);
      themeChangeListener.dispose();
    },
    null,
    context.subscriptions
  );

  const viewerParams: Partial<ViewerTemplateParams> = {
    deploymentState,
    viewerMode,
  };

  panel.webview.html = generateWebviewHtml(
    context,
    panel,
    'viewer',
    folderName,
    adaptor,
    viewerParams
  );

  panel.webview.onDidReceiveMessage(async msg => {
    if (!msg || typeof msg !== 'object' || msg.type !== 'POST') {
      return;
    }

    const { requestId, endpointName, payload } = msg;
    let result: unknown = null;
    let error: string | undefined;

    try {
      const payloadObj = payload ? JSON.parse(payload as string) : undefined;
      switch (endpointName) {
        case 'clab-node-connect-ssh': {
          const nodeName = payloadObj as string;
          const node = findContainerNode(nodeName);
          if (!node) {
            throw new Error(`Node ${nodeName} not found`);
          }
          await vscode.commands.executeCommand('containerlab.node.ssh', node);
          result = `SSH executed for ${nodeName}`;
          break;
        }
        case 'clab-node-attach-shell': {
          const nodeName = payloadObj as string;
          const node = findContainerNode(nodeName);
          if (!node) {
            throw new Error(`Node ${nodeName} not found`);
          }
          await vscode.commands.executeCommand('containerlab.node.attachShell', node);
          result = `Attach shell executed for ${nodeName}`;
          break;
        }
        case 'clab-node-view-logs': {
          const nodeName = payloadObj as string;
          const node = findContainerNode(nodeName);
          if (!node) {
            throw new Error(`Node ${nodeName} not found`);
          }
          await vscode.commands.executeCommand('containerlab.node.showLogs', node);
          result = `Show logs executed for ${nodeName}`;
          break;
        }
        case 'clab-link-capture': {
          const { nodeName, interfaceName } = payloadObj as {
            nodeName: string;
            interfaceName: string;
          };
          const iface = findInterfaceNode(nodeName, interfaceName);
          if (!iface) {
            throw new Error(`Interface ${nodeName}/${interfaceName} not found`);
          }
          await vscode.commands.executeCommand('containerlab.interface.captureWithEdgeshark', iface);
          result = `Capture executed for ${nodeName}/${interfaceName}`;
          break;
        }
        case 'clab-link-capture-edgeshark-vnc': {
          const { nodeName, interfaceName } = payloadObj as {
            nodeName: string;
            interfaceName: string;
          };
          const iface = findInterfaceNode(nodeName, interfaceName);
          if (!iface) {
            throw new Error(`Interface ${nodeName}/${interfaceName} not found`);
          }
          await vscode.commands.executeCommand('containerlab.interface.captureWithEdgesharkVNC', iface);
          result = `VNC capture executed for ${nodeName}/${interfaceName}`;
          break;
        }
        default:
          error = `Unknown endpoint: ${endpointName}`;
          break;
      }
    } catch (err: any) {
      error = err.message ?? String(err);
    }

    panel.webview.postMessage({
      type: 'POST_RESPONSE',
      requestId,
      result,
      error,
    });
  });

  log.info('Webview panel created successfully');
  return panel;
}

