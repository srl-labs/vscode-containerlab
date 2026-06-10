import * as vscode from "vscode";

import {
  mergeCustomNodeTemplates,
  parseCustomNodeTemplatesExport,
  type CustomNodeTemplate,
  type EndpointResult
} from "@srl-labs/clab-ui/session";

import { formatErrorMessage, log } from "./logger";
import { normalizeCustomNodeTemplate, normalizeCustomNodeTemplates } from "./customNodeTypes";

const CONFIG_SECTION = "containerlab.editor";

/**
 * Custom node configuration stored in VS Code settings
 */
export type CustomNodeConfig = CustomNodeTemplate;

/**
 * Custom node data structure for save operations
 */
export interface CustomNodeData extends CustomNodeConfig {
  oldName?: string;
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
      let customNodes = normalizeCustomNodeTemplates(
        config.get<CustomNodeConfig[]>("customNodes", [])
      );
      const { oldName, ...nodeData } = data;
      const normalizedNodeData = normalizeCustomNodeTemplate(nodeData);

      if (data.setDefault === true) {
        customNodes = customNodes.map((n) => ({ ...n, setDefault: false }));
      }

      if (oldName !== undefined && oldName.length > 0) {
        const oldIndex = customNodes.findIndex((n) => n.name === oldName);
        if (oldIndex >= 0) {
          customNodes[oldIndex] = normalizedNodeData;
        } else {
          customNodes.push(normalizedNodeData);
        }
      } else {
        const existingIndex = customNodes.findIndex((n) => n.name === data.name);
        if (existingIndex >= 0) {
          customNodes[existingIndex] = normalizedNodeData;
        } else {
          customNodes.push(normalizedNodeData);
        }
      }

      await config.update("customNodes", customNodes, vscode.ConfigurationTarget.Global);
      const defaultCustomNode = customNodes.find((n) => n.setDefault === true);
      log.info(`Saved custom node ${data.name}`);
      return { result: { customNodes, defaultNode: defaultCustomNode?.name ?? "" }, error: null };
    } catch (err) {
      const error = `Error saving custom node: ${formatErrorMessage(err)}`;
      log.error(`Error saving custom node: ${JSON.stringify(err, null, 2)}`);
      return { result: null, error };
    }
  }

  /**
   * Imports custom node templates from a JSON file picked by the user.
   * Imported templates replace same-named existing ones; the rest are appended.
   */
  async importCustomNodes(): Promise<EndpointResult> {
    try {
      const selection = await vscode.window.showOpenDialog({
        title: "Import Node Templates",
        openLabel: "Import",
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters: { JSON: ["json"] }
      });
      const fileUri = selection?.[0];
      if (!fileUri) {
        return { result: null, error: null };
      }

      const content = await vscode.workspace.fs.readFile(fileUri);
      const imported = normalizeCustomNodeTemplates(
        parseCustomNodeTemplatesExport(Buffer.from(content).toString("utf8"))
      );

      const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
      const existing = normalizeCustomNodeTemplates(
        config.get<CustomNodeConfig[]>("customNodes", [])
      );
      const { customNodes, added, replaced } = mergeCustomNodeTemplates(existing, imported);

      await config.update("customNodes", customNodes, vscode.ConfigurationTarget.Global);
      const defaultCustomNode = customNodes.find((n) => n.setDefault === true);
      log.info(
        `Imported node templates from ${fileUri.fsPath}: ${added} added, ${replaced} updated`
      );
      void vscode.window.showInformationMessage(
        `Imported node templates: ${added} added, ${replaced} updated`
      );
      return { result: { customNodes, defaultNode: defaultCustomNode?.name ?? "" }, error: null };
    } catch (err) {
      const error = `Error importing node templates: ${formatErrorMessage(err)}`;
      log.error(error);
      return { result: null, error };
    }
  }

  /**
   * Sets a custom node as the default.
   */
  async setDefaultCustomNode(name: string): Promise<EndpointResult> {
    try {
      if (!name) {
        throw new Error("Missing custom node name");
      }

      const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
      const customNodes = normalizeCustomNodeTemplates(
        config.get<CustomNodeConfig[]>("customNodes", [])
      );

      const targetIndex = customNodes.findIndex((node) => node.name === name);
      if (targetIndex < 0) {
        throw new Error(`Custom node ${name} not found`);
      }
      const updatedNodes = customNodes.map((node, index) => ({
        ...node,
        setDefault: index === targetIndex
      }));

      await config.update("customNodes", updatedNodes, vscode.ConfigurationTarget.Global);
      const defaultCustomNode = updatedNodes.find((n) => n.setDefault === true);
      log.info(`Set default custom node ${name}`);

      return {
        result: { customNodes: updatedNodes, defaultNode: defaultCustomNode?.name ?? "" },
        error: null
      };
    } catch (err) {
      const error = `Error setting default custom node: ${formatErrorMessage(err)}`;
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
      const customNodes = normalizeCustomNodeTemplates(
        config.get<CustomNodeConfig[]>("customNodes", [])
      );
      const filteredNodes = customNodes.filter((n) => n.name !== name);
      await config.update("customNodes", filteredNodes, vscode.ConfigurationTarget.Global);
      const defaultCustomNode = filteredNodes.find((n) => n.setDefault === true);
      log.info(`Deleted custom node ${name}`);
      return {
        result: { customNodes: filteredNodes, defaultNode: defaultCustomNode?.name ?? "" },
        error: null
      };
    } catch (err) {
      const error = `Error deleting custom node: ${formatErrorMessage(err)}`;
      log.error(`Error deleting custom node: ${JSON.stringify(err, null, 2)}`);
      return { result: null, error };
    }
  }

  /**
   * Gets the default custom node info from the list
   */
  getDefaultCustomNode(customNodes: CustomNodeConfig[]): {
    defaultNode: string;
    defaultKind: string;
    defaultType: string;
  } {
    const defaultCustomNode = normalizeCustomNodeTemplates(customNodes).find(
      (node) => node.setDefault === true
    );
    return {
      defaultNode: defaultCustomNode?.name ?? "",
      defaultKind: defaultCustomNode?.kind ?? "nokia_srlinux",
      defaultType: defaultCustomNode?.type ?? ""
    };
  }

  /**
   * Builds a mapping from node kind to image
   */
  buildImageMapping(customNodes: CustomNodeConfig[]): Record<string, string> {
    const imageMapping: Record<string, string> = {};
    for (const node of customNodes) {
      if (node.image !== undefined && node.image.length > 0 && node.kind.length > 0) {
        imageMapping[node.kind] = node.image;
      }
    }
    return imageMapping;
  }
}

// Export a singleton instance
export const customNodeConfigManager = new CustomNodeConfigManager();
