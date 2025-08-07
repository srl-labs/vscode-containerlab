// file: src/topoViewer/backend/webviewMessageHandler.ts

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as YAML from 'yaml';
import { log } from './logger';
import {
  getHostname,
  attachShell,
  sshToNode,
  showLogs,
  captureInterfaceWithPacketflix,
  captureEdgesharkVNC,
} from '../../commands/index';
import type { TopoViewer } from './topoViewerWebUiFacade';

/**
 * Structure of messages exchanged with the webview.
 */
export interface WebviewMessage {
  type: string;
  command?: string;
  requestId?: string;
  endpointName?: string;
  payload?: string;
}

/**
 * Viewport preset structure used when saving node positions.
 */
interface CytoViewportPositionPreset {
  data: {
    id: string;
    parent: string;
    groupLabelPos: string;
  };
  position: {
    x: number;
    y: number;
  };
}

/**
 * Handle a message sent from the webview.
 *
 * The function is bound to the TopoViewer instance so that `this` refers to
 * the class instance.
 */
export async function handleWebviewMessage(
  this: TopoViewer,
  msg: WebviewMessage,
  panel: vscode.WebviewPanel
): Promise<void> {
  // Handle logging messages originating from the webview
  if (msg.command === 'topoViewerLog') {
    const logData = msg as unknown as {
      command: string;
      level: 'info' | 'debug' | 'warn' | 'error';
      message: string;
      fileLine: string;
      timestamp: string;
    };

    const formattedMessage = `[WebView] ${logData.message} (${logData.fileLine})`;
    switch (logData.level) {
      case 'info':
        log.info(formattedMessage);
        break;
      case 'debug':
        log.debug(formattedMessage);
        break;
      case 'warn':
        log.warn(formattedMessage);
        break;
      case 'error':
        log.error(formattedMessage);
        break;
    }
    return;
  }

  log.info(`Received POST message from frontEnd: ${JSON.stringify(msg, null, 2)}`);

  const payloadObj = JSON.parse(msg.payload as string);
  log.info(
    `Received POST message from frontEnd Pretty Payload:\n${JSON.stringify(payloadObj, null, 2)}`
  );

  // Validate that the message is an object.
  if (!msg || typeof msg !== 'object') {
    log.error('Invalid message received.');
    return;
  }

  // Process only messages of type 'POST'.
  if (msg.type !== 'POST') {
    log.warn(`Unrecognized message type: ${msg.type}`);
    return;
  }

  const { requestId, endpointName, payload } = msg;
  if (!requestId || !endpointName) {
    const missingFields = [] as string[];
    if (!requestId) missingFields.push('requestId');
    if (!endpointName) missingFields.push('endpointName');
    const errorMessage = `Missing required field(s): ${missingFields.join(', ')}`;
    log.error(errorMessage);
    panel.webview.postMessage({
      type: 'POST_RESPONSE',
      requestId: requestId ?? null,
      result: null,
      error: errorMessage,
    });
    return;
  }

  let result: unknown = null;
  let error: string | null = null;

  try {
    switch (endpointName) {
      case 'reload-viewport': {
        try {
          await this.updatePanelHtml(this.currentTopoViewerPanel);
          result = `Endpoint "${endpointName}" executed successfully.`;
          log.info(result);
        } catch (innerError) {
          result = `Error executing endpoint "${endpointName}".`;
          log.error(
            `Error executing endpoint "${endpointName}": ${JSON.stringify(innerError, null, 2)}`
          );
        }
        break;
      }

      case 'topo-viewport-save': {
        try {
          const payloadParsed = JSON.parse(payload as string) as CytoViewportPositionPreset[];
          const doc: YAML.Document.Parsed | undefined = this.adaptor.currentClabDoc;
          if (!doc) {
            throw new Error('No parsed Document found (this.adaptor.currentClabDoc is undefined).');
          }

          for (const {
            data: { id, parent, groupLabelPos },
            position: { x, y },
          } of payloadParsed) {
            if (!id) continue;
            const nodeMap = doc.getIn(['topology', 'nodes', id], true);
            if (YAML.isMap(nodeMap)) {
              nodeMap.setIn(['labels', 'graph-posX'], Math.round(x).toString());
              nodeMap.setIn(['labels', 'graph-posY'], Math.round(y).toString());

              if (parent) {
                nodeMap.setIn(['labels', 'graph-group'], parent.split(':')[0]);
                nodeMap.setIn(['labels', 'graph-level'], parent.split(':')[1]);
              } else {
                nodeMap.deleteIn(['labels', 'graph-group']);
                nodeMap.deleteIn(['labels', 'graph-level']);
              }
              if (groupLabelPos) {
                nodeMap.setIn(['labels', 'graph-groupLabelPos'], groupLabelPos);
              } else {
                nodeMap.setIn(['labels', 'graph-groupLabelPos'], 'bottom-center');
              }
            }
          }

          const linksNode = doc.getIn(['topology', 'links']);
          if (YAML.isSeq(linksNode)) {
            for (const linkItem of linksNode.items) {
              if (YAML.isMap(linkItem)) {
                const endpointsNode = linkItem.get('endpoints', true);
                if (YAML.isSeq(endpointsNode)) {
                  endpointsNode.flow = true;
                }
              }
            }
          }

          const updatedYamlString = doc.toString();
          await fs.promises.writeFile(this.lastYamlFilePath, updatedYamlString, 'utf8');

          result = `Saved topology with preserved comments!`;
          log.info(result);
          vscode.window.showInformationMessage(result as string);
        } catch (innerError) {
          result = `Error executing endpoint "${endpointName}".`;
          log.error(
            `Error executing endpoint "${endpointName}": ${JSON.stringify(innerError, null, 2)}`
          );
        }
        break;
      }

      case 'clab-node-connect-ssh': {
        try {
          const updatedClabTreeDataToTopoviewer = this.cacheClabTreeDataToTopoviewer;
          if (updatedClabTreeDataToTopoviewer) {
            const nodeName = (payload as string).startsWith('"') && (payload as string).endsWith('"')
              ? (payload as string).slice(1, -1)
              : (payload as string);
            const containerData = this.adaptor.getClabContainerTreeNode(
              nodeName,
              updatedClabTreeDataToTopoviewer,
              this.adaptor.currentClabTopo?.name
            );
            if (containerData) {
              sshToNode(containerData);
            }
          } else {
            log.error('Updated Clab tree data is undefined');
          }
        } catch (innerError) {
          result = `Error executing endpoint "${endpointName}".`;
          log.error(
            `Error executing endpoint "${endpointName}": ${JSON.stringify(innerError, null, 2)}`
          );
        }
        break;
      }

      case 'clab-node-attach-shell': {
        try {
          const updatedClabTreeDataToTopoviewer = this.cacheClabTreeDataToTopoviewer;
          if (updatedClabTreeDataToTopoviewer) {
            const nodeName = (payload as string).startsWith('"') && (payload as string).endsWith('"')
              ? (payload as string).slice(1, -1)
              : (payload as string);
            const containerData = this.adaptor.getClabContainerTreeNode(
              nodeName,
              updatedClabTreeDataToTopoviewer,
              this.adaptor.currentClabTopo?.name
            );
            if (containerData) {
              attachShell(containerData);
            }
          } else {
            log.error('Updated Clab tree data is undefined.');
          }
        } catch (innerError) {
          result = `Error executing endpoint "${endpointName}".`;
          log.error(
            `Error executing endpoint "${endpointName}": ${JSON.stringify(innerError, null, 2)}`
          );
        }
        break;
      }

      case 'clab-node-view-logs': {
        try {
          const updatedClabTreeDataToTopoviewer = this.cacheClabTreeDataToTopoviewer;
          if (updatedClabTreeDataToTopoviewer) {
            const nodeName = (payload as string).startsWith('"') && (payload as string).endsWith('"')
              ? (payload as string).slice(1, -1)
              : (payload as string);
            const containerData = this.adaptor.getClabContainerTreeNode(
              nodeName,
              updatedClabTreeDataToTopoviewer,
              this.adaptor.currentClabTopo?.name
            );
            if (containerData) {
              showLogs(containerData);
            }
          } else {
            log.error('Updated Clab tree data is undefined.');
          }
        } catch (innerError) {
          result = `Error executing endpoint "${endpointName}".`;
          log.error(
            `Error executing endpoint "${endpointName}": ${JSON.stringify(innerError, null, 2)}`
          );
        }
        break;
      }

      case 'clab-host-get-hostname': {
          try {
            const hostname = await getHostname();
            result = `Endpoint "${endpointName}" executed successfully. Return payload is ${hostname}`;
            log.info(result);
          } catch (innerError) {
            result = `Error executing endpoint "${endpointName}".`;
            log.error(`Error executing endpoint "${endpointName}": ${JSON.stringify(innerError)}`);
          }
        break;
      }

      case 'clab-interface-capture-with-packetflix': {
        try {
          const updatedClabTreeDataToTopoviewer = this.cacheClabTreeDataToTopoviewer;
          if (updatedClabTreeDataToTopoviewer) {
            const payloadParsed = JSON.parse(payload as string);
            const nodeName = payloadParsed.nodeName;
            const interfaceName = payloadParsed.ifName;
            const containerInterfaceData = this.adaptor.getClabContainerInterfaceTreeNode(
              nodeName,
              interfaceName,
              updatedClabTreeDataToTopoviewer,
              this.adaptor.currentClabTopo?.name as string
            );
            if (containerInterfaceData) {
              captureInterfaceWithPacketflix(containerInterfaceData);
            }
          } else {
            log.error('Updated Clab tree data is undefined.');
          }
        } catch (innerError) {
          result = `Error executing endpoint "${endpointName}".`;
          log.error(
            `Error executing endpoint "${endpointName}": ${JSON.stringify(innerError, null, 2)}`
          );
        }
        break;
      }

      case 'clab-interface-capture-edgeshark-vnc': {
        try {
          const updatedClabTreeDataToTopoviewer = this.cacheClabTreeDataToTopoviewer;
          if (updatedClabTreeDataToTopoviewer) {
            const payloadParsed = JSON.parse(payload as string);
            const nodeName = payloadParsed.nodeName;
            const interfaceName = payloadParsed.ifName;
            const containerInterfaceData = this.adaptor.getClabContainerInterfaceTreeNode(
              nodeName,
              interfaceName,
              updatedClabTreeDataToTopoviewer,
              this.adaptor.currentClabTopo?.name as string
            );
            if (containerInterfaceData) {
              captureEdgesharkVNC(containerInterfaceData);
            }
          } else {
            log.error('Updated Clab tree data is undefined.');
          }
        } catch (innerError) {
          result = `Error executing endpoint "${endpointName}".`;
          log.error(
            `Error executing endpoint "${endpointName}": ${JSON.stringify(innerError, null, 2)}`
          );
        }
        break;
      }

      case 'clab-link-delete': {
        try {
          const updatedClabTreeDataToTopoviewer = this.cacheClabTreeDataToTopoviewer;
          if (updatedClabTreeDataToTopoviewer) {
            const payloadParsed = JSON.parse(payload as string);
            const linkId = payloadParsed.linkId;
            const containerData = this.adaptor.getClabContainerTreeNode(
              linkId,
              updatedClabTreeDataToTopoviewer,
              this.adaptor.currentClabTopo?.name as string
            );
            if (containerData) {
              await vscode.window.showInformationMessage(`Deleting link ${linkId}`);
            }
          } else {
            log.error('Updated Clab tree data is undefined.');
          }
        } catch (innerError) {
          result = `Error executing endpoint "${endpointName}".`;
          log.error(
            `Error executing endpoint "${endpointName}": ${JSON.stringify(innerError, null, 2)}`
          );
        }
        break;
      }

      case 'clab-show-vscode-message': {
        try {
          const data = JSON.parse(payload as string) as {
            type: 'info' | 'warning' | 'error';
            message: string;
          };

          switch (data.type) {
            case 'info':
              await vscode.window.showInformationMessage(data.message);
              break;
            case 'warning':
              await vscode.window.showWarningMessage(data.message);
              break;
            case 'error':
              await vscode.window.showErrorMessage(data.message);
              break;
            default:
              log.error(`Unsupported message type: ${JSON.stringify(data.type, null, 2)}`);
          }
          result = `Displayed ${data.type} message: ${data.message}`;
          log.info(result);
        } catch (innerError) {
          result = `Error executing endpoint "clab-show-vscode-message".`;
          log.error(
            `Error executing endpoint "clab-show-vscode-message": ${JSON.stringify(innerError, null, 2)}`
          );
        }
        break;
      }

      case 'open-external': {
        try {
          const url: string = JSON.parse(payload as string);
          await vscode.env.openExternal(vscode.Uri.parse(url));
          result = `Opened external URL: ${url}`;
          log.info(result);
        } catch (innerError) {
          result = `Error executing endpoint "open-external".`;
          log.error(
            `Error executing endpoint "open-external": ${JSON.stringify(innerError, null, 2)}`
          );
        }
        break;
      }

      case 'save-environment-json-to-disk': {
        try {
          const environmentData = JSON.parse(payload as string);

          if (!this.lastFolderName) {
            throw new Error('No folderName available (this.lastFolderName is undefined).');
          }

          const environmentJsonPath = vscode.Uri.joinPath(
            this.context.extensionUri,
            'topoViewerData',
            this.lastFolderName,
            'environment.json'
          );

          await fs.promises.writeFile(
            environmentJsonPath.fsPath,
            JSON.stringify(environmentData, null, 2),
            'utf8'
          );

          result = `Environment JSON successfully saved to disk at ${environmentJsonPath.fsPath}`;
          log.info(result);
        } catch (innerError) {
          result = `Error saving environment JSON to disk.`;
          log.error(`Error in 'save-environment-json-to-disk': ${JSON.stringify(innerError, null, 2)}`);
        }
        break;
      }

      default: {
        error = `Unknown endpoint "${endpointName}".`;
        log.error(error);
      }
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    log.error(
      `Error processing message for endpoint "${endpointName}": ${JSON.stringify(err, null, 2)}`
    );
  }

  log.info('########################################################### RESULT in RESPONSE');
  log.info(`${JSON.stringify(result, null, 2)}`);

  panel.webview.postMessage({
    type: 'POST_RESPONSE',
    requestId,
    result,
    error,
  });
}

