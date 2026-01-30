/**
 * Main topology parser - orchestrates all parsing operations.
 * Pure functions - no VS Code dependencies.
 */

import * as YAML from "yaml";

import type { ClabTopology, ParsedElement, TopologyAnnotations } from "../types/topology";
import { convertElementsToTopologyData } from "../utilities/elementConversions";

import type {
  ParseOptions,
  ParseResult,
  ParseResultRF,
  ContainerDataProvider,
  DummyContext,
  InterfacePatternMigration,
  GraphLabelMigration,
  ParserLogger
} from "./types";
import { nullLogger } from "./types";
import { computeFullPrefix, getLabName, getTopologyNodeIds, isPresetLayout } from "./utils";
import { addNodeElements } from "./NodeElementBuilder";
import { addEdgeElements } from "./EdgeElementBuilder";
import { collectSpecialNodes, addNetworkNodes } from "./SpecialNodeHandler";
import {
  addAliasNodesFromAnnotations,
  applyAliasMappingsToEdges,
  hideBaseBridgeNodesWithAliases
} from "./AliasNodeHandler";
import { createDummyContext } from "./LinkNormalizer";
import { detectGraphLabelMigrations, applyGraphLabelMigrations } from "./GraphLabelMigrator";

// ============================================================================
// Main Parser Class
// ============================================================================

/**
 * Topology parser for converting Containerlab YAML to ReactFlow elements.
 *
 * @example Basic usage (dev server)
 * ```typescript
 * const result = TopologyParser.parseToReactFlow(yamlContent, { annotations });
 * ```
 *
 * @example With container enrichment (VS Code extension)
 * ```typescript
 * const adapter = new ContainerDataAdapter(clabTreeData);
 * const result = TopologyParser.parseToReactFlow(yamlContent, {
 *   annotations,
 *   containerDataProvider: adapter,
 *   logger: vscodeLogger
 * });
 * ```
 */
export class TopologyParser {
  /**
   * Parses YAML content into parsed elements (internal format).
   *
   * @param yamlContent - The YAML content to parse
   * @param options - Parse options including annotations and container data
   * @returns Parse result with elements, migrations, and metadata
   */
  static parse(yamlContent: string, options: ParseOptions = {}): ParseResult {
    const doc = YAML.parseDocument(yamlContent);
    const parsed = doc.toJS() as ClabTopology;
    return TopologyParser.parseFromParsed(parsed, options);
  }

  /**
   * Parses a pre-parsed topology object into parsed elements (internal format).
   * Use this to avoid redundant YAML parsing when a document has already been parsed.
   */
  static parseFromParsed(parsed: ClabTopology, options: ParseOptions = {}): ParseResult {
    const log = options.logger ?? nullLogger;

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
      prefix
    });

    return {
      elements: result.elements,
      labName,
      prefix,
      isPresetLayout: result.isPresetLayout,
      pendingMigrations: result.interfacePatternMigrations,
      graphLabelMigrations
    };
  }

  /**
   * Parses YAML content into ReactFlow nodes and edges.
   * Use this for new code instead of parse().
   *
   * @param yamlContent - The YAML content to parse
   * @param options - Parse options including annotations and container data
   * @returns Parse result with ReactFlow-format nodes and edges
   */
  static parseToReactFlow(yamlContent: string, options: ParseOptions = {}): ParseResultRF {
    const result = TopologyParser.parse(yamlContent, options);
    return TopologyParser.toReactFlowResult(result);
  }

  /**
   * Parses a pre-parsed topology object into ReactFlow nodes/edges.
   */
  static parseToReactFlowFromParsed(
    parsed: ClabTopology,
    options: ParseOptions = {}
  ): ParseResultRF {
    const result = TopologyParser.parseFromParsed(parsed, options);
    return TopologyParser.toReactFlowResult(result);
  }

  private static toReactFlowResult(result: ParseResult): ParseResultRF {
    const topology = convertElementsToTopologyData(result.elements);

    return {
      topology,
      labName: result.labName,
      prefix: result.prefix,
      isPresetLayout: result.isPresetLayout,
      pendingMigrations: result.pendingMigrations,
      graphLabelMigrations: result.graphLabelMigrations
    };
  }

  /**
   * Parses YAML for editor mode and returns ReactFlow format.
   */
  static parseForEditorRF(yamlContent: string, annotations?: TopologyAnnotations): ParseResultRF {
    return TopologyParser.parseToReactFlow(yamlContent, { annotations });
  }

  /**
   * Parses a pre-parsed topology object for editor mode and returns ReactFlow format.
   */
  static parseForEditorRFParsed(
    parsed: ClabTopology,
    annotations?: TopologyAnnotations
  ): ParseResultRF {
    return TopologyParser.parseToReactFlowFromParsed(parsed, { annotations });
  }

  // ============================================================================
  // Internal Methods
  // ============================================================================

  /**
   * Builds parsed elements from topology YAML.
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
    elements: ParsedElement[];
    isPresetLayout: boolean;
    interfacePatternMigrations: InterfacePatternMigration[];
  } {
    const log = options.logger ?? nullLogger;
    const elements: ParsedElement[] = [];

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
      logger: options.logger
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
    addNetworkNodes(specialNodes, specialNodeProps, options.annotations, elements, yamlNodeIds);

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

    log.info(`Transformed YAML to graph elements. Total elements: ${elements.length}`);

    return {
      elements,
      isPresetLayout: preset,
      interfacePatternMigrations: migrations
    };
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Parses a topology YAML string to ReactFlow format.
 * Convenience function that wraps TopologyParser.parseToReactFlow().
 */
export function parseTopologyToReactFlow(
  yamlContent: string,
  options?: ParseOptions
): ParseResultRF {
  return TopologyParser.parseToReactFlow(yamlContent, options);
}

/**
 * Parses a pre-parsed topology object to ReactFlow format.
 */
export function parseTopologyToReactFlowFromParsed(
  parsed: ClabTopology,
  options?: ParseOptions
): ParseResultRF {
  return TopologyParser.parseToReactFlowFromParsed(parsed, options);
}

/**
 * Parses a topology for editor mode to ReactFlow format.
 * Convenience function that wraps TopologyParser.parseForEditorRF().
 */
export function parseTopologyForEditorRF(
  yamlContent: string,
  annotations?: TopologyAnnotations
): ParseResultRF {
  return TopologyParser.parseForEditorRF(yamlContent, annotations);
}

/**
 * Parses a pre-parsed topology object for editor mode.
 */
export function parseTopologyForEditorRFParsed(
  parsed: ClabTopology,
  annotations?: TopologyAnnotations
): ParseResultRF {
  return TopologyParser.parseForEditorRFParsed(parsed, annotations);
}
