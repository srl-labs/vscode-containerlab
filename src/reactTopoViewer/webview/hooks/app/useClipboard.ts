/**
 * React Flow Clipboard Hook
 *
 * Provides copy/paste functionality using the browser's clipboard API
 * and React Flow's node/edge state via the graph store.
 */
import { useCallback, useRef } from "react";
import type { ReactFlowInstance, Node, Edge } from "@xyflow/react";

import { useGraphActions, useGraphState } from "../../stores/graphStore";
import { log } from "../../utils/logger";
import { getUniqueId } from "../../../shared/utilities/idUtils";
import { isSpecialEndpointId } from "../../../shared/utilities/LinkTypes";
import type {
  TopoNode,
  TopoEdge,
  TopologyNodeData,
  TopologyEdgeData
} from "../../../shared/types/graph";
import {
  FREE_TEXT_NODE_TYPE,
  FREE_SHAPE_NODE_TYPE,
  GROUP_NODE_TYPE
} from "../../annotations/annotationNodeConverters";

/** Version string for clipboard format compatibility */
const CLIPBOARD_VERSION = "1.0";

/** Serialized node data for clipboard */
interface SerializedNode {
  id: string;
  data: Record<string, unknown>;
  position: { x: number; y: number };
  relativePosition: { x: number; y: number };
  type?: string;
  /** Top-level width (for annotation nodes like groups) */
  width?: number;
  /** Top-level height (for annotation nodes like groups) */
  height?: number;
  /** zIndex for proper layering */
  zIndex?: number;
}

/** Serialized edge data for clipboard */
interface SerializedEdge {
  id: string;
  source: string;
  target: string;
  data: Record<string, unknown>;
}

/** Clipboard data structure */
interface ClipboardData {
  version: string;
  origin: { x: number; y: number };
  nodes: SerializedNode[];
  edges: SerializedEdge[];
  timestamp: number;
}

/** Options for useClipboard hook */
export interface UseClipboardOptions {
  /** React Flow instance for viewport calculations */
  rfInstance?: ReactFlowInstance | null;
  /** Custom node creation callback (includes YAML persistence) */
  onNodeCreated?: (
    nodeId: string,
    nodeElement: TopoNode,
    position: { x: number; y: number }
  ) => void;
  /** Custom edge creation callback (includes YAML persistence) */
  onEdgeCreated?: (
    sourceId: string,
    targetId: string,
    edgeData: {
      id: string;
      source: string;
      target: string;
      sourceEndpoint: string;
      targetEndpoint: string;
    }
  ) => void;
  /** Get node's group membership (for topology nodes whose groupId is not in node.data) */
  getNodeMembership?: (nodeId: string) => string | null;
  /** Add node to group (updates in-memory membership map) */
  addNodeToGroup?: (nodeId: string, groupId: string) => void;
  /** Optional callback for batch persistence after paste */
  onPasteComplete?: (result: { nodes: TopoNode[]; edges: TopoEdge[] }) => void;
}

/** Return type for useClipboard hook */
export interface UseClipboardReturn {
  /** Copy selected nodes and edges to clipboard */
  copy: () => Promise<boolean>;
  /** Paste clipboard contents at position */
  paste: (position?: { x: number; y: number }) => Promise<boolean>;
  /** Check if browser clipboard has compatible data */
  hasClipboardData: () => Promise<boolean>;
}

/** Calculate center of positions */
function calculateCenter(positions: Array<{ x: number; y: number }>): { x: number; y: number } {
  if (positions.length === 0) return { x: 0, y: 0 };
  const sum = positions.reduce((acc, pos) => ({ x: acc.x + pos.x, y: acc.y + pos.y }), {
    x: 0,
    y: 0
  });
  return {
    x: sum.x / positions.length,
    y: sum.y / positions.length
  };
}

/** Counter for generating unique IDs */
let pasteCounter = 0;

/** Annotation node types that should use original ID as base (not name) */
const ANNOTATION_TYPES = new Set<string>([
  GROUP_NODE_TYPE,
  FREE_TEXT_NODE_TYPE,
  FREE_SHAPE_NODE_TYPE
]);

// ============================================================================
// Paste helper functions (extracted for complexity reduction)
// ============================================================================

/** Read and validate clipboard data */
async function readClipboardData(): Promise<ClipboardData | null> {
  try {
    const text = await window.navigator.clipboard.readText();
    const clipboardData = JSON.parse(text) as ClipboardData;

    if (!clipboardData.version || !clipboardData.nodes) {
      log.warn("[Clipboard] Invalid clipboard data format");
      return null;
    }
    return clipboardData;
  } catch (err) {
    log.warn(`[Clipboard] Failed to read clipboard: ${err}`);
    return null;
  }
}

/** Calculate paste position from viewport center or provided position */
function calculatePastePosition(
  position: { x: number; y: number } | undefined,
  rfInstance: { getViewport: () => { x: number; y: number; zoom: number } } | null
): { x: number; y: number } {
  if (position) return position;
  if (!rfInstance) return { x: 0, y: 0 };

  const viewport = rfInstance.getViewport();
  const container = document.querySelector(".react-flow");
  if (!container) return { x: 0, y: 0 };

  const rect = container.getBoundingClientRect();
  return {
    x: (rect.width / 2 - viewport.x) / viewport.zoom,
    y: (rect.height / 2 - viewport.y) / viewport.zoom
  };
}

/** Build mapping from old IDs to new unique IDs */
function buildIdMapping(
  clipboardNodes: SerializedNode[],
  existingNodeIds: Set<string>
): Map<string, string> {
  const idMapping = new Map<string, string>();
  const usedNames = new Set<string>(existingNodeIds);

  log.info(
    `[Clipboard] Building unique IDs from ${usedNames.size} existing nodes: ${Array.from(usedNames).join(", ")}`
  );

  const generateSequentialId = (baseName: string): string | null => {
    const match = /^(.*?)(\d+)$/.exec(baseName);
    if (!match) return null;
    const prefix = match[1];
    const baseNum = parseInt(match[2], 10);
    if (!prefix || Number.isNaN(baseNum)) return null;

    let maxNum = baseNum;
    for (const id of usedNames) {
      if (!id.startsWith(prefix)) continue;
      const suffix = id.slice(prefix.length);
      if (!/^\d+$/.test(suffix)) continue;
      const num = parseInt(suffix, 10);
      if (num > maxNum) maxNum = num;
    }

    const candidate = `${prefix}${maxNum + 1}`;
    return usedNames.has(candidate) ? null : candidate;
  };

  for (const node of clipboardNodes) {
    const isAnnotation = ANNOTATION_TYPES.has(node.type ?? "");
    const idBase = isAnnotation ? node.id : (node.data.name as string) || node.id;
    log.info(
      `[Clipboard] Generating ID for idBase="${idBase}", node.id="${node.id}", isAnnotation=${String(isAnnotation)}`
    );
    const shouldSequence = !isAnnotation && !isSpecialEndpointId(idBase);
    const sequentialId = shouldSequence ? generateSequentialId(idBase) : null;
    const newId = sequentialId ?? getUniqueId(idBase, usedNames);
    log.info(`[Clipboard] Generated unique ID: ${idBase} -> ${newId}`);
    usedNames.add(newId);
    idMapping.set(node.id, newId);
  }

  return idMapping;
}

/** Create a single pasted node */
function createPastedNode(
  node: SerializedNode,
  newId: string,
  newPosition: { x: number; y: number },
  newGroupId: string | undefined
): TopoNode {
  return {
    id: newId,
    type: (node.type ?? "topology-node") as "topology-node",
    position: newPosition,
    ...(node.width !== undefined && { width: node.width }),
    ...(node.height !== undefined && { height: node.height }),
    ...(node.zIndex !== undefined && { zIndex: node.zIndex }),
    data: {
      ...node.data,
      id: newId,
      name: newId,
      label: newId,
      role: (node.data.role as string) || "node",
      groupId: newGroupId
    } as TopologyNodeData
  };
}

/** Create a single pasted edge */
function createPastedEdge(
  edge: SerializedEdge,
  newSource: string,
  newTarget: string,
  idMapping: Map<string, string>
): TopoEdge {
  const sourceEndpoint = (edge.data.sourceEndpoint as string) || "eth1";
  const targetEndpoint = (edge.data.targetEndpoint as string) || "eth1";
  const newId = `${newSource}:${sourceEndpoint}--${newTarget}:${targetEndpoint}`;
  const data = { ...edge.data } as Record<string, unknown>;
  const extra = data.extraData as Record<string, unknown> | undefined;
  if (extra && typeof extra === "object") {
    const cleaned = { ...extra };
    const yamlSource = typeof cleaned.yamlSourceNodeId === "string" ? cleaned.yamlSourceNodeId : "";
    const yamlTarget = typeof cleaned.yamlTargetNodeId === "string" ? cleaned.yamlTargetNodeId : "";
    if (yamlSource) {
      const mapped = idMapping.get(yamlSource);
      if (mapped) {
        cleaned.yamlSourceNodeId = mapped;
      } else {
        delete cleaned.yamlSourceNodeId;
      }
    }
    if (yamlTarget) {
      const mapped = idMapping.get(yamlTarget);
      if (mapped) {
        cleaned.yamlTargetNodeId = mapped;
      } else {
        delete cleaned.yamlTargetNodeId;
      }
    }
    if (Object.keys(cleaned).length === 0) {
      delete data.extraData;
    } else {
      data.extraData = cleaned;
    }
  }

  return {
    id: newId,
    source: newSource,
    target: newTarget,
    type: "topology-edge",
    data: {
      ...data,
      sourceEndpoint,
      targetEndpoint
    } as TopologyEdgeData
  };
}

/** Select pasted elements and deselect others */
function selectPastedElements(
  rfInstance: ReactFlowInstance<Node, Edge>,
  pastedNodeIds: string[],
  pastedEdgeIds: string[]
): void {
  const pastedNodeSet = new Set(pastedNodeIds);
  const pastedEdgeSet = new Set(pastedEdgeIds);

  rfInstance.setNodes((nodes) =>
    nodes.map((n) => ({
      ...n,
      selected: pastedNodeSet.has(n.id)
    }))
  );

  rfInstance.setEdges((edges) =>
    edges.map((e) => ({
      ...e,
      selected: pastedEdgeSet.has(e.id)
    }))
  );

  log.info(
    `[Clipboard] Selected ${pastedNodeIds.length} nodes, ${pastedEdgeIds.length} edges after paste`
  );
}

/** Paste context passed to paste helper functions */
interface PasteContext {
  idMapping: Map<string, string>;
  pastePosition: { x: number; y: number };
  offset: number;
  pastedNodes: TopoNode[];
  pastedEdges: TopoEdge[];
  pastedNodeIds: string[];
  pastedEdgeIds: string[];
  addNode: (node: TopoNode) => void;
  addEdge: (edge: TopoEdge) => void;
  onNodeCreated?: (
    nodeId: string,
    nodeElement: TopoNode,
    position: { x: number; y: number }
  ) => void;
  onEdgeCreated?: (
    sourceId: string,
    targetId: string,
    edgeData: {
      id: string;
      source: string;
      target: string;
      sourceEndpoint: string;
      targetEndpoint: string;
    }
  ) => void;
  addNodeToGroup?: (nodeId: string, groupId: string) => void;
}

/** Paste all nodes from clipboard */
function pasteNodes(clipboardNodes: SerializedNode[], ctx: PasteContext): void {
  for (const node of clipboardNodes) {
    const newId = ctx.idMapping.get(node.id)!;
    ctx.pastedNodeIds.push(newId);
    const newPosition = {
      x: ctx.pastePosition.x + node.relativePosition.x + ctx.offset,
      y: ctx.pastePosition.y + node.relativePosition.y + ctx.offset
    };

    const originalGroupId = node.data.groupId as string | undefined;
    const newGroupId = originalGroupId ? ctx.idMapping.get(originalGroupId) : undefined;
    const newNode = createPastedNode(node, newId, newPosition, newGroupId);
    ctx.pastedNodes.push(newNode);

    if (ctx.onNodeCreated) {
      ctx.onNodeCreated(newId, newNode, newPosition);
    } else {
      ctx.addNode(newNode);
    }

    // Update membership for topology nodes (not annotations)
    const isAnnotation = ANNOTATION_TYPES.has(node.type ?? "");
    if (newGroupId && !isAnnotation && ctx.addNodeToGroup) {
      ctx.addNodeToGroup(newId, newGroupId);
    }
  }
}

/** Paste all edges from clipboard */
function pasteEdges(clipboardEdges: SerializedEdge[], ctx: PasteContext): number {
  let edgeCount = 0;
  for (const edge of clipboardEdges) {
    const newSource = ctx.idMapping.get(edge.source);
    const newTarget = ctx.idMapping.get(edge.target);
    if (!newSource || !newTarget) continue;

    const newEdge = createPastedEdge(edge, newSource, newTarget, ctx.idMapping);
    ctx.pastedEdgeIds.push(newEdge.id);
    ctx.pastedEdges.push(newEdge);

    if (ctx.onEdgeCreated) {
      const edgeData = newEdge.data as { sourceEndpoint: string; targetEndpoint: string };
      ctx.onEdgeCreated(newSource, newTarget, {
        id: newEdge.id,
        source: newSource,
        target: newTarget,
        sourceEndpoint: edgeData.sourceEndpoint,
        targetEndpoint: edgeData.targetEndpoint
      });
    } else {
      ctx.addEdge(newEdge);
    }
    edgeCount++;
  }
  return edgeCount;
}

// ============================================================================
// Main hook
// ============================================================================

/**
 * Hook that provides clipboard operations for nodes and edges.
 * Uses the browser's clipboard API for persistence.
 *
 * @param options - Optional callbacks for node/edge creation that include persistence
 */
export function useClipboard(options: UseClipboardOptions = {}): UseClipboardReturn {
  const {
    onNodeCreated,
    onEdgeCreated,
    getNodeMembership,
    addNodeToGroup,
    rfInstance,
    onPasteComplete
  } = options;
  const { nodes } = useGraphState();
  const { addNode, addEdge } = useGraphActions();
  const lastPasteTimeRef = useRef(0);

  /**
   * Copy selected nodes and connected edges to the browser clipboard.
   */
  const copy = useCallback(async (): Promise<boolean> => {
    if (!rfInstance) {
      log.warn("[Clipboard] ReactFlow instance not available");
      return false;
    }

    const instance = rfInstance;
    const allNodes = instance.getNodes();
    // Filter selected nodes, excluding group nodes (they are annotation overlays, not topology elements)
    const selectedNodes = allNodes.filter(
      (n: { selected?: boolean; type?: string }) => n.selected && n.type !== "group"
    );

    if (selectedNodes.length === 0) {
      log.info("[Clipboard] No nodes selected to copy");
      return false;
    }

    log.info(
      `[Clipboard] Selected ${selectedNodes.length} nodes for copy: ${selectedNodes.map((n: { id: string }) => n.id).join(", ")}`
    );

    const selectedNodeIds = new Set(selectedNodes.map((n: { id: string }) => n.id));

    const allEdges = instance.getEdges();
    const selectedEdges = allEdges.filter(
      (e: { source: string; target: string }) =>
        selectedNodeIds.has(e.source) && selectedNodeIds.has(e.target)
    );

    const positions = selectedNodes.map((n: { position: { x: number; y: number } }) => n.position);
    const origin = calculateCenter(positions);

    const serializedNodes: SerializedNode[] = selectedNodes.map(
      (node: {
        id: string;
        data: unknown;
        position: { x: number; y: number };
        type?: string;
        width?: number;
        height?: number;
        zIndex?: number;
      }) => {
        const nodeData = node.data as Record<string, unknown>;
        // For topology nodes, groupId is stored in membershipMap, not in node.data
        // Look it up if available and not already present in data
        let groupId = nodeData.groupId as string | undefined;
        if (!groupId && getNodeMembership) {
          groupId = getNodeMembership(node.id) ?? undefined;
        }
        return {
          id: node.id,
          data: { ...nodeData, groupId },
          position: { ...node.position },
          relativePosition: {
            x: node.position.x - origin.x,
            y: node.position.y - origin.y
          },
          type: node.type,
          // Preserve top-level dimensions for annotation nodes (groups, shapes, text)
          width: node.width,
          height: node.height,
          zIndex: node.zIndex
        };
      }
    );

    const serializedEdges: SerializedEdge[] = selectedEdges.map(
      (edge: { id: string; source: string; target: string; data?: unknown }) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        data: { ...((edge.data as Record<string, unknown>) ?? {}) }
      })
    );

    const clipboardData: ClipboardData = {
      version: CLIPBOARD_VERSION,
      origin,
      nodes: serializedNodes,
      edges: serializedEdges,
      timestamp: Date.now()
    };

    try {
      await window.navigator.clipboard.writeText(JSON.stringify(clipboardData));
      log.info(
        `[Clipboard] Copied ${serializedNodes.length} nodes, ${serializedEdges.length} edges`
      );
      return true;
    } catch (err) {
      log.error(`[Clipboard] Failed to write to clipboard: ${String(err)}`);
      return false;
    }
  }, [rfInstance, getNodeMembership]);

  /**
   * Paste clipboard contents at the given position (or viewport center).
   */
  const paste = useCallback(
    async (position?: { x: number; y: number }): Promise<boolean> => {
      const now = Date.now();
      if (now - lastPasteTimeRef.current < 100) return false;
      lastPasteTimeRef.current = now;

      const clipboardData = await readClipboardData();
      if (!clipboardData || clipboardData.nodes.length === 0) {
        if (clipboardData?.nodes.length === 0) log.info("[Clipboard] No nodes to paste");
        return false;
      }

      const pastePosition = calculatePastePosition(position, rfInstance ?? null);
      pasteCounter++;

      // Get fresh nodes from React Flow instance to ensure we have the latest state
      const currentNodes = rfInstance?.getNodes() ?? nodes;
      const existingNodeIds = new Set<string>(currentNodes.map((n: { id: string }) => n.id));

      const ctx: PasteContext = {
        idMapping: buildIdMapping(clipboardData.nodes, existingNodeIds),
        pastePosition,
        offset: pasteCounter * 20,
        pastedNodes: [],
        pastedEdges: [],
        pastedNodeIds: [],
        pastedEdgeIds: [],
        addNode,
        addEdge,
        onNodeCreated: onPasteComplete ? undefined : onNodeCreated,
        onEdgeCreated: onPasteComplete ? undefined : onEdgeCreated,
        addNodeToGroup
      };

      pasteNodes(clipboardData.nodes, ctx);
      const edgeCount = pasteEdges(clipboardData.edges, ctx);
      log.info(`[Clipboard] Pasted ${clipboardData.nodes.length} nodes, ${edgeCount} edges`);

      if (onPasteComplete) {
        onPasteComplete({ nodes: ctx.pastedNodes, edges: ctx.pastedEdges });
      }

      // Select pasted elements after they're added to React Flow
      setTimeout(() => {
        if (rfInstance) {
          selectPastedElements(rfInstance, ctx.pastedNodeIds, ctx.pastedEdgeIds);
        }
      }, 50);

      return true;
    },
    [
      rfInstance,
      nodes,
      addNode,
      addEdge,
      onNodeCreated,
      onEdgeCreated,
      addNodeToGroup,
      onPasteComplete
    ]
  );

  /**
   * Check if the browser clipboard has compatible data.
   */
  const hasClipboardData = useCallback(async (): Promise<boolean> => {
    try {
      const text = await window.navigator.clipboard.readText();
      const data = JSON.parse(text) as ClipboardData;
      return Boolean(data.version && data.nodes);
    } catch {
      return false;
    }
  }, []);

  return { copy, paste, hasClipboardData };
}
