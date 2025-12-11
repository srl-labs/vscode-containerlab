/**
 * Topology adapter for converting Containerlab YAML to Cytoscape elements.
 */

import * as YAML from 'yaml';
import { log } from './logger';
import { ClabTopology, CyElement } from '../../shared/types/topology';
import { ClabLabTreeNode } from '../../../treeView/common';
import { annotationsManager } from './AnnotationsManager';
import { DummyContext } from './LinkParser';
import {
  isPresetLayout,
  computeFullPrefix,
  addNodeElements,
  addGroupNodes,
  InterfacePatternMigration,
} from './NodeElementBuilder';
import { migrateInterfacePatterns } from '../persistence/NodePersistence';
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

/**
 * TopoViewerAdaptorClab is responsible for adapting Containerlab YAML configurations
 * into a format compatible with TopoViewer's Cytoscape model.
 */
export class TopoViewerAdaptorClab {
  public currentClabTopo: ClabTopology | undefined;
  public currentClabDoc: YAML.Document.Parsed | undefined;
  public currentIsPresetLayout: boolean = false;
  public currentClabName: string | undefined;
  public currentClabPrefix: string | undefined;
  public allowedhostname: string | undefined;
  private loggedUnmappedBaseBridges: Set<string> = new Set();

  /**
   * Transforms a Containerlab YAML string into Cytoscape elements compatible with TopoViewer.
   */
  public async clabYamlToCytoscapeElements(
    yamlContent: string,
    clabTreeDataToTopoviewer: Record<string, ClabLabTreeNode> | undefined,
    yamlFilePath?: string
  ): Promise<CyElement[]> {
    // Parse as document to preserve structure for editing
    this.currentClabDoc = YAML.parseDocument(yamlContent);
    const parsed = this.currentClabDoc.toJS() as ClabTopology;
    this.currentClabTopo = parsed;

    let annotations = yamlFilePath ? await annotationsManager.loadAnnotations(yamlFilePath) : undefined;
    annotations = await this.migrateGraphLabelsToAnnotations(parsed, annotations, yamlFilePath);

    const { elements, migrations } = this.buildCytoscapeElements(parsed, {
      includeContainerData: true,
      clabTreeData: clabTreeDataToTopoviewer,
      annotations: annotations as Record<string, unknown>
    });

    // Migrate interface patterns to annotations for nodes that don't have them
    if (yamlFilePath && migrations.length > 0) {
      migrateInterfacePatterns(yamlFilePath, migrations).catch(err => {
        log.warn(`[TopologyAdapter] Failed to migrate interface patterns: ${err}`);
      });
    }

    return elements;
  }

  /**
   * Transforms a Containerlab YAML string into Cytoscape elements for EDITOR mode.
   */
  public async clabYamlToCytoscapeElementsEditor(
    yamlContent: string,
    yamlFilePath?: string
  ): Promise<CyElement[]> {
    // Parse as document to preserve structure for editing
    this.currentClabDoc = YAML.parseDocument(yamlContent);
    const parsed = this.currentClabDoc.toJS() as ClabTopology;
    this.currentClabTopo = parsed;

    let annotations = yamlFilePath ? await annotationsManager.loadAnnotations(yamlFilePath) : undefined;
    annotations = await this.migrateGraphLabelsToAnnotations(parsed, annotations, yamlFilePath);

    const { elements, migrations } = this.buildCytoscapeElements(parsed, {
      includeContainerData: false,
      annotations: annotations as Record<string, unknown>
    });

    // Migrate interface patterns to annotations for nodes that don't have them
    if (yamlFilePath && migrations.length > 0) {
      migrateInterfacePatterns(yamlFilePath, migrations).catch(err => {
        log.warn(`[TopologyAdapter] Failed to migrate interface patterns: ${err}`);
      });
    }

    return elements;
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
    annotations: Record<string, unknown> | undefined,
    yamlFilePath: string | undefined
  ): Promise<Record<string, unknown> | undefined> {
    if (!(yamlFilePath && parsed.topology?.nodes)) {
      return annotations;
    }

    type NodeAnnotation = { id: string; position?: unknown; icon?: string; group?: string; level?: string; groupLabelPos?: string; geoCoordinates?: { lat: number; lng: number } };
    const localAnnotations = (annotations ?? {
      freeTextAnnotations: [],
      groupStyleAnnotations: [],
      cloudNodeAnnotations: [],
      nodeAnnotations: []
    }) as { nodeAnnotations: NodeAnnotation[] };
    localAnnotations.nodeAnnotations = localAnnotations.nodeAnnotations ?? [];

    let needsSave = false;
    for (const [nodeName, nodeObj] of Object.entries(parsed.topology.nodes)) {
      const existingAnnotation = localAnnotations.nodeAnnotations.find((na) => na.id === nodeName);
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
      await annotationsManager.saveAnnotations(yamlFilePath, localAnnotations as Record<string, unknown>);
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
  private buildAnnotationFromLabels(
    nodeName: string,
    labels: Record<string, unknown>
  ): { id: string; position?: { x: number; y: number }; icon?: string; group?: string; level?: string; groupLabelPos?: string; geoCoordinates?: { lat: number; lng: number } } | null {
    const annotation: { id: string; position?: { x: number; y: number }; icon?: string; group?: string; level?: string; groupLabelPos?: string; geoCoordinates?: { lat: number; lng: number } } = { id: nodeName };

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
    opts: { includeContainerData: boolean; clabTreeData?: Record<string, ClabLabTreeNode>; annotations?: Record<string, unknown> }
  ): { elements: CyElement[]; migrations: InterfacePatternMigration[] } {
    const elements: CyElement[] = [];
    if (!parsed.topology) {
      log.warn("Parsed YAML does not contain 'topology' object.");
      return { elements, migrations: [] };
    }

    this.currentIsPresetLayout = isPresetLayout(parsed, opts.annotations);
    log.info(`######### status preset layout: ${this.currentIsPresetLayout}`);

    const clabName = parsed.name ?? '';
    const fullPrefix = computeFullPrefix(parsed, clabName);
    const parentMap = new Map<string, string | undefined>();

    // Add node elements and collect migrations
    const migrations = addNodeElements(parsed, opts, fullPrefix, clabName, parentMap, elements);

    // Add group nodes
    addGroupNodes(parentMap, elements);

    // Collect and add special nodes (host, mgmt-net, macvlan, etc.)
    const ctx: DummyContext = { dummyCounter: 0, dummyLinkMap: new Map() };
    const { specialNodes, specialNodeProps } = collectSpecialNodes(parsed, ctx);
    const yamlNodeIds = new Set(Object.keys(parsed.topology?.nodes || {}));
    addCloudNodes(specialNodes, specialNodeProps, opts, elements, yamlNodeIds);

    // Add edge elements
    addEdgeElements(parsed, opts, fullPrefix, clabName, specialNodes, ctx, elements);

    // Add alias nodes
    addAliasNodesFromAnnotations(parsed, opts.annotations, elements);

    // Rewire edges to alias nodes
    applyAliasMappingsToEdges(opts.annotations, elements);

    // Hide base bridge nodes that have aliases
    hideBaseBridgeNodesWithAliases(opts.annotations, elements, this.loggedUnmappedBaseBridges);

    log.info(`Transformed YAML to Cytoscape elements. Total elements: ${elements.length}`);
    return { elements, migrations };
  }
}
