/**
 * Graph mutation handlers with snapshot-based undo/redo.
 *
 * Centralizes add/delete operations for nodes and edges.
 */
import React from "react";
import type { Node, Edge } from "@xyflow/react";

import type { TopoNode, TopoEdge, TopologyEdgeData } from "../../../shared/types/graph";
import { useUndoRedo } from "./useUndoRedo";

// ============================================================================
// Types
// ============================================================================

interface MenuHandlers {
  handleDeleteNode: (id: string) => void;
  handleDeleteLink: (id: string) => void;
}

interface UseGraphHandlersWithContextParams {
  getNodes: () => Node[];
  getEdges: () => TopoEdge[];
  addNode: (node: TopoNode) => void;
  addEdge: (edge: TopoEdge) => void;
  removeNodeAndEdges: (nodeId: string) => void;
  removeEdge: (edgeId: string) => void;
  menuHandlers: MenuHandlers;
  undoRedo: ReturnType<typeof useUndoRedo>;
}

interface GraphHandlersResult {
  handleEdgeCreated: (
    _sourceId: string,
    _targetId: string,
    edgeData: {
      id: string;
      source: string;
      target: string;
      sourceEndpoint: string;
      targetEndpoint: string;
    }
  ) => void;
  handleNodeCreatedCallback: (
    nodeId: string,
    nodeElement: TopoNode,
    position: { x: number; y: number }
  ) => void;
  handleDeleteNodeWithUndo: (nodeId: string) => void;
  handleDeleteLinkWithUndo: (edgeId: string) => void;
}

// ============================================================================
// Helpers
// ============================================================================

function buildEdge(edgeData: {
  id: string;
  source: string;
  target: string;
  sourceEndpoint: string;
  targetEndpoint: string;
}): TopoEdge {
  return {
    id: edgeData.id,
    source: edgeData.source,
    target: edgeData.target,
    type: "topology-edge",
    data: {
      sourceEndpoint: edgeData.sourceEndpoint,
      targetEndpoint: edgeData.targetEndpoint
    } as TopologyEdgeData
  };
}

function getConnectedEdgeIds(edges: TopoEdge[], nodeId: string): string[] {
  return edges
    .filter((edge) => edge.source === nodeId || edge.target === nodeId)
    .map((edge) => edge.id);
}

// ============================================================================
// Core handlers
// ============================================================================

function useGraphMutationHandlers(params: {
  getNodes: () => Node[];
  getEdges: () => TopoEdge[];
  addNode: (node: TopoNode) => void;
  addEdge: (edge: TopoEdge) => void;
  removeNodeAndEdges: (nodeId: string) => void;
  removeEdge: (edgeId: string) => void;
  menuHandlers: MenuHandlers;
  undoRedo: ReturnType<typeof useUndoRedo>;
}): GraphHandlersResult {
  const { getEdges, addNode, addEdge, removeNodeAndEdges, removeEdge, menuHandlers, undoRedo } =
    params;

  const handleEdgeCreated = React.useCallback(
    (
      _sourceId: string,
      _targetId: string,
      edgeData: {
        id: string;
        source: string;
        target: string;
        sourceEndpoint: string;
        targetEndpoint: string;
      }
    ) => {
      const edge = buildEdge(edgeData);
      const before = undoRedo.captureSnapshot({ edgeIds: [edgeData.id] });
      addEdge(edge);
      // Pass explicit edge so commitChange doesn't rely on stale state ref
      undoRedo.commitChange(before, `Add link ${edgeData.source} → ${edgeData.target}`, {
        explicitEdges: [edge as Edge]
      });
    },
    [addEdge, undoRedo]
  );

  const handleNodeCreatedCallback = React.useCallback(
    (nodeId: string, nodeElement: TopoNode, _position: { x: number; y: number }) => {
      const before = undoRedo.captureSnapshot({ nodeIds: [nodeId] });
      addNode(nodeElement);
      // Pass explicit node so commitChange doesn't rely on stale state ref
      undoRedo.commitChange(before, `Add node ${nodeId}`, {
        explicitNodes: [nodeElement as Node]
      });
    },
    [addNode, undoRedo]
  );

  const handleDeleteNodeWithUndo = React.useCallback(
    (nodeId: string) => {
      const edges = getEdges();
      const connectedEdgeIds = getConnectedEdgeIds(edges, nodeId);
      const before = undoRedo.captureSnapshot({ nodeIds: [nodeId], edgeIds: connectedEdgeIds });
      removeNodeAndEdges(nodeId);
      menuHandlers.handleDeleteNode(nodeId);
      undoRedo.commitChange(before, `Delete node ${nodeId}`);
    },
    [getEdges, removeNodeAndEdges, menuHandlers, undoRedo]
  );

  const handleDeleteLinkWithUndo = React.useCallback(
    (edgeId: string) => {
      const before = undoRedo.captureSnapshot({ edgeIds: [edgeId] });
      removeEdge(edgeId);
      menuHandlers.handleDeleteLink(edgeId);
      undoRedo.commitChange(before, `Delete link ${edgeId}`);
    },
    [removeEdge, menuHandlers, undoRedo]
  );

  return {
    handleEdgeCreated,
    handleNodeCreatedCallback,
    handleDeleteNodeWithUndo,
    handleDeleteLinkWithUndo
  };
}

// ============================================================================
// Exported hooks
// ============================================================================

/**
 * Context-based variant that uses an external undoRedo instance.
 */
export function useGraphHandlersWithContext(
  params: UseGraphHandlersWithContextParams
): GraphHandlersResult {
  const {
    getNodes,
    getEdges,
    addNode,
    addEdge,
    removeNodeAndEdges,
    removeEdge,
    menuHandlers,
    undoRedo
  } = params;

  return useGraphMutationHandlers({
    getNodes,
    getEdges,
    addNode,
    addEdge,
    removeNodeAndEdges,
    removeEdge,
    menuHandlers,
    undoRedo
  });
}
