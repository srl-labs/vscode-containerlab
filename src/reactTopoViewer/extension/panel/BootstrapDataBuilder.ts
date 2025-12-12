/**
 * BootstrapDataBuilder - Assembles initial data for React TopoViewer webview
 */

import * as vscode from 'vscode';
import { CyElement, FreeTextAnnotation, FreeShapeAnnotation } from '../../shared/types/topology';
import { getDockerImages } from '../../../utils/docker/images';
import { getCustomNodesFromConfig, loadSchemaData, CustomNodeTemplate, SchemaData } from './SchemaParser';

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
  freeTextAnnotations?: FreeTextAnnotation[];
  freeShapeAnnotations?: FreeShapeAnnotation[];
}

/**
 * Assembles bootstrap data for the webview from various sources
 */
export async function buildBootstrapData(input: BootstrapDataInput): Promise<BootstrapData> {
  const { elements, labName, isViewMode, deploymentState, extensionUri, freeTextAnnotations = [], freeShapeAnnotations = [] } = input;

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
    freeShapeAnnotations
  };
}
