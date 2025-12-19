/**
 * Topology adapter for converting Containerlab YAML to Cytoscape elements.
 * This is the VS Code integration layer that wraps the shared parser.
 */

import * as YAML from 'yaml';
import { log } from './logger';
import { ClabTopology, CyElement, TopologyAnnotations } from '../../shared/types/topology';
import { ClabLabTreeNode } from '../../../treeView/common';
import { annotationsIO } from './adapters';
import { ContainerDataAdapter } from './ContainerDataAdapter';
import {
  TopologyParser,
  computeEdgeClassFromStates as computeEdgeClassFromStatesImpl,
  type ParserLogger,
  type GraphLabelMigration,
} from '../../shared/parsing';

/**
 * Adapter that wraps log to implement ParserLogger.
 */
const parserLogger: ParserLogger = {
  info: (msg) => log.info(`[Parser] ${msg}`),
  warn: (msg) => log.warn(`[Parser] ${msg}`),
  debug: (msg) => log.debug(`[Parser] ${msg}`),
  error: (msg) => log.error(`[Parser] ${msg}`),
};

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

    // Load and migrate annotations
    let annotations = yamlFilePath ? await annotationsIO.loadAnnotations(yamlFilePath) : undefined;

    // Create container data adapter for enrichment
    const containerDataProvider = new ContainerDataAdapter(clabTreeDataToTopoviewer);

    // Parse with the shared parser
    const result = TopologyParser.parse(yamlContent, {
      annotations: annotations as TopologyAnnotations | undefined,
      containerDataProvider,
      logger: parserLogger,
    });

    // Store state for external access
    this.currentIsPresetLayout = result.isPresetLayout;
    this.currentClabName = result.labName;
    this.currentClabPrefix = result.prefix;

    // Handle graph label migrations (persist to annotations file)
    if (yamlFilePath && result.graphLabelMigrations.length > 0) {
      await this.persistGraphLabelMigrations(yamlFilePath, annotations, result.graphLabelMigrations);
    }

    // Migrate interface patterns to annotations for nodes that don't have them
    if (yamlFilePath && result.pendingMigrations.length > 0) {
      this.migrateInterfacePatterns(yamlFilePath, result.pendingMigrations).catch(err => {
        log.warn(`[TopologyAdapter] Failed to migrate interface patterns: ${err}`);
      });
    }

    return result.elements;
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

    // Load and migrate annotations
    let annotations = yamlFilePath ? await annotationsIO.loadAnnotations(yamlFilePath) : undefined;

    // Parse without container data (editor mode)
    const result = TopologyParser.parseForEditor(yamlContent, annotations as TopologyAnnotations | undefined);

    // Store state for external access
    this.currentIsPresetLayout = result.isPresetLayout;
    this.currentClabName = result.labName;
    this.currentClabPrefix = result.prefix;

    // Handle graph label migrations (persist to annotations file)
    if (yamlFilePath && result.graphLabelMigrations.length > 0) {
      await this.persistGraphLabelMigrations(yamlFilePath, annotations, result.graphLabelMigrations);
    }

    // Migrate interface patterns to annotations for nodes that don't have them
    if (yamlFilePath && result.pendingMigrations.length > 0) {
      this.migrateInterfacePatterns(yamlFilePath, result.pendingMigrations).catch(err => {
        log.warn(`[TopologyAdapter] Failed to migrate interface patterns: ${err}`);
      });
    }

    return result.elements;
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
   * Migrates interface patterns to annotations for nodes that don't have them.
   * Uses annotationsIO.modifyAnnotations() for atomic read-modify-write.
   */
  private async migrateInterfacePatterns(
    yamlFilePath: string,
    migrations: Array<{ nodeId: string; interfacePattern: string }>
  ): Promise<void> {
    if (migrations.length === 0) return;

    await annotationsIO.modifyAnnotations(yamlFilePath, (annotations) => {
      if (!annotations.nodeAnnotations) {
        annotations.nodeAnnotations = [];
      }

      let modified = false;
      for (const { nodeId, interfacePattern } of migrations) {
        const existing = annotations.nodeAnnotations.find(n => n.id === nodeId);
        if (existing) {
          if (!existing.interfacePattern) {
            existing.interfacePattern = interfacePattern;
            modified = true;
          }
        } else {
          annotations.nodeAnnotations.push({ id: nodeId, interfacePattern });
          modified = true;
        }
      }

      if (modified) {
        log.info(`[TopologyAdapter] Migrated interface patterns for ${migrations.length} nodes`);
      }

      return annotations;
    });
  }

  /**
   * Persists graph label migrations to annotations file.
   */
  private async persistGraphLabelMigrations(
    yamlFilePath: string,
    annotations: Record<string, unknown> | undefined,
    migrations: GraphLabelMigration[]
  ): Promise<void> {
    type NodeAnnotation = { id: string; position?: { x: number; y: number }; icon?: string; group?: string; level?: string; groupLabelPos?: string; geoCoordinates?: { lat: number; lng: number } };

    const localAnnotations = (annotations ?? {
      freeTextAnnotations: [],
      groupStyleAnnotations: [],
      nodeAnnotations: []
    }) as { nodeAnnotations: NodeAnnotation[] };
    localAnnotations.nodeAnnotations = localAnnotations.nodeAnnotations ?? [];

    const existingIds = new Set(localAnnotations.nodeAnnotations.map((na) => na.id));
    for (const migration of migrations) {
      if (existingIds.has(migration.nodeId)) continue;

      const annotation = buildAnnotationFromMigration(migration);
      localAnnotations.nodeAnnotations.push(annotation);
      log.info(`Migrated graph-* labels for node ${migration.nodeId} to annotations.json`);
    }

    await annotationsIO.saveAnnotations(yamlFilePath, localAnnotations as Record<string, unknown>);
    log.info('Saved migrated graph-* labels to annotations.json');
  }
}

/**
 * Builds a NodeAnnotation from a GraphLabelMigration.
 */
function buildAnnotationFromMigration(migration: GraphLabelMigration): { id: string; position?: { x: number; y: number }; icon?: string; group?: string; level?: string; groupLabelPos?: string; geoCoordinates?: { lat: number; lng: number } } {
  const annotation: { id: string; position?: { x: number; y: number }; icon?: string; group?: string; level?: string; groupLabelPos?: string; geoCoordinates?: { lat: number; lng: number } } = { id: migration.nodeId };
  if (migration.position) annotation.position = migration.position;
  if (migration.icon) annotation.icon = migration.icon;
  if (migration.group) annotation.group = migration.group;
  if (migration.level) annotation.level = migration.level;
  if (migration.groupLabelPos) annotation.groupLabelPos = migration.groupLabelPos;
  if (migration.geoCoordinates) annotation.geoCoordinates = migration.geoCoordinates;
  return annotation;
}
