/**
 * BootstrapDataBuilder - Assembles initial data for React TopoViewer webview
 */

import type * as vscode from "vscode";

import type { CustomIconInfo, CustomNodeTemplate } from "@srl-labs/clab-ui/session";
import { getDockerImages } from "../../../utils/docker/images";
import { getCustomNodesFromConfig } from "../services/schema";
import { iconService } from "../services/IconService";

/**
 * Bootstrap data sent to the webview on initialization
 */
export interface BootstrapData {
  customNodes: CustomNodeTemplate[];
  defaultNode: string;
  dockerImages: string[];
  customIcons: CustomIconInfo[];
}

/**
 * Input parameters for building bootstrap data
 */
export interface BootstrapDataInput {
  extensionUri: vscode.Uri;
  yamlFilePath: string;
}

/**
 * Assembles bootstrap data for the webview from various sources
 */
export async function buildBootstrapData(input: BootstrapDataInput): Promise<BootstrapData> {
  const { yamlFilePath } = input;

  // Get custom nodes from VS Code configuration
  const customNodes = getCustomNodesFromConfig();
  const defaultNode = customNodes.find((n) => n.setDefault === true)?.name ?? "";

  // Get docker images for image dropdown
  const dockerImages = getDockerImages();

  // Load custom icons from workspace and global directories
  const customIcons = await iconService.loadAllIcons(yamlFilePath);

  return {
    customNodes,
    defaultNode,
    dockerImages,
    customIcons
  };
}
