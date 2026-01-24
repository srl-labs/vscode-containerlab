/**
 * BootstrapDataBuilder - Assembles initial data for React TopoViewer webview
 */

import type * as vscode from "vscode";

import type {
  FreeTextAnnotation,
  FreeShapeAnnotation,
  GroupStyleAnnotation,
  NodeAnnotation,
  EdgeAnnotation,
  TopologyAnnotations
} from "../../shared/types/topology";
import type { TopoNode, TopoEdge } from "../../shared/types/graph";
import type { CustomIconInfo } from "../../shared/types/icons";
import { getDockerImages } from "../../../utils/docker/images";
import type { CustomNodeTemplate, SchemaData } from "../../shared/schema";
import { getCustomNodesFromConfig, loadSchemaData } from "../services/schema";
import { iconService } from "../services/IconService";

/**
 * Bootstrap data sent to the webview on initialization
 */
export interface BootstrapData {
  nodes: TopoNode[];
  edges: TopoEdge[];
  labName: string;
  mode: "view" | "edit";
  deploymentState: "deployed" | "undeployed" | "unknown";
  customNodes: CustomNodeTemplate[];
  defaultNode: string;
  schemaData: SchemaData;
  dockerImages: string[];
  customIcons: CustomIconInfo[];
  freeTextAnnotations: FreeTextAnnotation[];
  freeShapeAnnotations: FreeShapeAnnotation[];
  groupStyleAnnotations: GroupStyleAnnotation[];
  nodeAnnotations: NodeAnnotation[];
  edgeAnnotations: EdgeAnnotation[];
  viewerSettings?: TopologyAnnotations["viewerSettings"];
  yamlFilePath: string;
}

/**
 * Input parameters for building bootstrap data
 */
export interface BootstrapDataInput {
  nodes: TopoNode[];
  edges: TopoEdge[];
  labName: string;
  isViewMode: boolean;
  deploymentState: "deployed" | "undeployed" | "unknown";
  extensionUri: vscode.Uri;
  yamlFilePath: string;
  freeTextAnnotations?: FreeTextAnnotation[];
  freeShapeAnnotations?: FreeShapeAnnotation[];
  groupStyleAnnotations?: GroupStyleAnnotation[];
  nodeAnnotations?: NodeAnnotation[];
  edgeAnnotations?: EdgeAnnotation[];
  viewerSettings?: TopologyAnnotations["viewerSettings"];
}

/**
 * Assembles bootstrap data for the webview from various sources
 */
export async function buildBootstrapData(input: BootstrapDataInput): Promise<BootstrapData> {
  const {
    nodes,
    edges,
    labName,
    isViewMode,
    deploymentState,
    extensionUri,
    yamlFilePath,
    freeTextAnnotations = [],
    freeShapeAnnotations = [],
    groupStyleAnnotations = [],
    nodeAnnotations = [],
    edgeAnnotations = [],
    viewerSettings
  } = input;

  // Get custom nodes from VS Code configuration
  const customNodes = getCustomNodesFromConfig();
  const defaultNode = customNodes.find((n) => n.setDefault)?.name || "";

  // Load schema data for kind/type dropdowns
  const schemaData = await loadSchemaData(extensionUri);

  // Get docker images for image dropdown
  const dockerImages = getDockerImages();

  // Load custom icons from workspace and global directories
  const customIcons = await iconService.loadAllIcons(yamlFilePath);

  return {
    nodes,
    edges,
    labName,
    mode: isViewMode ? "view" : "edit",
    deploymentState,
    customNodes,
    defaultNode,
    schemaData,
    dockerImages,
    customIcons,
    freeTextAnnotations,
    freeShapeAnnotations,
    groupStyleAnnotations,
    nodeAnnotations,
    edgeAnnotations,
    viewerSettings,
    yamlFilePath
  };
}
