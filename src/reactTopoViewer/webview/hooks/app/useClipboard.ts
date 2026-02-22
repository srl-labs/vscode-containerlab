/**
 * React Flow Clipboard Hook
 *
 * Provides copy/paste functionality using the browser's clipboard API
 * and React Flow's node/edge state via the graph store.
 */
import { useCallback, useRef } from "react";
import type { ReactFlowInstance, Node, Edge } from "@xyflow/react";

import { useGraphActions, useGraphStore } from "../../stores/graphStore";
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
  TRAFFIC_RATE_NODE_TYPE,
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

type PasteEdgeData = {
  id: string;
  source: string;
  target: string;
  sourceEndpoint: string;
  targetEndpoint: string;
};

type PasteNodeCreatedHandler = (
  nodeId: string,
  nodeElement: TopoNode,
  position: { x: number; y: number }
) => void;

type PasteEdgeCreatedHandler = (
  sourceId: string,
  targetId: string,
  edgeData: PasteEdgeData
) => void;

type PasteCallbacks = {
  onNodeCreated?: PasteNodeCreatedHandler;
  onEdgeCreated?: PasteEdgeCreatedHandler;
  addNodeToGroup?: (nodeId: string, groupId: string) => void;
};

type PasteTimeRef = { current: number };

/** Clipboard data structure */
interface ClipboardData {
  version: string;
  origin: { x: number; y: number };
  nodes: SerializedNode[];
  edges: SerializedEdge[];
  timestamp: number;
}

/** Options for useClipboard hook */
export interface UseClipboardOptions extends PasteCallbacks {
  /** React Flow instance for viewport calculations */
  rfInstance?: ReactFlowInstance | null;
  /** Get node's group membership (for topology nodes whose groupId is not in node.data) */
  getNodeMembership?: (nodeId: string) => string | null;
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
  FREE_SHAPE_NODE_TYPE,
  TRAFFIC_RATE_NODE_TYPE
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readNonEmptyString(value: unknown): string | undefined {
  const next = readString(value);
  if (next == null || next.length === 0) return undefined;
  return next;
}

function readPosition(value: unknown): { x: number; y: number } | null {
  if (!isRecord(value)) return null;
  const { x, y } = value;
  if (typeof x !== "number" || typeof y !== "number") return null;
  return { x, y };
}

function isSerializedNode(value: unknown): value is SerializedNode {
  if (!isRecord(value)) return false;
  if (typeof value.id !== "string") return false;
  if (!isRecord(value.data)) return false;
  if (readPosition(value.position) == null) return false;
  if (readPosition(value.relativePosition) == null) return false;
  return true;
}

function isSerializedEdge(value: unknown): value is SerializedEdge {
  if (!isRecord(value)) return false;
  if (typeof value.id !== "string") return false;
  if (typeof value.source !== "string") return false;
  if (typeof value.target !== "string") return false;
  return isRecord(value.data);
}

function isClipboardData(value: unknown): value is ClipboardData {
  if (!isRecord(value)) return false;
  if (typeof value.version !== "string") return false;
  if (readPosition(value.origin) == null) return false;
  if (!Array.isArray(value.nodes) || !value.nodes.every(isSerializedNode)) return false;
  if (!Array.isArray(value.edges) || !value.edges.every(isSerializedEdge)) return false;
  if (typeof value.timestamp !== "number") return false;
  return true;
}

function resolveNodeType(type: string | undefined): TopoNode["type"] {
  switch (type) {
    case "network-node":
    case GROUP_NODE_TYPE:
    case FREE_TEXT_NODE_TYPE:
    case FREE_SHAPE_NODE_TYPE:
    case TRAFFIC_RATE_NODE_TYPE:
      return type;
    default:
      return "topology-node";
  }
}

// ============================================================================
// Paste helper functions (extracted for complexity reduction)
// ============================================================================

/** Read and validate clipboard data */
async function readClipboardData(): Promise<ClipboardData | null> {
  try {
    const text = await window.navigator.clipboard.readText();
    const clipboardData: unknown = JSON.parse(text);

    if (!isClipboardData(clipboardData)) {
      log.warn("[Clipboard] Invalid clipboard data format");
      return null;
    }
    return clipboardData;
  } catch (err) {
    log.warn(`[Clipboard] Failed to read clipboard: ${String(err)}`);
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

  const splitNumericSuffix = (value: string): { prefix: string; number: number } | null => {
    let idx = value.length - 1;
    while (idx >= 0) {
      const code = value.charCodeAt(idx);
      if (code < 48 || code > 57) break;
      idx -= 1;
    }
    if (idx === value.length - 1) return null;
    const prefix = value.slice(0, idx + 1);
    if (!prefix) return null;
    const num = Number.parseInt(value.slice(idx + 1), 10);
    if (!Number.isFinite(num)) return null;
    return { prefix, number: num };
  };

  const isDigits = (value: string): boolean => {
    if (!value) return false;
    for (let i = 0; i < value.length; i++) {
      const code = value.charCodeAt(i);
      if (code < 48 || code > 57) return false;
    }
    return true;
  };

  const generateSequentialId = (baseName: string): string | null => {
    const suffixInfo = splitNumericSuffix(baseName);
    if (!suffixInfo) return null;
    const { prefix, number: baseNum } = suffixInfo;

    let maxNum = baseNum;
    for (const id of usedNames) {
      if (!id.startsWith(prefix)) continue;
      const suffix = id.slice(prefix.length);
      if (!isDigits(suffix)) continue;
      const num = parseInt(suffix, 10);
      if (num > maxNum) maxNum = num;
    }

    const candidate = `${prefix}${maxNum + 1}`;
    return usedNames.has(candidate) ? null : candidate;
  };

  for (const node of clipboardNodes) {
    const isAnnotation = ANNOTATION_TYPES.has(node.type ?? "");
    const nodeName = readNonEmptyString(node.data.name);
    const idBase = isAnnotation ? node.id : (nodeName ?? node.id);
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
  const role = readNonEmptyString(node.data.role) ?? "node";
  const pastedNode: TopoNode = {
    id: newId,
    type: "topology-node",
    position: newPosition,
    ...(node.width !== undefined && { width: node.width }),
    ...(node.height !== undefined && { height: node.height }),
    ...(node.zIndex !== undefined && { zIndex: node.zIndex }),
    data: {
      ...node.data,
      id: newId,
      name: newId,
      label: newId,
      role,
      groupId: newGroupId
    } as TopologyNodeData
  };
  Reflect.set(pastedNode, "type", resolveNodeType(node.type));
  return pastedNode;
}

function mapYamlNodeId(value: unknown, idMapping: Map<string, string>): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  return idMapping.get(value);
}

function remapEdgeExtraData(
  data: Record<string, unknown>,
  idMapping: Map<string, string>
): Record<string, unknown> {
  const extra = isRecord(data.extraData) ? data.extraData : undefined;
  if (!extra) return data;

  const cleaned = { ...extra };
  const yamlSource = mapYamlNodeId(cleaned.yamlSourceNodeId, idMapping);
  const yamlTarget = mapYamlNodeId(cleaned.yamlTargetNodeId, idMapping);

  if (yamlSource != null && yamlSource.length > 0) {
    cleaned.yamlSourceNodeId = yamlSource;
  } else {
    delete cleaned.yamlSourceNodeId;
  }

  if (yamlTarget != null && yamlTarget.length > 0) {
    cleaned.yamlTargetNodeId = yamlTarget;
  } else {
    delete cleaned.yamlTargetNodeId;
  }

  const next = { ...data };
  if (Object.keys(cleaned).length === 0) {
    delete next.extraData;
  } else {
    next.extraData = cleaned;
  }

  return next;
}

/** Create a single pasted edge */
function createPastedEdge(
  edge: SerializedEdge,
  newSource: string,
  newTarget: string,
  idMapping: Map<string, string>
): TopoEdge {
  const sourceEndpoint = readNonEmptyString(edge.data.sourceEndpoint) ?? "eth1";
  const targetEndpoint = readNonEmptyString(edge.data.targetEndpoint) ?? "eth1";
  const newId = `${newSource}:${sourceEndpoint}--${newTarget}:${targetEndpoint}`;
  const data = remapEdgeExtraData({ ...edge.data }, idMapping);

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
interface PasteContext extends PasteCallbacks {
  idMapping: Map<string, string>;
  pastePosition: { x: number; y: number };
  offset: number;
  pastedNodes: TopoNode[];
  pastedEdges: TopoEdge[];
  pastedNodeIds: string[];
  pastedEdgeIds: string[];
  addNode: (node: TopoNode) => void;
  addEdge: (edge: TopoEdge) => void;
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

    const originalGroupId = readNonEmptyString(node.data.groupId);
    const newGroupId =
      originalGroupId != null && originalGroupId.length > 0
        ? ctx.idMapping.get(originalGroupId)
        : undefined;
    const newNode = createPastedNode(node, newId, newPosition, newGroupId);
    ctx.pastedNodes.push(newNode);

    if (ctx.onNodeCreated) {
      ctx.onNodeCreated(newId, newNode, newPosition);
    } else {
      ctx.addNode(newNode);
    }

    // Update membership for topology nodes (not annotations)
    const isAnnotation = ANNOTATION_TYPES.has(node.type ?? "");
    if (newGroupId != null && newGroupId.length > 0 && !isAnnotation && ctx.addNodeToGroup) {
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
    if (
      newSource == null ||
      newSource.length === 0 ||
      newTarget == null ||
      newTarget.length === 0
    ) {
      continue;
    }

    const newEdge = createPastedEdge(edge, newSource, newTarget, ctx.idMapping);
    ctx.pastedEdgeIds.push(newEdge.id);
    ctx.pastedEdges.push(newEdge);

    if (ctx.onEdgeCreated) {
      const sourceEndpoint = readNonEmptyString(newEdge.data?.sourceEndpoint) ?? "eth1";
      const targetEndpoint = readNonEmptyString(newEdge.data?.targetEndpoint) ?? "eth1";
      ctx.onEdgeCreated(newSource, newTarget, {
        id: newEdge.id,
        source: newSource,
        target: newTarget,
        sourceEndpoint,
        targetEndpoint
      });
    } else {
      ctx.addEdge(newEdge);
    }
    edgeCount++;
  }
  return edgeCount;
}

function shouldThrottlePaste(now: number, lastPasteTimeRef: PasteTimeRef): boolean {
  if (now - lastPasteTimeRef.current < 100) return true;
  lastPasteTimeRef.current = now;
  return false;
}

interface PasteContextParams extends PasteCallbacks {
  pastePosition: { x: number; y: number };
  offset: number;
  addNode: (node: TopoNode) => void;
  addEdge: (edge: TopoEdge) => void;
  existingNodeIds: Set<string>;
}

function createPasteContext(
  clipboardData: ClipboardData,
  params: PasteContextParams
): PasteContext {
  return {
    idMapping: buildIdMapping(clipboardData.nodes, params.existingNodeIds),
    pastePosition: params.pastePosition,
    offset: params.offset,
    pastedNodes: [],
    pastedEdges: [],
    pastedNodeIds: [],
    pastedEdgeIds: [],
    addNode: params.addNode,
    addEdge: params.addEdge,
    onNodeCreated: params.onNodeCreated,
    onEdgeCreated: params.onEdgeCreated,
    addNodeToGroup: params.addNodeToGroup
  };
}

function finalizePaste(
  ctx: PasteContext,
  options: {
    rfInstance?: ReactFlowInstance | null;
    onPasteComplete?: (result: { nodes: TopoNode[]; edges: TopoEdge[] }) => void;
  }
): void {
  if (options.onPasteComplete) {
    options.onPasteComplete({ nodes: ctx.pastedNodes, edges: ctx.pastedEdges });
  }

  setTimeout(() => {
    if (options.rfInstance) {
      selectPastedElements(options.rfInstance, ctx.pastedNodeIds, ctx.pastedEdgeIds);
    }
  }, 50);
}

interface PerformPasteParams extends PasteCallbacks {
  position?: { x: number; y: number };
  rfInstance?: ReactFlowInstance | null;
  getNodes: () => Array<{ id: string }>;
  addNode: (node: TopoNode) => void;
  addEdge: (edge: TopoEdge) => void;
  onPasteComplete?: (result: { nodes: TopoNode[]; edges: TopoEdge[] }) => void;
}

async function performPaste(params: PerformPasteParams): Promise<boolean> {
  const clipboardData = await readClipboardData();
  if (!clipboardData || clipboardData.nodes.length === 0) {
    if (clipboardData?.nodes.length === 0) log.info("[Clipboard] No nodes to paste");
    return false;
  }

  const pastePosition = calculatePastePosition(params.position, params.rfInstance ?? null);
  pasteCounter++;

  const currentNodes = params.rfInstance?.getNodes() ?? params.getNodes();
  const existingNodeIds = new Set<string>(currentNodes.map((n: { id: string }) => n.id));

  const ctx = createPasteContext(clipboardData, {
    pastePosition,
    offset: pasteCounter * 20,
    addNode: params.addNode,
    addEdge: params.addEdge,
    onNodeCreated: params.onPasteComplete ? undefined : params.onNodeCreated,
    onEdgeCreated: params.onPasteComplete ? undefined : params.onEdgeCreated,
    addNodeToGroup: params.addNodeToGroup,
    existingNodeIds
  });

  pasteNodes(clipboardData.nodes, ctx);
  const edgeCount = pasteEdges(clipboardData.edges, ctx);
  log.info(`[Clipboard] Pasted ${clipboardData.nodes.length} nodes, ${edgeCount} edges`);

  finalizePaste(ctx, { rfInstance: params.rfInstance, onPasteComplete: params.onPasteComplete });

  return true;
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
  const { addNode, addEdge } = useGraphActions();
  const lastPasteTimeRef = useRef(0);
  const getCurrentNodes = useCallback(() => useGraphStore.getState().nodes, []);

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
      (n: { selected?: boolean; type?: string }) => n.selected === true && n.type !== "group"
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
        const nodeData = isRecord(node.data) ? node.data : {};
        // For topology nodes, groupId is stored in membershipMap, not in node.data
        // Look it up if available and not already present in data
        let groupId = readNonEmptyString(nodeData.groupId);
        if (groupId == null && getNodeMembership) {
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
        data: { ...(isRecord(edge.data) ? edge.data : {}) }
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
      if (shouldThrottlePaste(Date.now(), lastPasteTimeRef)) return false;
      return performPaste({
        position,
        rfInstance,
        getNodes: getCurrentNodes,
        addNode,
        addEdge,
        onNodeCreated,
        onEdgeCreated,
        addNodeToGroup,
        onPasteComplete
      });
    },
    [
      rfInstance,
      getCurrentNodes,
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
      const data: unknown = JSON.parse(text);
      return isClipboardData(data);
    } catch {
      return false;
    }
  }, []);

  return { copy, paste, hasClipboardData };
}
