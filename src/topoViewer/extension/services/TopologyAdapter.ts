// file: src/topoViewer/extension/services/TopologyAdapter.ts

import * as vscode from 'vscode';
import { log } from '../../webview/platform/logging/logger';
import * as YAML from 'yaml';

import { ClabTopology, CyElement, CytoTopology } from '../../shared/types/topoViewerType';
import { ClabLabTreeNode } from "../../../treeView/common";
import { version as topoViewerVersion } from '../../../../package.json';

// Import extracted modules
import { DummyContext } from './LinkParser';
import {
  createFolderAndWriteJson,
  generateStaticAssetUris,
  EnvironmentWriterState,
} from './EnvironmentWriter';
import {
  isPresetLayout,
  computeFullPrefix,
  addNodeElements,
  addGroupNodes,
} from './NodeElementBuilder';
import {
  collectSpecialNodes,
  addCloudNodes,
} from './SpecialNodeHandler';
import {
  addAliasNodesFromAnnotations,
  applyAliasMappingsToEdges,
  hideBaseBridgeNodesWithAliases,
} from './AliasNodeHandler';
import {
  addEdgeElements,
  computeEdgeClassFromStates as computeEdgeClassFromStatesImpl,
} from './EdgeElementBuilder';

log.info(`TopoViewer Version: ${topoViewerVersion}`);

/**
 * TopoViewerAdaptorClab is responsible for adapting Containerlab YAML configurations
 * into a format compatible with TopoViewer's Cytoscape model. This class performs the following tasks:
 *
 * 1. **Parsing and Validation**: Converts Containerlab YAML data into internal TypeScript interfaces.
 *    Future enhancements include validating the YAML against a predefined JSON schema.
 *
 * 2. **Data Transformation**: Transforms Containerlab node and link definitions into Cytoscape elements,
 *    ensuring proper formatting and linkage to prevent inconsistencies like nonexistent sources.
 *
 * 3. **JSON Serialization**: Creates necessary directories and writes the transformed data into JSON files,
 *    including `dataCytoMarshall.json` and `environment.json`, which are utilized by TopoViewer.
 *
 * 4. **Static Asset Management**: Generates URIs for static assets (CSS, JS, Images) required by the TopoViewer webview.
 *
 * **Key Functionalities:**
 * - Extracts node names and assigns extended fields such as `data.weight` and `data.lat`.
 * - Processes links to associate source and target nodes accurately.
 * - Provides mechanisms to adjust placeholder values with real data as available.
 *
 * **Note:** The class is designed to be extensible, allowing future integration of YAML validation based on
 * the Containerlab schema: https://github.com/srl-labs/containerlab/blob/e3a324a45032792258d92b8d3625fd108bdaeb9c/schemas/clab.schema.json
 */
export class TopoViewerAdaptorClab {

  public currentClabTopo: ClabTopology | undefined;
  public currentClabDoc: YAML.Document.Parsed | undefined;
  public currentIsPresetLayout: boolean = false;
  public currentClabName: string | undefined;
  public currentClabPrefix: string | undefined;
  public allowedhostname: string | undefined;
  // Tracks which base YAML bridge ids we already logged as having unmapped links
  private loggedUnmappedBaseBridges: Set<string> = new Set();

  /**
   * Creates the target directory and writes the JSON data files required by TopoViewer.
   *
   * @param context - The VS Code extension context.
   * @param folderName - The name of the folder to create inside 'topoViewerData'.
   * @param cytoTopology - The Cytoscape topology data to write into the JSON files.
   * @returns A promise that resolves to an array of VS Code URIs pointing to the created files.
   */
  public async createFolderAndWriteJson(
    context: vscode.ExtensionContext,
    folderName: string,
    cytoTopology: CytoTopology,
    yamlContent: string,
  ): Promise<vscode.Uri[]> {
    const state: EnvironmentWriterState = {
      currentClabTopo: this.currentClabTopo,
      currentClabDoc: this.currentClabDoc,
      currentIsPresetLayout: this.currentIsPresetLayout,
      currentClabName: this.currentClabName,
      currentClabPrefix: this.currentClabPrefix,
      allowedhostname: this.allowedhostname,
    };

    const result = await createFolderAndWriteJson(context, folderName, cytoTopology, yamlContent, state);

    // Update instance state from the state object
    this.currentClabTopo = state.currentClabTopo;
    this.currentClabDoc = state.currentClabDoc;
    this.currentClabName = state.currentClabName;
    this.currentClabPrefix = state.currentClabPrefix;
    this.allowedhostname = state.allowedhostname;

    return result;
  }

  /**
   * Generates Webview URIs for CSS, JS, and Images directories required by TopoViewer.
   *
   * @param context - The VS Code extension context.
   * @param webview - The Webview instance where the URIs will be used.
   * @returns An object containing URIs for CSS, JS, and Images assets.
   */
  public generateStaticAssetUris(
    context: vscode.ExtensionContext,
    webview: vscode.Webview
  ): { css: string; js: string; images: string } {
    return generateStaticAssetUris(context, webview);
  }

  /**
   * Transforms a Containerlab YAML string into Cytoscape elements compatible with TopoViewer.
   *
   * This method performs the following operations:
   * - Parses the YAML content into Containerlab topology interfaces.
   * - Converts each Containerlab node into a Cytoscape node element, extracting and assigning necessary fields.
   * - Processes each Containerlab link into a Cytoscape edge element, ensuring accurate source and target references.
   * - Assigns placeholder values for fields like `weight` and `clabServerUsername` which can be replaced with real data.
   *
   * @param yamlContent - The Containerlab YAML content as a string.
   * @param clabTreeDataToTopoviewer - Tree data for the topology viewer.
   * @param yamlFilePath - The path to the YAML file (for loading annotations).
   * @returns An array of Cytoscape elements (`CyElement[]`) representing nodes and edges.
   */
  public async clabYamlToCytoscapeElements(
    yamlContent: string,
    clabTreeDataToTopoviewer: Record<string, ClabLabTreeNode> | undefined,
    yamlFilePath?: string
  ): Promise<CyElement[]> {
    const parsed = YAML.parse(yamlContent) as ClabTopology;
    const annotationsManager = await import('./AnnotationsFile').then(m => m.annotationsManager);
    let annotations = yamlFilePath ? await annotationsManager.loadAnnotations(yamlFilePath) : undefined;
    annotations = await this.migrateGraphLabelsToAnnotations(parsed, annotations, yamlFilePath, annotationsManager);

    return this.buildCytoscapeElements(parsed, { includeContainerData: true, clabTreeData: clabTreeDataToTopoviewer, annotations });
  }

  /**
   * Transforms a Containerlab YAML string into Cytoscape elements compatible with TopoViewer EDITOR.
   *
   * This method performs the following operations:
   * - Parses the YAML content into Containerlab topology interfaces.
   * - Converts each Containerlab node into a Cytoscape node element, extracting and assigning necessary fields.
   * - Processes each Containerlab link into a Cytoscape edge element, ensuring accurate source and target references.
   * - Assigns placeholder values for fields like `weight` and `clabServerUsername` which can be replaced with real data.
   *
   * @param yamlContent - The Containerlab YAML content as a string.
   * @param yamlFilePath - The path to the YAML file (for loading annotations).
   * @returns An array of Cytoscape elements (`CyElement[]`) representing nodes and edges.
   */
  public async clabYamlToCytoscapeElementsEditor(yamlContent: string, yamlFilePath?: string): Promise<CyElement[]> {
    const parsed = YAML.parse(yamlContent) as ClabTopology;
    const annotationsManager = await import('./AnnotationsFile').then(m => m.annotationsManager);
    let annotations = yamlFilePath ? await annotationsManager.loadAnnotations(yamlFilePath) : undefined;
    annotations = await this.migrateGraphLabelsToAnnotations(parsed, annotations, yamlFilePath, annotationsManager);

    return this.buildCytoscapeElements(parsed, { includeContainerData: false, annotations });
  }

  /**
   * Computes edge class based on interface states (public API).
   */
  public computeEdgeClassFromStates(
    topology: NonNullable<ClabTopology['topology']>,
    sourceNode: string,
    targetNode: string,
    sourceState?: string,
    targetState?: string
  ): string {
    return computeEdgeClassFromStatesImpl(topology, sourceNode, targetNode, sourceState, targetState);
  }

  /**
   * Migrates graph-* labels from YAML to annotations file.
   */
  private async migrateGraphLabelsToAnnotations(
    parsed: ClabTopology,
    annotations: any | undefined,
    yamlFilePath: string | undefined,
    annotationsManager: any
  ): Promise<any | undefined> {
    if (!(yamlFilePath && parsed.topology?.nodes)) {
      return annotations;
    }

    const localAnnotations = annotations ?? { freeTextAnnotations: [], groupStyleAnnotations: [], cloudNodeAnnotations: [], nodeAnnotations: [] };
    localAnnotations.nodeAnnotations = localAnnotations.nodeAnnotations ?? [];

    let needsSave = false;
    for (const [nodeName, nodeObj] of Object.entries(parsed.topology.nodes)) {
      const existingAnnotation = localAnnotations.nodeAnnotations.find((na: any) => na.id === nodeName);
      if (existingAnnotation || !nodeObj?.labels) continue;

      const labels = nodeObj.labels as Record<string, unknown>;
      if (!this.nodeHasGraphLabels(labels)) continue;

      const newAnnotation = this.buildAnnotationFromLabels(nodeName, labels);
      if (newAnnotation) {
        localAnnotations.nodeAnnotations.push(newAnnotation);
        needsSave = true;
        log.info(`Migrated graph-* labels for node ${nodeName} to annotations.json`);
      }
    }

    if (needsSave) {
      await annotationsManager.saveAnnotations(yamlFilePath, localAnnotations);
      log.info('Saved migrated graph-* labels to annotations.json');
    }

    return localAnnotations;
  }

  /**
   * Checks if a node has graph-* labels.
   */
  private nodeHasGraphLabels(labels: Record<string, unknown>): boolean {
    return Boolean(
      labels['graph-posX'] ||
      labels['graph-posY'] ||
      labels['graph-icon'] ||
      labels['graph-group'] ||
      labels['graph-level'] ||
      labels['graph-groupLabelPos'] ||
      labels['graph-geoCoordinateLat'] ||
      labels['graph-geoCoordinateLng']
    );
  }

  /**
   * Builds an annotation object from graph-* labels.
   */
  private buildAnnotationFromLabels(nodeName: string, labels: Record<string, unknown>): any | null {
    const annotation: any = { id: nodeName };

    if (labels['graph-posX'] && labels['graph-posY']) {
      annotation.position = {
        x: parseInt(labels['graph-posX'] as string, 10) || 0,
        y: parseInt(labels['graph-posY'] as string, 10) || 0,
      };
    }

    if (labels['graph-icon']) {
      annotation.icon = labels['graph-icon'] as string;
    }
    if (labels['graph-group']) {
      annotation.group = labels['graph-group'] as string;
    }
    if (labels['graph-level']) {
      annotation.level = labels['graph-level'] as string;
    }
    if (labels['graph-groupLabelPos']) {
      annotation.groupLabelPos = labels['graph-groupLabelPos'] as string;
    }

    if (labels['graph-geoCoordinateLat'] && labels['graph-geoCoordinateLng']) {
      annotation.geoCoordinates = {
        lat: parseFloat(labels['graph-geoCoordinateLat'] as string) || 0,
        lng: parseFloat(labels['graph-geoCoordinateLng'] as string) || 0,
      };
    }

    return annotation;
  }

  /**
   * Builds Cytoscape elements from parsed topology.
   */
  private buildCytoscapeElements(
    parsed: ClabTopology,
    opts: { includeContainerData: boolean; clabTreeData?: Record<string, ClabLabTreeNode>; annotations?: any }
  ): CyElement[] {
    const elements: CyElement[] = [];
    if (!parsed.topology) {
      log.warn("Parsed YAML does not contain 'topology' object.");
      return elements;
    }

    this.currentIsPresetLayout = isPresetLayout(parsed, opts.annotations);
    log.info(`######### status preset layout: ${this.currentIsPresetLayout}`);

    const clabName = parsed.name ?? '';
    const fullPrefix = computeFullPrefix(parsed, clabName);
    const parentMap = new Map<string, string | undefined>();

    // Add node elements
    addNodeElements(parsed, opts, fullPrefix, clabName, parentMap, elements);

    // Add group nodes
    addGroupNodes(parentMap, elements);

    // Collect and add special nodes (host, mgmt-net, macvlan, etc.)
    const ctx: DummyContext = { dummyCounter: 0, dummyLinkMap: new Map<any, string>() };
    const { specialNodes, specialNodeProps } = collectSpecialNodes(parsed, ctx);
    // Pass YAML node IDs so addCloudNodes can skip bridge nodes already created by addNodeElements
    const yamlNodeIds = new Set(Object.keys(parsed.topology?.nodes || {}));
    addCloudNodes(specialNodes, specialNodeProps, opts, elements, yamlNodeIds);

    // Add edge elements
    addEdgeElements(parsed, opts, fullPrefix, clabName, specialNodes, ctx, elements);

    // Add alias nodes (e.g., multiple visual bridge nodes mapped to same YAML node)
    addAliasNodesFromAnnotations(parsed, opts.annotations, elements);

    // Rewire edges to alias nodes based on saved alias endpoint mappings
    applyAliasMappingsToEdges(opts.annotations, elements);

    // Hide base YAML bridge nodes that have at least one alias defined
    hideBaseBridgeNodesWithAliases(opts.annotations, elements, this.loggedUnmappedBaseBridges);

    log.info(`Transformed YAML to Cytoscape elements. Total elements: ${elements.length}`);
    return elements;
  }
}
