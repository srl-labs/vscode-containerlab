/**
 * Shared Topology Parser
 *
 * This module provides a VS Code-free topology parser that can be used by both
 * the production extension and the dev server. It converts containerlab YAML
 * topologies to Cytoscape elements.
 *
 * @example Basic usage (dev server)
 * ```typescript
 * import { TopologyParser } from '@shared/parsing';
 * const result = TopologyParser.parse(yamlContent, { annotations });
 * ```
 *
 * @example With container enrichment (VS Code extension)
 * ```typescript
 * import { TopologyParser } from '@shared/parsing';
 * import { ContainerDataAdapter } from './ContainerDataAdapter';
 *
 * const adapter = new ContainerDataAdapter(clabTreeData);
 * const result = TopologyParser.parse(yamlContent, {
 *   annotations,
 *   containerDataProvider: adapter,
 *   logger: vscodeLogger
 * });
 * ```
 *
 * For internal utilities, import directly from sub-modules:
 * - `./NodeElementBuilder` - node element building
 * - `./EdgeElementBuilder` - edge element building
 * - `./SpecialNodeHandler` - special node handling (host, mgmt, vxlan)
 * - `./AliasNodeHandler` - bridge alias handling
 * - `./LinkNormalizer` - link endpoint normalization
 * - `./DistributedSrosMapper` - SR OS distributed interface mapping
 * - `./GraphLabelMigrator` - graph label migration
 * - `./InterfacePatternResolver` - interface pattern resolution
 */

// Main parser API
export { TopologyParser, parseTopology, parseTopologyForEditor } from './TopologyParser';

// Core types
export type {
  ParseOptions,
  ParseResult,
  ContainerDataProvider,
  ContainerInfo,
  InterfaceInfo,
  ParserLogger,
  InterfacePatternMigration,
  GraphLabelMigration,
  NodeBuildContext,
  EdgeBuildContext,
  NodeRole,
} from './types';

// Re-export topology types for convenience
export type {
  ClabTopology,
  CyElement,
  TopologyAnnotations,
  NodeAnnotation,
} from './types';

// Constants and utilities from types
export { nullLogger, ROUTER_KINDS, CLIENT_KINDS, detectRole } from './types';

// Node config resolver (commonly used)
export { resolveNodeConfig } from './NodeConfigResolver';

// Commonly used utilities
export {
  computeFullPrefix,
  getLabName,
  getTopologyNodeIds,
  isPresetLayout,
} from './utils';

// Edge stats (used by EdgeStatsBuilder)
export { extractEdgeInterfaceStats, computeEdgeClassFromStates } from './EdgeElementBuilder';

// Interface patterns
export { DEFAULT_INTERFACE_PATTERNS } from '../constants/interfacePatterns';
