/**
 * useEdgeCreation - Hook for edge/link creation via cytoscape-edgehandles
 */
import { useEffect, useRef, useCallback } from 'react';
import type { Core as CyCore, NodeSingular, EdgeSingular } from 'cytoscape';
import cytoscape from 'cytoscape';
import edgehandles from 'cytoscape-edgehandles';

import { log } from '../../utils/logger';

// Register extension once
let edgehandlesRegistered = false;
function ensureEdgehandlesRegistered(): void {
  if (!edgehandlesRegistered) {
    cytoscape.use(edgehandles);
    edgehandlesRegistered = true;
  }
}

// Default interface pattern
const DEFAULT_INTERFACE_PATTERN = 'eth{n}';

// Built-in interface patterns by kind (same as legacy topoViewer)
const DEFAULT_INTERFACE_PATTERNS: Record<string, string> = {
  nokia_srlinux: 'e1-{n}',
  nokia_srsim: '1/1/c{n}/1',
  nokia_sros: '1/1/{n}',
  cisco_xrd: 'Gi0-0-0-{n}',
  cisco_xrv: 'Gi0/0/0/{n}',
  cisco_xrv9k: 'Gi0/0/0/{n}',
  cisco_csr1000v: 'Gi{n}',
  cisco_c8000v: 'Gi{n}',
  cisco_cat9kv: 'Gi1/0/{n}',
  cisco_iol: 'e0/{n}',
};

/**
 * Build interface pattern mapping from built-in defaults only.
 * Custom template patterns are NOT included - they're stored on each node's
 * extraData when created from a template (avoids conflicts when multiple
 * templates use the same kind with different patterns).
 */
function buildInterfacePatternMapping(): Record<string, string> {
  return { ...DEFAULT_INTERFACE_PATTERNS };
}

// Regex for parsing interface patterns like "eth{n}" or "Gi0/0/{n:0}"
const INTERFACE_PATTERN_REGEX = /^(.+)?\{n(?::(\d+))?\}(.+)?$/;

interface ParsedInterfacePattern {
  prefix: string;
  suffix: string;
  startIndex: number;
}

/**
 * Parse interface pattern like "eth{n}", "Gi0/0/{n:0}", or simple patterns like "lo"
 * If no {n} placeholder, treat the whole pattern as prefix and append numbers
 */
function parseInterfacePattern(pattern: string): ParsedInterfacePattern {
  const match = INTERFACE_PATTERN_REGEX.exec(pattern);
  if (!match) {
    // No {n} placeholder - treat the whole pattern as prefix
    // This handles patterns like "lo" -> lo0, lo1, etc.
    return { prefix: pattern || 'eth', suffix: '', startIndex: 0 };
  }
  const [, prefix = '', startStr, suffix = ''] = match;
  const startIndex = startStr ? parseInt(startStr, 10) : 0;
  return { prefix, suffix, startIndex };
}

/**
 * Generate interface name from pattern and index
 */
function generateInterfaceName(parsed: ParsedInterfacePattern, index: number): string {
  const num = parsed.startIndex + index;
  return `${parsed.prefix}${num}${parsed.suffix}`;
}

/**
 * Get interface pattern for a node from its extraData or kind-based mapping
 * Priority: node.extraData.interfacePattern → kindMapping[kind] → DEFAULT
 */
function getNodeInterfacePattern(
  node: NodeSingular,
  interfacePatternMapping: Record<string, string>
): string {
  const extraData = node.data('extraData') as { interfacePattern?: string; kind?: string } | undefined;

  // Priority 1: Node-specific interface pattern (from template or annotation)
  if (extraData?.interfacePattern) {
    return extraData.interfacePattern;
  }

  // Priority 2: Kind-based mapping (built-in + custom nodes)
  const kind = extraData?.kind;
  if (kind && interfacePatternMapping[kind]) {
    return interfacePatternMapping[kind];
  }

  // Priority 3: Default pattern
  return DEFAULT_INTERFACE_PATTERN;
}

/**
 * Extract interface index from an endpoint string using a parsed pattern
 * Returns -1 if not matching
 */
function extractInterfaceIndex(endpoint: string, parsed: ParsedInterfacePattern): number {
  // Build regex to match the pattern
  const escapedPrefix = parsed.prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedSuffix = parsed.suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`^${escapedPrefix}(\\d+)${escapedSuffix}$`);
  const match = regex.exec(endpoint);
  if (match) {
    return parseInt(match[1], 10) - parsed.startIndex;
  }
  return -1;
}

interface EdgeCreationOptions {
  mode: 'edit' | 'view';
  isLocked: boolean;
  onEdgeCreated?: (sourceId: string, targetId: string, edgeData: EdgeData) => void;
}

interface EdgeData {
  id: string;
  source: string;
  target: string;
  sourceEndpoint: string;
  targetEndpoint: string;
}

/**
 * Collect used interface indices for a node using its interface pattern
 */
function collectUsedIndices(cy: CyCore, nodeId: string, parsed: ParsedInterfacePattern): Set<number> {
  const usedIndices = new Set<number>();
  const edges = cy.edges(`[source = "${nodeId}"], [target = "${nodeId}"]`);

  edges.forEach((edge) => {
    const src = edge.data('source');
    const tgt = edge.data('target');
    const epSrc = edge.data('sourceEndpoint') as string | undefined;
    const epTgt = edge.data('targetEndpoint') as string | undefined;

    if (src === nodeId && epSrc) {
      const idx = extractInterfaceIndex(epSrc, parsed);
      if (idx >= 0) usedIndices.add(idx);
    }
    if (tgt === nodeId && epTgt) {
      const idx = extractInterfaceIndex(epTgt, parsed);
      if (idx >= 0) usedIndices.add(idx);
    }
  });

  return usedIndices;
}

/**
 * Get the next available endpoint for a node using its interface pattern
 * Network nodes don't have interface endpoints - they return empty string
 */
function getNextEndpointForNode(
  cy: CyCore,
  node: NodeSingular,
  interfacePatternMapping: Record<string, string>
): string {
  // Network nodes don't have interface endpoints
  if (node.data('topoViewerRole') === 'cloud') {
    return '';
  }

  const pattern = getNodeInterfacePattern(node, interfacePatternMapping);
  const parsed = parseInterfacePattern(pattern);
  const usedIndices = collectUsedIndices(cy, node.id(), parsed);

  // Find next available index
  let nextIndex = 0;
  while (usedIndices.has(nextIndex)) {
    nextIndex++;
  }

  return generateInterfaceName(parsed, nextIndex);
}

/**
 * Check if a node is a network node (cloud/special endpoint)
 */
function isNetworkNode(node: NodeSingular): boolean {
  return node.data('topoViewerRole') === 'cloud';
}

/**
 * Check if edge connection is valid
 * Network-to-network connections are not allowed
 * Network-to-node and node-to-network connections are allowed
 */
function canConnect(sourceNode: NodeSingular, targetNode: NodeSingular): boolean {
  const sourceRole = sourceNode.data('topoViewerRole');
  const targetRole = targetNode.data('topoViewerRole');
  const invalidRoles = ['freeText', 'group'];

  log.info(`[EdgeCreation] canConnect check: ${sourceNode.id()} (${sourceRole}) -> ${targetNode.id()} (${targetRole})`);

  // Network-to-network connections not allowed
  if (isNetworkNode(sourceNode) && isNetworkNode(targetNode)) {
    log.info('[EdgeCreation] canConnect: REJECTED - network-to-network');
    return false;
  }

  const result = (
    !invalidRoles.includes(sourceRole) &&
    !invalidRoles.includes(targetRole) &&
    !sourceNode.same(targetNode) &&
    !sourceNode.isParent() &&
    !targetNode.isParent()
  );

  log.info(`[EdgeCreation] canConnect: ${result ? 'ALLOWED' : 'REJECTED'}`);
  return result;
}

/**
 * Create edge data for a new edge
 */
function createEdgeParams(
  cy: CyCore,
  sourceNode: NodeSingular,
  targetNode: NodeSingular,
  interfacePatternMapping: Record<string, string>
): EdgeData {
  const sourceEndpoint = getNextEndpointForNode(cy, sourceNode, interfacePatternMapping);
  const targetEndpoint = getNextEndpointForNode(cy, targetNode, interfacePatternMapping);

  return {
    id: `${sourceNode.id()}-${targetNode.id()}`,
    source: sourceNode.id(),
    target: targetNode.id(),
    sourceEndpoint,
    targetEndpoint
  };
}

/**
 * Edgehandles options configuration
 */
function getEdgehandlesOptions(cy: CyCore, interfacePatternMapping: Record<string, string>) {
  return {
    hoverDelay: 50,
    snap: false,
    snapThreshold: 10,
    snapFrequency: 150,
    noEdgeEventsInDraw: false,
    disableBrowserGestures: false,
    handleNodes: 'node[topoViewerRole != "freeText"]',
    canConnect,
    edgeParams: (sourceNode: NodeSingular, targetNode: NodeSingular) =>
      createEdgeParams(cy, sourceNode, targetNode, interfacePatternMapping)
  };
}

// Scratch key for storing edge creation state on cy instance
export const EDGE_CREATION_SCRATCH_KEY = '_isCreatingEdge';

/**
 * Process completed edge creation and notify callback
 */
function processEdgeCreation(
  cy: CyCore,
  sourceNode: NodeSingular,
  targetNode: NodeSingular,
  addedEdge: EdgeSingular,
  interfacePatternMapping: Record<string, string>,
  onEdgeCreated?: (sourceId: string, targetId: string, edgeData: EdgeData) => void
): void {
  log.info(`[EdgeCreation] Edge created: ${sourceNode.id()} -> ${targetNode.id()}`);

  // Add stub-link class if either endpoint is a network node (dashed line styling)
  if (isNetworkNode(sourceNode) || isNetworkNode(targetNode)) {
    addedEdge.addClass('stub-link');
    log.info('[EdgeCreation] Added stub-link class for network connection');
  }

  if (!onEdgeCreated) return;

  // Calculate endpoints directly using node-specific interface patterns
  const srcEndpoint = getNextEndpointForNode(cy, sourceNode, interfacePatternMapping);
  const tgtEndpoint = getNextEndpointForNode(cy, targetNode, interfacePatternMapping);

  // Update the edge data with endpoints
  addedEdge.data('sourceEndpoint', srcEndpoint);
  addedEdge.data('targetEndpoint', tgtEndpoint);

  log.info(`[EdgeCreation] Endpoints: ${srcEndpoint} -> ${tgtEndpoint}`);

  const edgeData: EdgeData = {
    id: addedEdge.id(),
    source: sourceNode.id(),
    target: targetNode.id(),
    sourceEndpoint: srcEndpoint,
    targetEndpoint: tgtEndpoint
  };
  onEdgeCreated(sourceNode.id(), targetNode.id(), edgeData);
}

// Edgehandles instance type
type EdgehandlesInstance = {
  enable: () => void;
  disable: () => void;
  start: (node: NodeSingular) => void;
  destroy: () => void;
};

interface EdgeCreationHandlers {
  handleStart: () => void;
  handleStopCancel: () => void;
  handleComplete: (e: unknown, src: NodeSingular, tgt: NodeSingular, edge: EdgeSingular) => void;
}

/**
 * Create lifecycle event handlers for edgehandles
 */
function createLifecycleHandlers(
  cy: CyCore,
  isCreatingEdgeRef: { current: boolean },
  onEdgeCreatedRef: { current: EdgeCreationOptions['onEdgeCreated'] },
  interfacePatternMappingRef: { current: Record<string, string> }
): EdgeCreationHandlers {
  return {
    handleStart: () => {
      isCreatingEdgeRef.current = true;
      cy.scratch(EDGE_CREATION_SCRATCH_KEY, true);
      log.debug('[EdgeCreation] Edge creation started');
    },
    handleStopCancel: () => {
      setTimeout(() => {
        isCreatingEdgeRef.current = false;
        cy.scratch(EDGE_CREATION_SCRATCH_KEY, false);
        log.debug('[EdgeCreation] Edge creation stopped/cancelled');
      }, 200);
    },
    handleComplete: (_event: unknown, sourceNode: NodeSingular, targetNode: NodeSingular, addedEdge: EdgeSingular) => {
      processEdgeCreation(cy, sourceNode, targetNode, addedEdge, interfacePatternMappingRef.current, onEdgeCreatedRef.current);
      setTimeout(() => {
        isCreatingEdgeRef.current = false;
        cy.scratch(EDGE_CREATION_SCRATCH_KEY, false);
        log.debug('[EdgeCreation] Edge creation flag cleared');
      }, 200);
    }
  };
}

interface EdgehandlesRefs {
  ehRef: { current: EdgehandlesInstance | null };
  isCreatingEdgeRef: { current: boolean };
  onEdgeCreatedRef: { current: EdgeCreationOptions['onEdgeCreated'] };
  interfacePatternMappingRef: { current: Record<string, string> };
}

/**
 * Initialize edgehandles extension on cytoscape instance
 */
function initializeEdgehandles(
  cyInstance: CyCore,
  refs: EdgehandlesRefs
): () => void {
  ensureEdgehandlesRegistered();

  const cyAny = cyInstance as unknown as { edgehandles: (opts: unknown) => EdgehandlesInstance };
  const eh = cyAny.edgehandles(getEdgehandlesOptions(cyInstance, refs.interfacePatternMappingRef.current));
  refs.ehRef.current = eh;
  eh.enable();

  const handlers = createLifecycleHandlers(cyInstance, refs.isCreatingEdgeRef, refs.onEdgeCreatedRef, refs.interfacePatternMappingRef);
  cyInstance.on('ehstart', handlers.handleStart);
  cyInstance.on('ehstop ehcancel', handlers.handleStopCancel);
  cyInstance.on('ehcomplete', handlers.handleComplete as unknown as cytoscape.EventHandler);

  log.info('[EdgeCreation] Edgehandles initialized');

  return () => {
    cyInstance.off('ehstart', handlers.handleStart);
    cyInstance.off('ehstop ehcancel', handlers.handleStopCancel);
    cyInstance.off('ehcomplete', handlers.handleComplete as unknown as cytoscape.EventHandler);
    if (refs.ehRef.current) {
      refs.ehRef.current.destroy();
      refs.ehRef.current = null;
    }
  };
}

/**
 * Hook for managing edge creation via edgehandles
 */
export function useEdgeCreation(
  cyInstance: CyCore | null,
  options: EdgeCreationOptions
): {
  startEdgeCreation: (nodeId: string) => void;
  isCreatingEdge: boolean;
} {
  const ehRef = useRef<EdgehandlesInstance | null>(null);
  const isCreatingEdgeRef = useRef(false);

  // Store onEdgeCreated in a ref to avoid re-initializing edgehandles when callback changes
  const onEdgeCreatedRef = useRef(options.onEdgeCreated);
  onEdgeCreatedRef.current = options.onEdgeCreated;

  // Use built-in interface pattern mapping (constant, doesn't include custom templates)
  const interfacePatternMappingRef = useRef(buildInterfacePatternMapping());

  // Initialize edgehandles
  useEffect(() => {
    if (!cyInstance || options.mode !== 'edit') return;
    const refs: EdgehandlesRefs = { ehRef, isCreatingEdgeRef, onEdgeCreatedRef, interfacePatternMappingRef };
    return initializeEdgehandles(cyInstance, refs);
  }, [cyInstance, options.mode]);

  // Enable/disable based on mode and lock state
  useEffect(() => {
    if (!ehRef.current) return;
    if (options.mode === 'edit' && !options.isLocked) {
      ehRef.current.enable();
    } else {
      ehRef.current.disable();
    }
  }, [options.mode, options.isLocked]);

  const startEdgeCreation = useCallback((nodeId: string) => {
    if (!cyInstance || !ehRef.current || options.mode !== 'edit') return;
    const node = cyInstance.getElementById(nodeId);
    if (node.empty()) return;
    ehRef.current.start(node as NodeSingular);
    isCreatingEdgeRef.current = true;
    log.info(`[EdgeCreation] Starting edge creation from node: ${nodeId}`);
  }, [cyInstance, options.mode]);

  return {
    startEdgeCreation,
    isCreatingEdge: isCreatingEdgeRef.current
  };
}
