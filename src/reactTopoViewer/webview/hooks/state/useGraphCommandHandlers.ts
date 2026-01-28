/**
 * Graph mutation handlers backed by host commands.
 */
import React from "react";
import type { Node } from "@xyflow/react";

import type {
  TopoNode,
  TopoEdge,
  TopologyEdgeData,
  EdgeCreatedData,
  EdgeCreatedHandler,
  NodeCreatedHandler
} from "../../../shared/types/graph";
import type { NodeSaveData } from "../../../shared/io/NodePersistenceIO";
import {
  createLink,
  createNode,
  deleteLink,
  deleteNode,
  saveAnnotationNodesFromGraph,
  saveNetworkNodesFromGraph
} from "../../services";
import { isAnnotationNodeType } from "../../annotations/annotationNodeConverters";
import { toLinkSaveData } from "../../services/linkSaveData";
import {
  BRIDGE_NETWORK_TYPES,
  SPECIAL_NETWORK_TYPES,
  getNetworkType
} from "../../utils/networkNodeTypes";

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
}

interface GraphHandlersResult {
  handleEdgeCreated: EdgeCreatedHandler;
  handleNodeCreatedCallback: NodeCreatedHandler;
  handleDeleteNode: (nodeId: string) => void;
  handleDeleteLink: (edgeId: string) => void;
}

// ============================================================================
// Helpers
// ============================================================================

type NodeElementData = Record<string, unknown> & { extraData?: Record<string, unknown> };

const NODE_FALLBACK_PROPS = [
  "kind",
  "type",
  "image",
  "group",
  "groupId",
  "topoViewerRole",
  "iconColor",
  "iconCornerRadius",
  "interfacePattern"
] as const;

function mergeNodeExtraData(data: NodeElementData): NodeSaveData["extraData"] {
  const ed = (data.extraData ?? {}) as Record<string, unknown>;
  const result: Record<string, unknown> = { ...ed };
  for (const key of NODE_FALLBACK_PROPS) {
    if (result[key] === undefined) {
      const topLevelValue = (data as Record<string, unknown>)[key];
      if (topLevelValue !== undefined) {
        result[key] = topLevelValue;
      }
    }
  }
  return result;
}

function toNodeSaveData(node: TopoNode): NodeSaveData {
  const data = (node.data ?? {}) as NodeElementData;
  const name = (data.label as string) || (data.name as string) || node.id;
  return {
    id: node.id,
    name,
    position: node.position,
    extraData: mergeNodeExtraData(data)
  };
}

function isSpecialNetworkNode(node: TopoNode): boolean {
  const data = (node.data ?? {}) as Record<string, unknown>;
  const isNetwork = data.role === "cloud" || data.topoViewerRole === "cloud";
  if (!isNetwork) return false;
  const type = getNetworkType(data);
  return Boolean(type && SPECIAL_NETWORK_TYPES.has(type));
}

function isBridgeNetworkNode(node: TopoNode): boolean {
  const data = (node.data ?? {}) as Record<string, unknown>;
  const type = getNetworkType(data);
  return Boolean(type && BRIDGE_NETWORK_TYPES.has(type));
}

// ============================================================================
// Core handlers
// ============================================================================

export function useGraphHandlersWithContext(
  params: UseGraphHandlersWithContextParams
): GraphHandlersResult {
  const { getNodes, getEdges, addNode, addEdge, removeNodeAndEdges, removeEdge, menuHandlers } =
    params;

  const handleEdgeCreated = React.useCallback(
    (_sourceId: string, _targetId: string, edgeData: EdgeCreatedData) => {
      const edge: TopoEdge = {
        id: edgeData.id,
        source: edgeData.source,
        target: edgeData.target,
        type: "topology-edge",
        data: {
          sourceEndpoint: edgeData.sourceEndpoint,
          targetEndpoint: edgeData.targetEndpoint
        } as TopologyEdgeData
      };
      addEdge(edge);
      void createLink(toLinkSaveData(edge));
    },
    [addEdge]
  );

  const handleNodeCreatedCallback = React.useCallback(
    (nodeId: string, nodeElement: TopoNode, position: { x: number; y: number }) => {
      const nextNode =
        nodeElement.id === nodeId &&
        nodeElement.position.x === position.x &&
        nodeElement.position.y === position.y
          ? nodeElement
          : { ...nodeElement, id: nodeId, position };

      addNode(nextNode);

      if (isAnnotationNodeType(nextNode.type)) {
        void saveAnnotationNodesFromGraph();
        return;
      }

      if (isSpecialNetworkNode(nextNode) && !isBridgeNetworkNode(nextNode)) {
        void saveNetworkNodesFromGraph();
        return;
      }

      void createNode(toNodeSaveData(nextNode));
    },
    [addNode]
  );

  const handleDeleteNode = React.useCallback(
    (nodeId: string) => {
      const nodes = getNodes();
      const node = nodes.find((n) => n.id === nodeId) as TopoNode | undefined;

      removeNodeAndEdges(nodeId);
      menuHandlers.handleDeleteNode(nodeId);

      if (node && isAnnotationNodeType(node.type)) {
        void saveAnnotationNodesFromGraph();
        return;
      }

      if (node && isSpecialNetworkNode(node) && !isBridgeNetworkNode(node)) {
        // Network nodes are stored in annotations, update from graph state
        void saveNetworkNodesFromGraph();
      }

      // Always let host handle YAML removal + link cleanup
      void deleteNode(nodeId);
    },
    [getNodes, removeNodeAndEdges, menuHandlers]
  );

  const handleDeleteLink = React.useCallback(
    (edgeId: string) => {
      const edges = getEdges();
      const edge = edges.find((e) => e.id === edgeId);
      removeEdge(edgeId);
      menuHandlers.handleDeleteLink(edgeId);
      if (edge) {
        void deleteLink(toLinkSaveData(edge));
      }
    },
    [getEdges, removeEdge, menuHandlers]
  );

  return {
    handleEdgeCreated,
    handleNodeCreatedCallback,
    handleDeleteNode,
    handleDeleteLink
  };
}
