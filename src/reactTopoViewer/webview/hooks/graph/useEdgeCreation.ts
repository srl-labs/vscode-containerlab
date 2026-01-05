/**
 * useEdgeCreation - Hook for edge/link creation via cytoscape-edgehandles
 */
import { useEffect, useRef, useCallback } from 'react';
import type { Core as CyCore, NodeSingular, EdgeSingular } from 'cytoscape';
import cytoscape from 'cytoscape';
import edgehandles from 'cytoscape-edgehandles';

import { log } from '../../utils/logger';
import {
  DEFAULT_INTERFACE_PATTERNS,
  getNextEndpointForNode as getNextEndpoint,
  getNextEndpointForNodeExcluding
} from '../../utils/interfacePatterns';

// Register extension once
let edgehandlesRegistered = false;
function ensureEdgehandlesRegistered(): void {
  if (!edgehandlesRegistered) {
    cytoscape.use(edgehandles);
    edgehandlesRegistered = true;
  }
}

/**
 * Build interface pattern mapping from built-in defaults only.
 * Custom template patterns are NOT included - they're stored on each node's
 * extraData when created from a template (avoids conflicts when multiple
 * templates use the same kind with different patterns).
 */
function buildInterfacePatternMapping(): Record<string, string> {
  return { ...DEFAULT_INTERFACE_PATTERNS };
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
 * Get the next available endpoint for a node using its interface pattern
 * Wrapper that handles network node detection
 */
function getNextEndpointForNode(
  cy: CyCore,
  node: NodeSingular,
  interfacePatternMapping: Record<string, string>
): string {
  return getNextEndpoint(cy, node, isNetworkNode, interfacePatternMapping);
}

/**
 * Check if a node is a network node that doesn't require interface names.
 * Returns true for special endpoints (host, mgmt-net, macvlan, vxlan, dummy)
 * Returns false for bridges - they are node kinds that require interfaces (bridge0:eth1)
 */
function isNetworkNode(node: NodeSingular): boolean {
  const role = node.data('topoViewerRole') as string | undefined;
  if (role !== 'cloud') return false;

  // Bridges are node kinds, not special endpoint types - they need interface names
  const extraData = node.data('extraData') as { kind?: string } | undefined;
  const kind = extraData?.kind;
  if (kind === 'bridge' || kind === 'ovs-bridge') return false;

  return true;
}

/**
 * Check if edge connection is valid
 * Network-to-network connections are not allowed
 * Network-to-node and node-to-network connections are allowed
 */
function canConnect(sourceNode: NodeSingular, targetNode: NodeSingular): boolean {
  const sourceRole = sourceNode.data('topoViewerRole') as string | undefined;
  const targetRole = targetNode.data('topoViewerRole') as string | undefined;
  const invalidRoles = ['freeText', 'group'];

  log.info(`[EdgeCreation] canConnect check: ${sourceNode.id()} (${sourceRole}) -> ${targetNode.id()} (${targetRole})`);

  // Network-to-network connections not allowed
  if (isNetworkNode(sourceNode) && isNetworkNode(targetNode)) {
    log.info('[EdgeCreation] canConnect: REJECTED - network-to-network');
    return false;
  }

  const result = (
    (!sourceRole || !invalidRoles.includes(sourceRole)) &&
    (!targetRole || !invalidRoles.includes(targetRole)) &&
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

  // For self-loops (hairpin): allocate a different endpoint for target
  let targetEndpoint: string;
  if (sourceNode.same(targetNode)) {
    targetEndpoint = getNextEndpointForNodeExcluding(
      cy, targetNode, interfacePatternMapping, [sourceEndpoint]
    );
  } else {
    targetEndpoint = getNextEndpointForNode(cy, targetNode, interfacePatternMapping);
  }

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

  const isSelfLoop = sourceNode.same(targetNode);
  const existingSourceEndpoint = addedEdge.data('sourceEndpoint') as string | undefined;
  const existingTargetEndpoint = addedEdge.data('targetEndpoint') as string | undefined;

  // Calculate endpoints directly using node-specific interface patterns
  let srcEndpoint = existingSourceEndpoint || getNextEndpointForNode(cy, sourceNode, interfacePatternMapping);
  let tgtEndpoint = existingTargetEndpoint || (
    isSelfLoop
      ? getNextEndpointForNodeExcluding(cy, targetNode, interfacePatternMapping, [srcEndpoint])
      : getNextEndpointForNode(cy, targetNode, interfacePatternMapping)
  );

  if (isSelfLoop && srcEndpoint && tgtEndpoint && srcEndpoint === tgtEndpoint) {
    tgtEndpoint = getNextEndpointForNodeExcluding(cy, targetNode, interfacePatternMapping, [srcEndpoint]);
  }

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
