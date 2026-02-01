/**
 * Custom hooks extracted from ReactFlowCanvas to reduce complexity
 */
import type React from "react";
import { useRef, useEffect, useCallback, useMemo, useState } from "react";
import type { Node, Edge, ReactFlowInstance } from "@xyflow/react";

import { applyLayout, type LayoutName } from "../../components/canvas/layout";
import type { TopoNode, TopoEdge } from "../../../shared/types/graph";
import { useGraphStore } from "../../stores/graphStore";
import { log } from "../../utils/logger";
import { allocateEndpointsForLink } from "../../utils/endpointAllocator";
import { buildEdgeId } from "../../utils/edgeId";

/**
 * Hook for delete node/edge handlers
 */
export function useDeleteHandlers(
  selectNode: (id: string | null) => void,
  selectEdge: (id: string | null) => void,
  closeContextMenu: () => void,
  onNodeDelete?: (nodeId: string) => void,
  onEdgeDelete?: (edgeId: string) => void
) {
  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      log.info(`[ReactFlowCanvas] Deleting node: ${nodeId}`);
      onNodeDelete?.(nodeId);
      selectNode(null);
      selectEdge(null);
      closeContextMenu();
    },
    [selectNode, selectEdge, onNodeDelete, closeContextMenu]
  );

  const handleDeleteEdge = useCallback(
    (edgeId: string) => {
      log.info(`[ReactFlowCanvas] Deleting edge: ${edgeId}`);
      onEdgeDelete?.(edgeId);
      selectEdge(null);
      selectNode(null);
      closeContextMenu();
    },
    [selectNode, selectEdge, onEdgeDelete, closeContextMenu]
  );

  return { handleDeleteNode, handleDeleteEdge };
}

/**
 * Hook for link creation mode
 */
export function useLinkCreation(
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
  ) => void
) {
  const [linkSourceNode, setLinkSourceNode] = useState<string | null>(null);
  const linkCreationSeedRef = useRef<number | null>(null);

  const startLinkCreation = useCallback((nodeId: string) => {
    log.info(`[ReactFlowCanvas] Starting link creation from: ${nodeId}`);
    linkCreationSeedRef.current = Date.now();
    setLinkSourceNode(nodeId);
  }, []);

  const cancelLinkCreation = useCallback(() => {
    log.info("[ReactFlowCanvas] Cancelling link creation");
    linkCreationSeedRef.current = null;
    setLinkSourceNode(null);
  }, []);

  const completeLinkCreation = useCallback(
    (targetNodeId: string) => {
      if (!linkSourceNode) return;

      const isLoopLink = linkSourceNode === targetNodeId;
      log.info(
        `[ReactFlowCanvas] Completing ${isLoopLink ? "loop " : ""}link: ${linkSourceNode} -> ${targetNodeId}`
      );
      const { nodes, edges } = useGraphStore.getState();
      const { sourceEndpoint, targetEndpoint } = allocateEndpointsForLink(
        nodes as TopoNode[],
        edges as TopoEdge[],
        linkSourceNode,
        targetNodeId
      );
      const edgeId = buildEdgeId(
        linkSourceNode,
        targetNodeId,
        sourceEndpoint,
        targetEndpoint,
        linkCreationSeedRef.current ?? Date.now()
      );

      const edgeData = {
        id: edgeId,
        source: linkSourceNode,
        target: targetNodeId,
        sourceEndpoint,
        targetEndpoint
      };

      // Use the unified callback which handles:
      // 1. Adding edge to React state
      // 2. Persisting via TopologyHost commands
      // 3. Undo/redo support
      if (onEdgeCreated) {
        onEdgeCreated(linkSourceNode, targetNodeId, edgeData);
      }

      linkCreationSeedRef.current = null;
      setLinkSourceNode(null);
    },
    [linkSourceNode, onEdgeCreated]
  );

  useEffect(() => {
    if (!linkSourceNode) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancelLinkCreation();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [linkSourceNode, cancelLinkCreation]);

  return {
    linkSourceNode,
    startLinkCreation,
    completeLinkCreation,
    cancelLinkCreation,
    linkCreationSeed: linkCreationSeedRef.current
  };
}

/**
 * Hook for calculating source node position for link creation line.
 * Only recalculates when linkSourceNode changes, not on every node position update.
 * Uses the node's initial position when link creation starts.
 */
export function useSourceNodePosition(linkSourceNode: string | null, nodes: Node[]) {
  const ICON_SIZE = 40;
  // Store position and the linkSourceNode it was calculated for
  const positionRef = useRef<{ x: number; y: number } | null>(null);
  const lastSourceNodeRef = useRef<string | null>(null);

  // Only update position when linkSourceNode changes (not on every node position update)
  if (linkSourceNode !== lastSourceNodeRef.current) {
    lastSourceNodeRef.current = linkSourceNode;
    if (!linkSourceNode) {
      positionRef.current = null;
    } else {
      const node = nodes.find((n) => n.id === linkSourceNode);
      if (node) {
        const nodeWidth = node.measured?.width ?? ICON_SIZE;
        positionRef.current = {
          x: node.position.x + nodeWidth / 2,
          y: node.position.y + ICON_SIZE / 2
        };
      }
    }
  }

  return positionRef.current;
}

/**
 * Hook for keyboard delete handlers
 */
export function useKeyboardDeleteHandlers(
  mode: "view" | "edit",
  isLocked: boolean,
  selectedNode: string | null,
  selectedEdge: string | null,
  handleDeleteNode: (nodeId: string) => void,
  handleDeleteEdge: (edgeId: string) => void
) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      if (mode !== "edit" || isLocked) return;

      const tagName = (event.target as HTMLElement).tagName;
      if (tagName === "INPUT" || tagName === "TEXTAREA") return;

      if (selectedNode) handleDeleteNode(selectedNode);
      else if (selectedEdge) handleDeleteEdge(selectedEdge);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mode, isLocked, selectedNode, selectedEdge, handleDeleteNode, handleDeleteEdge]);
}

/** Position entry for undo/redo */
interface PositionEntry {
  id: string;
  position: { x: number; y: number };
}

/** Apply position update to a single node */
function applyPositionToNode(node: Node, positions: PositionEntry[]): Node {
  const posEntry = positions.find((p) => p.id === node.id);
  return posEntry ? { ...node, position: posEntry.position } : node;
}

/** Create node updater function for position changes */
function createPositionUpdater(positions: PositionEntry[]) {
  return (currentNodes: Node[]) => currentNodes.map((node) => applyPositionToNode(node, positions));
}

/**
 * Hook to create imperative handle methods
 */
/** Schedule a fit view after layout application */
function scheduleFitView(rfRef: React.RefObject<ReactFlowInstance | null>): void {
  setTimeout(() => {
    rfRef.current?.fitView({ padding: 0.2, duration: 200 })?.catch(() => {
      /* ignore */
    });
  }, 100);
}

export function useCanvasRefMethods(
  reactFlowInstanceRef: React.RefObject<ReactFlowInstance | null>,
  nodes: Node[],
  edges: Edge[],
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>,
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>
) {
  return useMemo(
    () => ({
      fit: () => reactFlowInstanceRef.current?.fitView({ padding: 0.2, duration: 200 }),
      runLayout: (layoutName: string) => {
        setNodes(applyLayout(layoutName as LayoutName, nodes, edges));
        scheduleFitView(reactFlowInstanceRef);
      },
      getReactFlowInstance: () => reactFlowInstanceRef.current,
      getNodes: () => nodes,
      getEdges: () => edges,
      setNodePositions: (positions: PositionEntry[]) => {
        setNodes(createPositionUpdater(positions));
      },
      updateNodes: (updater: (nodes: Node[]) => Node[]) => setNodes(updater),
      updateEdges: (updater: (edges: Edge[]) => Edge[]) => setEdges(updater)
    }),
    [nodes, edges, setNodes, setEdges, reactFlowInstanceRef]
  );
}
