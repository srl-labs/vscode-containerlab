/**
 * BootstrapDataBuilder - Assembles initial data for React TopoViewer webview
 */

import * as vscode from "vscode";

import type { CustomIconInfo } from "../../shared/types/icons";
import {
  TOPOVIEWER_FONT_SCALE_DEFAULT,
  resolveTopoViewerFontScale as normalizeTopoViewerFontScale
} from "../../shared/constants/topoViewerFontScale";
import { getDockerImages } from "../../../utils/docker/images";
import type { CustomNodeTemplate, SchemaData } from "../../shared/schema";
import { getCustomNodesFromConfig, loadSchemaData } from "../services/schema";
import { iconService } from "../services/IconService";

const TOPOVIEWER_FONT_SCALE_CONFIG_SECTION = "containerlab.ui";
const TOPOVIEWER_FONT_SCALE_CONFIG_KEY = "fontScale";

/**
 * Bootstrap data sent to the webview on initialization
 */
export interface BootstrapData {
  customNodes: CustomNodeTemplate[];
  defaultNode: string;
  schemaData: SchemaData;
  dockerImages: string[];
  customIcons: CustomIconInfo[];
  fontScale: number;
}

/**
 * Input parameters for building bootstrap data
 */
export interface BootstrapDataInput {
  extensionUri: vscode.Uri;
  yamlFilePath: string;
}

function getConfiguredTopoViewerFontScale(): number {
  const config = vscode.workspace.getConfiguration(TOPOVIEWER_FONT_SCALE_CONFIG_SECTION);
  const configuredValue = config.get<number>(
    TOPOVIEWER_FONT_SCALE_CONFIG_KEY,
    TOPOVIEWER_FONT_SCALE_DEFAULT
  );

  if (typeof configuredValue !== "number" || !Number.isFinite(configuredValue)) {
    return TOPOVIEWER_FONT_SCALE_DEFAULT;
  }

  return normalizeTopoViewerFontScale(configuredValue);
}

/**
 * Assembles bootstrap data for the webview from various sources
 */
export async function buildBootstrapData(input: BootstrapDataInput): Promise<BootstrapData> {
  const { extensionUri, yamlFilePath } = input;

  // Get custom nodes from VS Code configuration
  const customNodes = getCustomNodesFromConfig();
  const defaultNode = customNodes.find((n) => n.setDefault === true)?.name ?? "";

  // Load schema data for kind/type dropdowns
  const schemaData = await loadSchemaData(extensionUri);

  // Get docker images for image dropdown
  const dockerImages = getDockerImages();

  // Load custom icons from workspace and global directories
  const customIcons = await iconService.loadAllIcons(yamlFilePath);
  const fontScale = getConfiguredTopoViewerFontScale();

  return {
    customNodes,
    defaultNode,
    schemaData,
    dockerImages,
    customIcons,
    fontScale
  };
}
