/**
 * Main topology parser - orchestrates all parsing operations.
 * Pure functions - no VS Code dependencies.
 */

import * as YAML from 'yaml';

import type { ClabTopology, CyElement, TopologyAnnotations } from '../types/topology';

import type {
  ParseOptions,
  ParseResult,
  ContainerDataProvider,
  DummyContext,
  InterfacePatternMigration,
  GraphLabelMigration,
  ParserLogger,
} from './types';
import { nullLogger } from './types';
import { computeFullPrefix, getLabName, getTopologyNodeIds, isPresetLayout } from './utils';
import { addNodeElements } from './NodeElementBuilder';
import { addEdgeElements } from './EdgeElementBuilder';
import { collectSpecialNodes, addCloudNodes } from './SpecialNodeHandler';
import {
  addAliasNodesFromAnnotations,
  applyAliasMappingsToEdges,
  hideBaseBridgeNodesWithAliases,
} from './AliasNodeHandler';
import { createDummyContext } from './LinkNormalizer';
import {
  detectGraphLabelMigrations,
  applyGraphLabelMigrations,
} from './GraphLabelMigrator';

// ============================================================================
// Main Parser Class
// ============================================================================

/**
 * Topology parser for converting Containerlab YAML to Cytoscape elements.
 *
 * @example Basic usage (dev server)
 * ```typescript
 * const result = TopologyParser.parse(yamlContent, { annotations });
 * ```
 *
 * @example With container enrichment (VS Code extension)
 * ```typescript
 * const adapter = new ContainerDataAdapter(clabTreeData);
 * const result = TopologyParser.parse(yamlContent, {
 *   annotations,
 *   containerDataProvider: adapter,
 *   logger: vscodeLogger
 * });
 * ```
 */
export class TopologyParser {
  /**
   * Parses YAML content into Cytoscape elements.
   *
   * @param yamlContent - The YAML content to parse
   * @param options - Parse options including annotations and container data
   * @returns Parse result with elements, migrations, and metadata
   */
  static parse(yamlContent: string, options: ParseOptions = {}): ParseResult {
    const log = options.logger ?? nullLogger;

    // Parse YAML
    const doc = YAML.parseDocument(yamlContent);
    const parsed = doc.toJS() as ClabTopology;

    // Get basic info
    const labName = options.labName ?? getLabName(parsed);
    const prefix = computeFullPrefix(parsed, labName);

    // Handle annotations - detect graph label migrations
    let annotations = options.annotations;
    let graphLabelMigrations: GraphLabelMigration[] = [];

    if (parsed.topology?.nodes) {
      const migrations = detectGraphLabelMigrations(parsed, annotations);
      if (migrations.length > 0) {
        graphLabelMigrations = migrations;
        annotations = applyGraphLabelMigrations(annotations, migrations);
        migrations.forEach((m) => {
          log.info(`Detected graph-* labels for node ${m.nodeId} that need migration`);
        });
      }
    }

    // Build elements
    const result = TopologyParser.buildElements(parsed, {
      annotations,
      containerDataProvider: options.containerDataProvider,
      logger: log,
      labName,
      prefix,
    });

    return {
      elements: result.elements,
      labName,
      prefix,
      isPresetLayout: result.isPresetLayout,
      pendingMigrations: result.interfacePatternMigrations,
      graphLabelMigrations,
    };
  }

  /**
   * Parses YAML for editor mode (no container data).
   */
  static parseForEditor(
    yamlContent: string,
    annotations?: TopologyAnnotations
  ): ParseResult {
    return TopologyParser.parse(yamlContent, {
      annotations,
    });
  }

  /**
   * Parses YAML with container data enrichment.
   */
  static parseWithContainerData(
    yamlContent: string,
    annotations: TopologyAnnotations | undefined,
    containerDataProvider: ContainerDataProvider,
    logger?: ParserLogger
  ): ParseResult {
    return TopologyParser.parse(yamlContent, {
      annotations,
      containerDataProvider,
      logger,
    });
  }

  // ============================================================================
  // Internal Methods
  // ============================================================================

  /**
   * Builds Cytoscape elements from parsed topology.
   */
  private static buildElements(
    parsed: ClabTopology,
    options: {
      annotations?: TopologyAnnotations;
      containerDataProvider?: ContainerDataProvider;
      logger?: ParserLogger;
      labName: string;
      prefix: string;
    }
  ): {
    elements: CyElement[];
    isPresetLayout: boolean;
    interfacePatternMigrations: InterfacePatternMigration[];
  } {
    const log = options.logger ?? nullLogger;
    const elements: CyElement[] = [];

    if (!parsed.topology) {
      log.warn("Parsed YAML does not contain 'topology' object.");
      return { elements, isPresetLayout: false, interfacePatternMigrations: [] };
    }

    // Check preset layout
    const preset = isPresetLayout(parsed, options.annotations);
    log.info(`Preset layout status: ${preset}`);

    // Build options for node/edge builders
    const buildOpts = {
      includeContainerData: Boolean(options.containerDataProvider),
      containerDataProvider: options.containerDataProvider,
      annotations: options.annotations,
      logger: options.logger,
    };

    // Add node elements
    const migrations = addNodeElements(
      parsed,
      buildOpts,
      options.prefix,
      options.labName,
      elements
    );

    // Collect and add special nodes
    const ctx: DummyContext = createDummyContext();
    const { specialNodes, specialNodeProps } = collectSpecialNodes(parsed, ctx);
    const yamlNodeIds = getTopologyNodeIds(parsed);
    addCloudNodes(specialNodes, specialNodeProps, options.annotations, elements, yamlNodeIds);

    // Add edge elements
    addEdgeElements(
      parsed,
      buildOpts,
      options.prefix,
      options.labName,
      specialNodes,
      ctx,
      elements
    );

    // Track logged bridges for alias handling
    const loggedUnmappedBaseBridges = new Set<string>();

    // Add alias nodes
    addAliasNodesFromAnnotations(parsed, options.annotations, elements);

    // Rewire edges to alias nodes
    applyAliasMappingsToEdges(options.annotations, elements);

    // Hide base bridge nodes that have aliases
    hideBaseBridgeNodesWithAliases(elements, loggedUnmappedBaseBridges, options.logger);

    log.info(`Transformed YAML to Cytoscape elements. Total elements: ${elements.length}`);

    return {
      elements,
      isPresetLayout: preset,
      interfacePatternMigrations: migrations,
    };
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Parses a topology YAML string.
 * Convenience function that wraps TopologyParser.parse().
 */
export function parseTopology(
  yamlContent: string,
  options?: ParseOptions
): ParseResult {
  return TopologyParser.parse(yamlContent, options);
}

/**
 * Parses a topology for editor mode.
 * Convenience function that wraps TopologyParser.parseForEditor().
 */
export function parseTopologyForEditor(
  yamlContent: string,
  annotations?: TopologyAnnotations
): ParseResult {
  return TopologyParser.parseForEditor(yamlContent, annotations);
}
