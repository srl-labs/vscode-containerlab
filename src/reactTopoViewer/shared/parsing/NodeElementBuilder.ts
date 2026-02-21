// Node element builder — pure functions, no VS Code dependencies.

import type {
  ClabNode,
  ParsedElement,
  ClabTopology,
  NodeAnnotation,
  NetworkNodeAnnotation,
  TopologyAnnotations,
} from "../types/topology";
import { DEFAULT_INTERFACE_PATTERNS } from "../constants/interfacePatterns";

import { resolveNodeConfig } from "./NodeConfigResolver";
import { NODE_KIND_BRIDGE, NODE_KIND_OVS_BRIDGE } from "./LinkNormalizer";
import { isDistributedSrosNode, findDistributedSrosContainer } from "./DistributedSrosMapper";
import { extractIconVisuals, sanitizeLabels, getNodeLatLng, computeLongname } from "./utils";
import type {
  ContainerDataProvider,
  ContainerInfo,
  InterfacePatternMigration,
  ParserLogger,
} from "./types";

// ============================================================================
// Build Options
// ============================================================================

export interface NodeBuildOptions {
  /** Include container runtime data (IPs, state) */
  includeContainerData?: boolean;
  /** Container data provider for runtime enrichment */
  containerDataProvider?: ContainerDataProvider;
  /** Annotations */
  annotations?: TopologyAnnotations;
  /** Logger */
  logger?: ParserLogger;
}

// ============================================================================
// Interface Pattern Resolution
// ============================================================================

/**
 * Build interface pattern mapping from built-in defaults only.
 */
function buildInterfacePatternMapping(): Record<string, string> {
  return { ...DEFAULT_INTERFACE_PATTERNS };
}

/** Result of resolving interface pattern for a node */
interface InterfacePatternResult {
  pattern: string | undefined;
  /** True if pattern was resolved from kind mapping (needs migration to annotations) */
  needsMigration: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getNodeComponents(node: ClabNode): unknown[] {
  return Array.isArray(node.components) ? node.components : [];
}

/**
 * Resolve interface pattern for a node.
 * Priority: annotation > kind-based mapping
 */
function resolveInterfacePattern(
  nodeAnn: NodeAnnotation | undefined,
  kind: string,
  interfacePatternMapping: Record<string, string>
): InterfacePatternResult {
  // First check if the annotation has an interface pattern (node-specific)
  const annPattern = nodeAnn?.interfacePattern;
  if (typeof annPattern === "string" && annPattern) {
    return { pattern: annPattern, needsMigration: false };
  }
  // Fall back to kind-based mapping - this needs migration
  const kindPattern = interfacePatternMapping[kind];
  return { pattern: kindPattern, needsMigration: Boolean(kindPattern) };
}

// ============================================================================
// Container Data Functions
// ============================================================================

/**
 * Gets container data for a node using the provider.
 */
export function getContainerData(
  opts: {
    includeContainerData?: boolean;
    containerDataProvider?: ContainerDataProvider;
  },
  fullPrefix: string,
  nodeName: string,
  labName: string,
  resolvedNode: ClabNode
): ContainerInfo | undefined {
  if (opts.includeContainerData !== true || opts.containerDataProvider === undefined) {
    return undefined;
  }

  const containerName = fullPrefix ? `${fullPrefix}-${nodeName}` : nodeName;
  const direct = opts.containerDataProvider.findContainer(containerName, labName);
  if (direct) {
    return direct;
  }

  if (!isDistributedSrosNode(resolvedNode)) {
    return undefined;
  }

  return findDistributedSrosContainer({
    baseNodeName: nodeName,
    fullPrefix,
    labName,
    provider: opts.containerDataProvider,
    components: getNodeComponents(resolvedNode),
  });
}

// ============================================================================
// Extra Data Building
// ============================================================================

/**
 * Build container-dependent data for extraData
 */
function buildContainerFields(
  includeContainerData: boolean,
  containerData: ContainerInfo | undefined
): { mgmtIpv4Address: string; mgmtIpv6Address: string; state: string } {
  if (!includeContainerData || !containerData) {
    return { mgmtIpv4Address: "", mgmtIpv6Address: "", state: "" };
  }
  return {
    mgmtIpv4Address: containerData.IPv4Address,
    mgmtIpv6Address: containerData.IPv6Address,
    state: containerData.state,
  };
}

/** Result of creating node extraData */
interface NodeExtraDataResult {
  extraData: Record<string, unknown>;
  /** If set, this node's interfacePattern needs to be migrated to annotations */
  migrationPattern?: string;
}

/**
 * Creates the extraData object for a node element.
 */
export function createNodeExtraData(params: {
  mergedNode: ClabNode;
  inheritedProps: string[];
  nodeName: string;
  labName: string;
  nodeIndex: number;
  fullPrefix: string;
  containerData: ContainerInfo | undefined;
  cleanedLabels: Record<string, unknown>;
  includeContainerData: boolean;
  interfacePatternMapping: Record<string, string>;
  nodeAnn?: NodeAnnotation;
}): NodeExtraDataResult {
  const {
    mergedNode,
    inheritedProps,
    nodeName,
    labName,
    nodeIndex,
    fullPrefix,
    containerData,
    cleanedLabels,
    includeContainerData,
    interfacePatternMapping,
    nodeAnn,
  } = params;

  const kind = mergedNode.kind ?? "";
  const { pattern: interfacePattern, needsMigration } = resolveInterfacePattern(
    nodeAnn,
    kind,
    interfacePatternMapping
  );
  const containerFields = buildContainerFields(includeContainerData, containerData);

  const extraData: Record<string, unknown> = {
    ...mergedNode,
    inherited: inheritedProps,
    clabServerUsername: "asad",
    fqdn: `${nodeName}.${labName}.io`,
    group: mergedNode.group ?? "",
    id: nodeName,
    image: mergedNode.image ?? "",
    index: nodeIndex.toString(),
    kind,
    type: mergedNode.type ?? "",
    labdir: fullPrefix ? `${fullPrefix}/` : "",
    labels: cleanedLabels,
    longname: computeLongname(containerData?.name, fullPrefix, nodeName),
    macAddress: "",
    mgmtIntf: "",
    mgmtIpv4AddressLength: 0,
    mgmtIpv4Address: containerFields.mgmtIpv4Address,
    mgmtIpv6Address: containerFields.mgmtIpv6Address,
    mgmtIpv6AddressLength: 0,
    mgmtNet: "",
    name: nodeName,
    shortname: nodeName,
    state: containerFields.state,
    weight: "3",
  };
  if (interfacePattern !== undefined && interfacePattern.length > 0) {
    extraData.interfacePattern = interfacePattern;
  }

  return {
    extraData,
    migrationPattern: needsMigration ? interfacePattern : undefined,
  };
}

// ============================================================================
// Node Element Building
// ============================================================================

/** Result of building a node element */
interface NodeElementResult {
  element: ParsedElement;
  /** If set, this node's interfacePattern needs to be migrated to annotations */
  migrationPattern?: string;
}

function resolveTopoViewerRole(
  mergedNode: ClabNode,
  nodeAnn: NodeAnnotation | undefined,
  labels: Record<string, unknown> | undefined
): string {
  const labelRole = labels?.["topoViewer-role"];
  const parsedLabelRole = typeof labelRole === "string" ? labelRole : undefined;
  return (
    nodeAnn?.icon ??
    parsedLabelRole ??
    (mergedNode.kind === NODE_KIND_BRIDGE || mergedNode.kind === NODE_KIND_OVS_BRIDGE
      ? NODE_KIND_BRIDGE
      : "pe")
  );
}

function resolveDisplayName(
  nodeName: string,
  nodeAnn: NodeAnnotation | undefined,
  isBridgeNode: boolean
): string {
  const annotatedLabel = nodeAnn?.label?.trim();
  return isBridgeNode && annotatedLabel !== undefined && annotatedLabel.length > 0
    ? annotatedLabel
    : nodeName;
}

function buildNodeAnnotationLookup(
  nodeAnnotations?: NodeAnnotation[],
  networkNodeAnnotations?: NetworkNodeAnnotation[]
): Map<string, NodeAnnotation> {
  const lookup = new Map<string, NodeAnnotation>();
  if (nodeAnnotations) {
    for (const annotation of nodeAnnotations) {
      lookup.set(annotation.id, annotation);
    }
  }
  if (networkNodeAnnotations) {
    for (const annotation of networkNodeAnnotations) {
      if (!lookup.has(annotation.id)) {
        lookup.set(annotation.id, { id: annotation.id, position: annotation.position });
      }
    }
  }
  return lookup;
}

function shouldSkipAliasBridgeNode(
  nodeName: string,
  nodeAnn: NodeAnnotation | undefined,
  nodeObj: ClabNode
): boolean {
  const yamlNodeId = nodeAnn?.yamlNodeId;
  return (
    yamlNodeId !== undefined &&
    yamlNodeId.length > 0 &&
    yamlNodeId !== nodeName &&
    (nodeObj.kind === NODE_KIND_BRIDGE || nodeObj.kind === NODE_KIND_OVS_BRIDGE)
  );
}

/**
 * Builds a single node element.
 */
export function buildNodeElement(params: {
  parsed: ClabTopology;
  nodeName: string;
  nodeObj: ClabNode;
  opts: NodeBuildOptions;
  fullPrefix: string;
  labName: string;
  nodeAnn: NodeAnnotation | undefined;
  nodeIndex: number;
  interfacePatternMapping: Record<string, string>;
}): NodeElementResult {
  const {
    parsed,
    nodeName,
    nodeObj,
    opts,
    fullPrefix,
    labName,
    nodeAnn,
    nodeIndex,
    interfacePatternMapping,
  } = params;
  const mergedNode = resolveNodeConfig(parsed, nodeObj);
  const nodePropKeys = new Set(Object.keys(nodeObj));
  const inheritedProps = Object.keys(mergedNode).filter((k) => !nodePropKeys.has(k));
  const containerData = getContainerData(opts, fullPrefix, nodeName, labName, mergedNode);
  const cleanedLabels = sanitizeLabels(isRecord(mergedNode.labels) ? mergedNode.labels : {});
  const pos = nodeAnn?.position;
  const position = pos ? { x: pos.x, y: pos.y } : { x: 0, y: 0 };
  const { lat, lng } = getNodeLatLng(nodeAnn);
  const { extraData, migrationPattern } = createNodeExtraData({
    mergedNode,
    inheritedProps,
    nodeName,
    labName,
    nodeIndex,
    fullPrefix,
    containerData,
    cleanedLabels,
    includeContainerData: opts.includeContainerData ?? false,
    interfacePatternMapping,
    nodeAnn,
  });

  const labels = mergedNode.labels;
  const topoViewerRole = resolveTopoViewerRole(mergedNode, nodeAnn, labels);

  const iconVisuals = extractIconVisuals(nodeAnn);
  const isBridgeNode =
    mergedNode.kind === NODE_KIND_BRIDGE || mergedNode.kind === NODE_KIND_OVS_BRIDGE;
  const displayName = resolveDisplayName(nodeName, nodeAnn, isBridgeNode);
  const element: ParsedElement = {
    group: "nodes",
    data: {
      id: nodeName,
      weight: "30",
      name: displayName,
      topoViewerRole,
      ...iconVisuals,
      lat,
      lng,
      extraData,
    },
    position,
    removed: false,
    selected: false,
    selectable: true,
    locked: false,
    grabbed: false,
    grabbable: true,
    classes: "",
  };

  return { element, migrationPattern };
}

/**
 * Adds node elements to the elements array.
 * Returns list of nodes that need interfacePattern migrated to annotations.
 */
export function addNodeElements(
  parsed: ClabTopology,
  opts: NodeBuildOptions,
  fullPrefix: string,
  labName: string,
  elements: ParsedElement[]
): InterfacePatternMigration[] {
  const migrations: InterfacePatternMigration[] = [];
  const topology = parsed.topology;
  if (!topology?.nodes) return migrations;

  const nodeAnnotations = opts.annotations?.nodeAnnotations;
  const networkNodeAnnotations = opts.annotations?.networkNodeAnnotations;
  const nodeAnnotationLookup = buildNodeAnnotationLookup(nodeAnnotations, networkNodeAnnotations);
  const interfacePatternMapping = buildInterfacePatternMapping();
  let nodeIndex = 0;

  for (const [nodeName, nodeObj] of Object.entries(topology.nodes)) {
    // Check nodeAnnotations first, then fallback to networkNodeAnnotations for bridges
    // (backwards compatibility - bridges were previously saved to networkNodeAnnotations)
    const nodeAnn = nodeAnnotationLookup.get(nodeName);
    // If this bridge node is configured as an alias (yamlNodeId points elsewhere),
    // skip rendering the base YAML node to avoid duplicate visuals.
    if (shouldSkipAliasBridgeNode(nodeName, nodeAnn, nodeObj)) {
      continue;
    }
    const { element, migrationPattern } = buildNodeElement({
      parsed,
      nodeName,
      nodeObj,
      opts,
      fullPrefix,
      labName,
      nodeAnn,
      nodeIndex,
      interfacePatternMapping,
    });
    elements.push(element);
    // Track migrations for nodes that need interfacePattern written to annotations
    if (migrationPattern !== undefined && migrationPattern.length > 0) {
      migrations.push({ nodeId: nodeName, interfacePattern: migrationPattern });
    }
    nodeIndex++;
  }
  return migrations;
}
