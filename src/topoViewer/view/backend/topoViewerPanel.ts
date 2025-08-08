import * as vscode from 'vscode';
import { TopoViewerAdaptorClab } from './topoViewerAdaptorClab';
import { log } from './logger';
import { getHTMLTemplate } from '../webview-ui/html-static/template/vscodeHtmlTemplate';
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
    allowedHostname,
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
        vscode.Uri.joinPath(context.extensionUri, 'src', 'topoViewer', 'webview-ui', 'html-static'),
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

  const { css, js, images } = adaptor.generateStaticAssetUris(context, panel.webview);

  const jsOutDir = panel.webview
    .asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'dist'))
    .toString();

  const mediaPath = vscode.Uri.joinPath(context.extensionUri, 'topoViewerData', folderName);
  const jsonFileUriDataCytoMarshall = vscode.Uri.joinPath(mediaPath, 'dataCytoMarshall.json');
  const jsonFileUrlDataCytoMarshall = panel.webview
    .asWebviewUri(jsonFileUriDataCytoMarshall)
    .toString();

  const jsonFileUriDataEnvironment = vscode.Uri.joinPath(mediaPath, 'environment.json');
  const jsonFileUrlDataEnvironment = panel.webview
    .asWebviewUri(jsonFileUriDataEnvironment)
    .toString();

  const schemaUri = panel.webview
    .asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'schema', 'clab.schema.json'))
    .toString();

  panel.webview.html = getWebviewContent(
    css,
    js,
    schemaUri,
    images,
    jsonFileUrlDataCytoMarshall,
    jsonFileUrlDataEnvironment,
    true,
    jsOutDir,
    allowedHostname,
    deploymentState,
    viewerMode,
    adaptor.currentClabTopo?.name || 'Unknown Topology'
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

export function getWebviewContent(
  cssUri: string,
  jsUri: string,
  schemaUri: string,
  imagesUri: string,
  jsonFileUrlDataCytoMarshall: string,
  jsonFileUrlDataEnvironment: string,
  isVscodeDeployment: boolean,
  jsOutDir: string,
  allowedhostname: string,
  deploymentState: DeploymentState,
  viewerMode: ViewerMode,
  topologyName: string
): string {
  const isDarkTheme =
    vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ||
    vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.HighContrast;

  return getHTMLTemplate(
    cssUri,
    jsUri,
    schemaUri,
    imagesUri,
    jsonFileUrlDataCytoMarshall,
    jsonFileUrlDataEnvironment,
    isVscodeDeployment,
    jsOutDir,
    allowedhostname,
    deploymentState,
    viewerMode,
    topologyName,
    isDarkTheme
  );
}
