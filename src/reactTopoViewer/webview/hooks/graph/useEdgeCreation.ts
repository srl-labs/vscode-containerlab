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

// Regex for parsing interface patterns like "eth{n}" or "Gi0/0/{n:0}"
const INTERFACE_PATTERN_REGEX = /^(.+)?\{n(?::(\d+))?\}(.+)?$/;
// Regex for extracting eth interface number
const ETH_NUMBER_REGEX = /eth(\d+)/;

interface ParsedInterfacePattern {
  prefix: string;
  suffix: string;
  startIndex: number;
}

/**
 * Parse interface pattern like "eth{n}" or "Gi0/0/{n:0}"
 */
function parseInterfacePattern(pattern: string): ParsedInterfacePattern {
  const match = INTERFACE_PATTERN_REGEX.exec(pattern);
  if (!match) {
    return { prefix: 'eth', suffix: '', startIndex: 0 };
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
 * Collect used interface indices for a node
 */
function collectUsedIndices(cy: CyCore, nodeId: string): Set<number> {
  const usedIndices = new Set<number>();
  const edges = cy.edges(`[source = "${nodeId}"], [target = "${nodeId}"]`);

  edges.forEach((edge) => {
    const src = edge.data('source');
    const tgt = edge.data('target');
    const epSrc = edge.data('sourceEndpoint') as string | undefined;
    const epTgt = edge.data('targetEndpoint') as string | undefined;

    if (src === nodeId && epSrc) {
      const match = ETH_NUMBER_REGEX.exec(epSrc);
      if (match) usedIndices.add(parseInt(match[1], 10));
    }
    if (tgt === nodeId && epTgt) {
      const match = ETH_NUMBER_REGEX.exec(epTgt);
      if (match) usedIndices.add(parseInt(match[1], 10));
    }
  });

  return usedIndices;
}

/**
 * Get the next available endpoint for a node
 */
function getNextEndpoint(cy: CyCore, nodeId: string): string {
  const pattern = DEFAULT_INTERFACE_PATTERN;
  const parsed = parseInterfacePattern(pattern);
  const usedIndices = collectUsedIndices(cy, nodeId);

  // Find next available index
  let nextIndex = 0;
  while (usedIndices.has(nextIndex)) {
    nextIndex++;
  }

  return generateInterfaceName(parsed, nextIndex);
}

/**
 * Check if edge connection is valid
 */
function canConnect(sourceNode: NodeSingular, targetNode: NodeSingular): boolean {
  const sourceRole = sourceNode.data('topoViewerRole');
  const targetRole = targetNode.data('topoViewerRole');
  const invalidRoles = ['freeText', 'group'];

  return (
    !invalidRoles.includes(sourceRole) &&
    !invalidRoles.includes(targetRole) &&
    !sourceNode.same(targetNode) &&
    !sourceNode.isParent() &&
    !targetNode.isParent()
  );
}

/**
 * Create edge data for a new edge
 */
function createEdgeParams(cy: CyCore, sourceNode: NodeSingular, targetNode: NodeSingular): EdgeData {
  const sourceEndpoint = getNextEndpoint(cy, sourceNode.id());
  const targetEndpoint = getNextEndpoint(cy, targetNode.id());

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
function getEdgehandlesOptions(cy: CyCore) {
  return {
    hoverDelay: 50,
    snap: false,
    snapThreshold: 10,
    snapFrequency: 150,
    noEdgeEventsInDraw: false,
    disableBrowserGestures: false,
    handleNodes: 'node[topoViewerRole != "freeText"][topoViewerRole != "group"]',
    canConnect,
    edgeParams: (sourceNode: NodeSingular, targetNode: NodeSingular) =>
      createEdgeParams(cy, sourceNode, targetNode)
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
  onEdgeCreated?: (sourceId: string, targetId: string, edgeData: EdgeData) => void
): void {
  log.info(`[EdgeCreation] Edge created: ${sourceNode.id()} -> ${targetNode.id()}`);

  if (!onEdgeCreated) return;

  // Calculate endpoints directly (edgeParams doesn't reliably set data on the edge)
  const srcEndpoint = getNextEndpoint(cy, sourceNode.id());
  const tgtEndpoint = getNextEndpoint(cy, targetNode.id());

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
  onEdgeCreatedRef: { current: EdgeCreationOptions['onEdgeCreated'] }
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
      processEdgeCreation(cy, sourceNode, targetNode, addedEdge, onEdgeCreatedRef.current);
      setTimeout(() => {
        isCreatingEdgeRef.current = false;
        cy.scratch(EDGE_CREATION_SCRATCH_KEY, false);
        log.debug('[EdgeCreation] Edge creation flag cleared');
      }, 200);
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

  // Initialize edgehandles
  useEffect(() => {
    if (!cyInstance || options.mode !== 'edit') return;

    ensureEdgehandlesRegistered();

    const cyAny = cyInstance as unknown as { edgehandles: (opts: unknown) => EdgehandlesInstance };
    const eh = cyAny.edgehandles(getEdgehandlesOptions(cyInstance));
    ehRef.current = eh;
    eh.enable();

    const handlers = createLifecycleHandlers(cyInstance, isCreatingEdgeRef, onEdgeCreatedRef);
    cyInstance.on('ehstart', handlers.handleStart);
    cyInstance.on('ehstop ehcancel', handlers.handleStopCancel);
    cyInstance.on('ehcomplete', handlers.handleComplete as unknown as cytoscape.EventHandler);

    log.info('[EdgeCreation] Edgehandles initialized');

    return () => {
      cyInstance.off('ehstart', handlers.handleStart);
      cyInstance.off('ehstop ehcancel', handlers.handleStopCancel);
      cyInstance.off('ehcomplete', handlers.handleComplete as unknown as cytoscape.EventHandler);
      if (ehRef.current) {
        ehRef.current.destroy();
        ehRef.current = null;
      }
    };
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
