/**
 * React Flow Clipboard Hook
 *
 * Provides copy/paste functionality using the browser's clipboard API
 * and React Flow's node/edge state via GraphContext.
 */
import { useCallback, useRef } from "react";

import { useGraph } from "../../context/GraphContext";
import { useViewport } from "../../context/ViewportContext";
import { useUndoRedoContext } from "../../context/UndoRedoContext";
import { log } from "../../utils/logger";
import { getUniqueId } from "../../../shared/utilities/idUtils";
import type {
  TopoNode,
  TopoEdge,
  TopologyNodeData,
  TopologyEdgeData
} from "../../../shared/types/graph";

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

/**
 * Hook that provides clipboard operations for nodes and edges.
 * Uses the browser's clipboard API for persistence.
 *
 * @param options - Optional callbacks for node/edge creation that include persistence
 */
export function useClipboard(options: UseClipboardOptions = {}): UseClipboardReturn {
  const { onNodeCreated, onEdgeCreated, getNodeMembership, addNodeToGroup } = options;
  const { nodes, addNode, addEdge } = useGraph();
  const { rfInstance } = useViewport();
  const { undoRedo } = useUndoRedoContext();

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
      await navigator.clipboard.writeText(JSON.stringify(clipboardData));
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

      let clipboardData: ClipboardData;

      try {
        const text = await navigator.clipboard.readText();
        clipboardData = JSON.parse(text) as ClipboardData;

        if (!clipboardData.version || !clipboardData.nodes) {
          log.warn("[Clipboard] Invalid clipboard data format");
          return false;
        }
      } catch (err) {
        log.warn(`[Clipboard] Failed to read clipboard: ${err}`);
        return false;
      }

      if (clipboardData.nodes.length === 0) {
        log.info("[Clipboard] No nodes to paste");
        return false;
      }

      let pastePosition = position;
      if (!pastePosition && rfInstance) {
        const viewport = rfInstance.getViewport();
        const container = document.querySelector(".react-flow");
        if (container) {
          const rect = container.getBoundingClientRect();
          pastePosition = {
            x: (rect.width / 2 - viewport.x) / viewport.zoom,
            y: (rect.height / 2 - viewport.y) / viewport.zoom
          };
        }
      }
      pastePosition = pastePosition ?? { x: 0, y: 0 };

      pasteCounter++;
      const offset = pasteCounter * 20;

      // Get fresh nodes from React Flow instance to ensure we have the latest state
      // This avoids stale closure issues where `nodes` from useGraph() might be outdated
      const currentNodes = rfInstance?.getNodes() ?? nodes;
      const usedNames = new Set<string>(currentNodes.map((n: { id: string }) => n.id));

      // Direct console.log for debugging (bypasses VS Code message bridge)
      console.log(
        `[Clipboard] Building unique IDs from ${usedNames.size} existing nodes:`,
        Array.from(usedNames)
      );
      log.info(
        `[Clipboard] Building unique IDs from ${usedNames.size} existing nodes: ${Array.from(usedNames).join(", ")}`
      );

      const idMapping = new Map<string, string>();

      // Annotation node types that should use original ID as base (not name)
      const annotationTypes = new Set(["group-node", "free-text-node", "free-shape-node"]);

      for (const node of clipboardData.nodes) {
        // For annotation nodes (groups, text, shapes), use the original ID as base
        // For topology nodes, use the name (which becomes the YAML node name)
        const isAnnotation = annotationTypes.has(node.type ?? "");
        const idBase = isAnnotation ? node.id : (node.data.name as string) || node.id;
        console.log(
          `[Clipboard] Generating ID for idBase="${idBase}", node.id="${node.id}", isAnnotation=${isAnnotation}`
        );
        const newId = getUniqueId(idBase, usedNames);
        console.log(`[Clipboard] Generated unique ID: ${idBase} -> ${newId}`);
        log.info(`[Clipboard] Generated unique ID: ${idBase} -> ${newId}`);
        usedNames.add(newId);
        idMapping.set(node.id, newId);
      }

      undoRedo.beginBatch();

      // Track pasted node/edge IDs for selection
      const pastedNodeIds: string[] = [];
      const pastedEdgeIds: string[] = [];

      try {
        for (const node of clipboardData.nodes) {
          const newId = idMapping.get(node.id)!;
          pastedNodeIds.push(newId);
          const newPosition = {
            x: pastePosition!.x + node.relativePosition.x + offset,
            y: pastePosition!.y + node.relativePosition.y + offset
          };

          // Remap groupId if the node belongs to a group that was also copied
          const originalGroupId = node.data.groupId as string | undefined;
          const newGroupId = originalGroupId ? idMapping.get(originalGroupId) : undefined;

          const newNode: TopoNode = {
            id: newId,
            type: (node.type ?? "topology-node") as "topology-node",
            position: newPosition,
            // Preserve top-level dimensions for annotation nodes (groups, shapes, text)
            ...(node.width !== undefined && { width: node.width }),
            ...(node.height !== undefined && { height: node.height }),
            ...(node.zIndex !== undefined && { zIndex: node.zIndex }),
            data: {
              ...node.data,
              id: newId,
              name: newId,
              label: newId, // Always use the new unique ID as the label
              role: (node.data.role as string) || "node",
              // Remap groupId to point to the new copied group (or remove if group wasn't copied)
              groupId: newGroupId
            } as TopologyNodeData
          };

          // Use onNodeCreated callback if provided (includes YAML persistence)
          // Otherwise fall back to addNode (React Flow state only)
          if (onNodeCreated) {
            onNodeCreated(newId, newNode, newPosition);
          } else {
            addNode(newNode);
          }

          // Update in-memory membership map for topology nodes with group membership
          // Annotation nodes (free-text, free-shape) have groupId in their data and are handled by useAnnotationPersistence
          const isAnnotation = annotationTypes.has(node.type ?? "");
          if (newGroupId && !isAnnotation && addNodeToGroup) {
            addNodeToGroup(newId, newGroupId);
          }
        }

        let edgeCount = 0;
        for (const edge of clipboardData.edges) {
          const newSource = idMapping.get(edge.source);
          const newTarget = idMapping.get(edge.target);

          if (!newSource || !newTarget) continue;

          const sourceEndpoint = (edge.data.sourceEndpoint as string) || "eth1";
          const targetEndpoint = (edge.data.targetEndpoint as string) || "eth1";
          const newId = `${newSource}:${sourceEndpoint}--${newTarget}:${targetEndpoint}`;
          pastedEdgeIds.push(newId);

          // Use onEdgeCreated callback if provided (includes YAML persistence)
          // Otherwise fall back to addEdge (React Flow state only)
          if (onEdgeCreated) {
            onEdgeCreated(newSource, newTarget, {
              id: newId,
              source: newSource,
              target: newTarget,
              sourceEndpoint,
              targetEndpoint
            });
          } else {
            const newEdge: TopoEdge = {
              id: newId,
              source: newSource,
              target: newTarget,
              data: {
                ...edge.data,
                sourceEndpoint,
                targetEndpoint
              } as TopologyEdgeData
            };
            addEdge(newEdge);
          }
          edgeCount++;
        }

        log.info(`[Clipboard] Pasted ${clipboardData.nodes.length} nodes, ${edgeCount} edges`);

        // Select pasted elements and deselect everything else
        // Use setTimeout to ensure nodes are added to React Flow before selecting
        setTimeout(() => {
          if (!rfInstance) return;
          const pastedNodeSet = new Set(pastedNodeIds);
          const pastedEdgeSet = new Set(pastedEdgeIds);

          // Update nodes: select pasted, deselect others
          rfInstance.setNodes((nodes) =>
            nodes.map((n) => ({
              ...n,
              selected: pastedNodeSet.has(n.id)
            }))
          );

          // Update edges: select pasted, deselect others
          rfInstance.setEdges((edges) =>
            edges.map((e) => ({
              ...e,
              selected: pastedEdgeSet.has(e.id)
            }))
          );

          log.info(
            `[Clipboard] Selected ${pastedNodeIds.length} nodes, ${pastedEdgeIds.length} edges after paste`
          );
        }, 50);
      } finally {
        undoRedo.endBatch();
      }

      return true;
    },
    [rfInstance, nodes, addNode, addEdge, undoRedo, onNodeCreated, onEdgeCreated]
  );

  /**
   * Check if the browser clipboard has compatible data.
   */
  const hasClipboardData = useCallback(async (): Promise<boolean> => {
    try {
      const text = await navigator.clipboard.readText();
      const data = JSON.parse(text) as ClipboardData;
      return Boolean(data.version && data.nodes);
    } catch {
      return false;
    }
  }, []);

  return { copy, paste, hasClipboardData };
}
