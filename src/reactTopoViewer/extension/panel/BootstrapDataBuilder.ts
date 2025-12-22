/**
 * BootstrapDataBuilder - Assembles initial data for React TopoViewer webview
 */

import type * as vscode from 'vscode';

import type { CyElement, FreeTextAnnotation, FreeShapeAnnotation, GroupStyleAnnotation, NodeAnnotation } from '../../shared/types/topology';
import { getDockerImages } from '../../../utils/docker/images';
import type { CustomNodeTemplate, SchemaData } from '../../shared/schema';
import { getCustomNodesFromConfig, loadSchemaData } from '../services/schema';

/**
 * Bootstrap data sent to the webview on initialization
 */
export interface BootstrapData {
  elements: CyElement[];
  labName: string;
  mode: 'view' | 'edit';
  deploymentState: 'deployed' | 'undeployed' | 'unknown';
  customNodes: CustomNodeTemplate[];
  defaultNode: string;
  schemaData: SchemaData;
  dockerImages: string[];
  freeTextAnnotations: FreeTextAnnotation[];
  freeShapeAnnotations: FreeShapeAnnotation[];
  groupStyleAnnotations: GroupStyleAnnotation[];
  nodeAnnotations: NodeAnnotation[];
  yamlFilePath: string;
}

/**
 * Input parameters for building bootstrap data
 */
export interface BootstrapDataInput {
  elements: CyElement[];
  labName: string;
  isViewMode: boolean;
  deploymentState: 'deployed' | 'undeployed' | 'unknown';
  extensionUri: vscode.Uri;
  yamlFilePath: string;
  freeTextAnnotations?: FreeTextAnnotation[];
  freeShapeAnnotations?: FreeShapeAnnotation[];
  groupStyleAnnotations?: GroupStyleAnnotation[];
  nodeAnnotations?: NodeAnnotation[];
}

/**
 * Assembles bootstrap data for the webview from various sources
 */
export async function buildBootstrapData(input: BootstrapDataInput): Promise<BootstrapData> {
  const { elements, labName, isViewMode, deploymentState, extensionUri, yamlFilePath, freeTextAnnotations = [], freeShapeAnnotations = [], groupStyleAnnotations = [], nodeAnnotations = [] } = input;

  // Get custom nodes from VS Code configuration
  const customNodes = getCustomNodesFromConfig();
  const defaultNode = customNodes.find(n => n.setDefault)?.name || '';

  // Load schema data for kind/type dropdowns
  const schemaData = await loadSchemaData(extensionUri);

  // Get docker images for image dropdown
  const dockerImages = getDockerImages();

  return {
    elements,
    labName,
    mode: isViewMode ? 'view' : 'edit',
    deploymentState,
    customNodes,
    defaultNode,
    schemaData,
    dockerImages,
    freeTextAnnotations,
    freeShapeAnnotations,
    groupStyleAnnotations,
    nodeAnnotations,
    yamlFilePath
  };
}
