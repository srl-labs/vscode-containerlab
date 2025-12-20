import * as vscode from 'vscode';
import { log } from './logger';
import type { EndpointResult } from '../../shared/types/endpoint';

const CONFIG_SECTION = 'containerlab.editor';

/**
 * Custom node data structure
 */
export interface CustomNodeData {
  name: string;
  oldName?: string;
  setDefault?: boolean;
  [key: string]: any;
}

/**
 * Manages custom node configuration in VS Code settings.
 * Handles saving, deleting, and setting default custom nodes.
 */
export class CustomNodeConfigManager {
  /**
   * Saves a custom node to the configuration.
   * If the node has an oldName, it will be updated; otherwise, it will be added.
   */
  async saveCustomNode(data: CustomNodeData): Promise<EndpointResult> {
    try {
      const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
      let customNodes = config.get<any[]>('customNodes', []);

      if (data.setDefault) {
        customNodes = customNodes.map((n: any) => ({ ...n, setDefault: false }));
      }

      if (data.oldName) {
        const oldIndex = customNodes.findIndex((n: any) => n.name === data.oldName);
        const nodeData = { ...data };
        delete nodeData.oldName;
        if (oldIndex >= 0) {
          customNodes[oldIndex] = nodeData;
        } else {
          customNodes.push(nodeData);
        }
      } else {
        const existingIndex = customNodes.findIndex((n: any) => n.name === data.name);
        if (existingIndex >= 0) {
          customNodes[existingIndex] = data;
        } else {
          customNodes.push(data);
        }
      }

      await config.update('customNodes', customNodes, vscode.ConfigurationTarget.Global);
      const defaultCustomNode = customNodes.find((n: any) => n.setDefault === true);
      log.info(`Saved custom node ${data.name}`);
      return { result: { customNodes, defaultNode: defaultCustomNode?.name || '' }, error: null };
    } catch (err) {
      const error = `Error saving custom node: ${err}`;
      log.error(`Error saving custom node: ${JSON.stringify(err, null, 2)}`);
      return { result: null, error };
    }
  }

  /**
   * Sets a custom node as the default.
   */
  async setDefaultCustomNode(name: string): Promise<EndpointResult> {
    try {
      if (!name) {
        throw new Error('Missing custom node name');
      }

      const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
      const customNodes = config.get<any[]>('customNodes', []);

      let found = false;
      const updatedNodes = customNodes.map((node: any) => {
        const updated = { ...node, setDefault: false };
        if (node.name === name) {
          found = true;
          updated.setDefault = true;
        }
        return updated;
      });

      if (!found) {
        throw new Error(`Custom node ${name} not found`);
      }

      await config.update('customNodes', updatedNodes, vscode.ConfigurationTarget.Global);
      const defaultCustomNode = updatedNodes.find((n: any) => n.setDefault === true);
      log.info(`Set default custom node ${name}`);

      return {
        result: { customNodes: updatedNodes, defaultNode: defaultCustomNode?.name || '' },
        error: null
      };
    } catch (err) {
      const error = `Error setting default custom node: ${err}`;
      log.error(`Error setting default custom node: ${JSON.stringify(err, null, 2)}`);
      return { result: null, error };
    }
  }

  /**
   * Deletes a custom node from the configuration.
   */
  async deleteCustomNode(name: string): Promise<EndpointResult> {
    try {
      const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
      const customNodes = config.get<any[]>('customNodes', []);
      const filteredNodes = customNodes.filter((n: any) => n.name !== name);
      await config.update('customNodes', filteredNodes, vscode.ConfigurationTarget.Global);
      const defaultCustomNode = filteredNodes.find((n: any) => n.setDefault === true);
      log.info(`Deleted custom node ${name}`);
      return { result: { customNodes: filteredNodes, defaultNode: defaultCustomNode?.name || '' }, error: null };
    } catch (err) {
      const error = `Error deleting custom node: ${err}`;
      log.error(`Error deleting custom node: ${JSON.stringify(err, null, 2)}`);
      return { result: null, error };
    }
  }

  /**
   * Gets the default custom node info from the list
   */
  getDefaultCustomNode(customNodes: any[]): {
    defaultNode: string;
    defaultKind: string;
    defaultType: string;
  } {
    const defaultCustomNode = customNodes.find((node: any) => node.setDefault === true);
    return {
      defaultNode: defaultCustomNode?.name || '',
      defaultKind: defaultCustomNode?.kind || 'nokia_srlinux',
      defaultType: defaultCustomNode?.type || '',
    };
  }

  /**
   * Builds a mapping from node kind to image
   */
  buildImageMapping(customNodes: any[]): Record<string, string> {
    const imageMapping: Record<string, string> = {};
    customNodes.forEach((node: any) => {
      if (node.image && node.kind) {
        imageMapping[node.kind] = node.image;
      }
    });
    return imageMapping;
  }

}

// Export a singleton instance
export const customNodeConfigManager = new CustomNodeConfigManager();
