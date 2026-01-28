/**
 * Topology adapter for converting Containerlab YAML to Cytoscape elements.
 * This is the VS Code integration layer that wraps the shared parser.
 */

import * as YAML from "yaml";

import type { ClabTopology, CyElement, TopologyAnnotations } from "../../shared/types/topology";
import type { ClabLabTreeNode } from "../../../treeView/common";
import {
  TopologyParser,
  computeEdgeClassFromStates as computeEdgeClassFromStatesImpl,
  type ParserLogger,
  type GraphLabelMigration
} from "../../shared/parsing";
import { applyInterfacePatternMigrations } from "../../shared/utilities";

import { log } from "./logger";
import { annotationsIO } from "./annotations";
import { ContainerDataAdapter } from "./ContainerDataAdapter";

/**
 * Adapter that wraps log to implement ParserLogger.
 */
const parserLogger: ParserLogger = {
  info: (msg) => log.info(`[Parser] ${msg}`),
  warn: (msg) => log.warn(`[Parser] ${msg}`),
  debug: (msg) => log.debug(`[Parser] ${msg}`),
  error: (msg) => log.error(`[Parser] ${msg}`)
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
    const containerDataProvider = new ContainerDataAdapter(clabTreeDataToTopoviewer);
    return this.parseYamlToElements(yamlContent, yamlFilePath, containerDataProvider);
  }

  /**
   * Transforms a Containerlab YAML string into Cytoscape elements for EDITOR mode.
   */
  public async clabYamlToCytoscapeElementsEditor(
    yamlContent: string,
    yamlFilePath?: string
  ): Promise<CyElement[]> {
    return this.parseYamlToElements(yamlContent, yamlFilePath, undefined);
  }

  /**
   * Shared implementation for parsing YAML to Cytoscape elements.
   */
  private async parseYamlToElements(
    yamlContent: string,
    yamlFilePath: string | undefined,
    containerDataProvider: ContainerDataAdapter | undefined
  ): Promise<CyElement[]> {
    // Parse as document to preserve structure for editing
    this.currentClabDoc = YAML.parseDocument(yamlContent);
    const parsed = this.currentClabDoc.toJS() as ClabTopology;
    this.currentClabTopo = parsed;

    // Load annotations
    const annotations = yamlFilePath
      ? await annotationsIO.loadAnnotations(yamlFilePath)
      : undefined;

    // Parse with the shared parser (with or without container data)
    const result = containerDataProvider
      ? TopologyParser.parse(yamlContent, {
          annotations: annotations as TopologyAnnotations | undefined,
          containerDataProvider,
          logger: parserLogger
        })
      : TopologyParser.parseForEditor(yamlContent, annotations as TopologyAnnotations | undefined);

    // Store state for external access
    this.currentIsPresetLayout = result.isPresetLayout;
    this.currentClabName = result.labName;
    this.currentClabPrefix = result.prefix;

    // Handle graph label migrations (persist to annotations file)
    if (yamlFilePath && result.graphLabelMigrations.length > 0) {
      await this.persistGraphLabelMigrations(
        yamlFilePath,
        annotations,
        result.graphLabelMigrations
      );
    }

    // Migrate interface patterns to annotations for nodes that don't have them
    if (yamlFilePath && result.pendingMigrations.length > 0) {
      this.migrateInterfacePatterns(yamlFilePath, result.pendingMigrations).catch((err) => {
        log.warn(`[TopologyAdapter] Failed to migrate interface patterns: ${err}`);
      });
    }

    return result.elements;
  }

  /**
   * Computes edge class based on interface states (public API).
   */
  public computeEdgeClassFromStates(
    topology: NonNullable<ClabTopology["topology"]>,
    sourceNode: string,
    targetNode: string,
    sourceState?: string,
    targetState?: string
  ): string {
    return computeEdgeClassFromStatesImpl(
      topology,
      sourceNode,
      targetNode,
      sourceState,
      targetState
    );
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
      const result = applyInterfacePatternMigrations(annotations, migrations);

      if (result.modified) {
        log.info(`[TopologyAdapter] Migrated interface patterns for ${migrations.length} nodes`);
      }

      return result.annotations;
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
    const localAnnotations = (annotations ?? {
      freeTextAnnotations: [],
      groupStyleAnnotations: [],
      nodeAnnotations: []
    }) as { nodeAnnotations: NodeAnnotationShape[] };
    localAnnotations.nodeAnnotations = localAnnotations.nodeAnnotations ?? [];

    const existingIds = new Set(localAnnotations.nodeAnnotations.map((na) => na.id));
    for (const migration of migrations) {
      if (existingIds.has(migration.nodeId)) continue;

      const annotation = buildAnnotationFromMigration(migration);
      localAnnotations.nodeAnnotations.push(annotation);
      log.info(`Migrated graph-* labels for node ${migration.nodeId} to annotations.json`);
    }

    await annotationsIO.saveAnnotations(yamlFilePath, localAnnotations as Record<string, unknown>);
    log.info("Saved migrated graph-* labels to annotations.json");
  }
}

/** Node annotation shape used for graph label migration */
interface NodeAnnotationShape {
  id: string;
  position?: { x: number; y: number };
  icon?: string;
  group?: string;
  level?: string;
  groupLabelPos?: string;
  geoCoordinates?: { lat: number; lng: number };
}

/**
 * Builds a NodeAnnotation from a GraphLabelMigration.
 */
function buildAnnotationFromMigration(migration: GraphLabelMigration): NodeAnnotationShape {
  const annotation: NodeAnnotationShape = { id: migration.nodeId };
  if (migration.position) annotation.position = migration.position;
  if (migration.icon) annotation.icon = migration.icon;
  if (migration.group) annotation.group = migration.group;
  if (migration.level) annotation.level = migration.level;
  if (migration.groupLabelPos) annotation.groupLabelPos = migration.groupLabelPos;
  if (migration.geoCoordinates) annotation.geoCoordinates = migration.geoCoordinates;
  return annotation;
}
