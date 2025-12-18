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
 */

// Types
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
  DummyContext,
  SpecialNodeInfo,
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
export {
  nullLogger,
  ROUTER_KINDS,
  CLIENT_KINDS,
  detectRole,
} from './types';

// Node config resolver
export { resolveNodeConfig } from './NodeConfigResolver';

// Link normalizer
export {
  TYPES,
  NODE_KIND_BRIDGE,
  NODE_KIND_OVS_BRIDGE,
  SINGLE_ENDPOINT_TYPE_LIST,
  splitEndpoint,
  normalizeSingleTypeToSpecialId,
  normalizeLinkToTwoEndpoints,
  resolveActualNode,
  buildContainerName,
  shouldOmitEndpoint,
  extractEndpointMac,
  createDummyContext,
  STR_HOST,
  STR_MGMT_NET,
  PREFIX_MACVLAN,
  PREFIX_VXLAN,
  PREFIX_VXLAN_STITCH,
  splitEndpointLike,
  isSpecialEndpointId,
} from './LinkNormalizer';
export type { SpecialNodeType, EndpointParts, NormalizedLink } from './LinkNormalizer';

// Special node handler
export {
  initSpecialNodes,
  determineSpecialNode,
  registerEndpoint,
  getSpecialId,
  collectSpecialNodes,
  addCloudNodes,
  isSpecialNode,
  assignCommonLinkProps,
  assignHostMgmtProps,
  assignVxlanProps,
  buildBaseProps,
  mergeSpecialNodeProps,
} from './SpecialNodeHandler';

// Utility functions
export {
  computeFullPrefix,
  extractIconVisuals,
  sanitizeLabels,
  getNodeLatLng,
  computeLongname,
  createNodeAnnotationsMap,
  getLabName,
  getTopologyNodeIds,
} from './utils';

// Interface patterns
export { DEFAULT_INTERFACE_PATTERNS } from '../constants/interfacePatterns';

// Distributed SROS mapper
export {
  isDistributedSrosNode,
  mapSrosInterfaceName,
  getCandidateInterfaceNames,
  matchInterfaceInContainer,
  containerBelongsToDistributedNode,
  buildDistributedCandidateNames,
  extractSrosComponentInfo,
  srosSlotPriority,
  findInterfaceByCandidateNames,
  findDistributedSrosInterface,
  findDistributedSrosContainer,
} from './DistributedSrosMapper';

// Node element builder
export {
  getContainerData,
  createNodeExtraData,
  buildNodeElement,
  addNodeElements,
  isPresetLayout,
} from './NodeElementBuilder';
export type { NodeBuildOptions } from './NodeElementBuilder';

// Edge element builder
export {
  isSpecialNode as isSpecialNodeForEdge,
  classFromState,
  edgeClassForSpecial,
  computeEdgeClass,
  computeEdgeClassFromStates,
  validateVethLink,
  validateSpecialLink,
  validateExtendedLink,
  resolveContainerAndInterface,
  extractEdgeInterfaceStats,
  createClabInfo,
  extractExtLinkProps,
  extractExtMacs,
  createExtInfo,
  buildEdgeClasses,
  buildEdgeExtraData,
  buildEdgeElement,
  addEdgeElements,
} from './EdgeElementBuilder';
export type { EdgeBuildOptions } from './EdgeElementBuilder';

// Alias node handler
export {
  CLASS_ALIASED_BASE_BRIDGE,
  isBridgeKind,
  buildNodeAnnotationIndex,
  asTrimmedString,
  toPosition,
  collectAliasEntriesNew,
  listAliasEntriesFromNodeAnnotations,
  normalizeAliasList,
  buildAliasMap,
  deriveAliasPlacement,
  buildBridgeAliasElement,
  createAliasElement,
  addAliasNodesFromAnnotations,
  rewireEdges,
  applyAliasMappingsToEdges,
  collectAliasGroups,
  collectStillReferencedBaseBridges,
  addClass,
  hideBaseBridgeNodesWithAliases,
} from './AliasNodeHandler';
export type { AliasEntry } from './AliasNodeHandler';

// Graph label migrator
export {
  nodeHasGraphLabels,
  topologyHasGraphLabels,
  buildAnnotationFromLabels,
  migrationToNodeAnnotation,
  detectGraphLabelMigrations,
  applyGraphLabelMigrations,
  processGraphLabelMigrations,
} from './GraphLabelMigrator';

// Interface pattern resolver
export {
  resolveInterfacePattern,
  getDefaultInterfacePatterns,
  needsInterfacePatternMigration,
  createInterfacePatternMigration,
  collectInterfacePatternMigrations,
} from './InterfacePatternResolver';
export type { InterfacePatternResult } from './InterfacePatternResolver';

// Main parser
export { TopologyParser, parseTopology, parseTopologyForEditor } from './TopologyParser';
