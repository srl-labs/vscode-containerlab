/**
 * Graph mutation handlers backed by host commands.
 */
import React from "react";
import type { Node } from "@xyflow/react";

import type { TopoNode, TopoEdge, TopologyEdgeData } from "../../../shared/types/graph";
import type { NodeSaveData } from "../../../shared/io/NodePersistenceIO";
import type { LinkSaveData } from "../../../shared/io/LinkPersistenceIO";

import {
  createNode,
  createLink,
  deleteNode,
  deleteLink,
  saveNetworkNodesFromGraph,
  saveAnnotationNodesFromGraph
} from "../../services";
import { isAnnotationNodeType } from "../../utils/annotationNodeConverters";

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
  handleDeleteNode: (nodeId: string) => void;
  handleDeleteLink: (edgeId: string) => void;
}

// ============================================================================
// Helpers
// ============================================================================

const SPECIAL_NETWORK_TYPES = new Set([
  "host",
  "mgmt-net",
  "macvlan",
  "vxlan",
  "vxlan-stitch",
  "dummy"
]);

const BRIDGE_NETWORK_TYPES = new Set(["bridge", "ovs-bridge"]);

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

function toLinkSaveData(edge: TopoEdge): LinkSaveData {
  const data = edge.data as TopologyEdgeData | undefined;
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceEndpoint: data?.sourceEndpoint,
    targetEndpoint: data?.targetEndpoint,
    ...(data?.extraData ? { extraData: data.extraData } : {})
  };
}

function getNetworkType(data: Record<string, unknown>): string | undefined {
  const kind = data.kind;
  if (typeof kind === "string") return kind;
  const nodeType = data.nodeType;
  if (typeof nodeType === "string") return nodeType;
  const extraData = data.extraData as Record<string, unknown> | undefined;
  const extraKind = extraData?.kind;
  if (typeof extraKind === "string") return extraKind;
  return undefined;
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
    (nodeId: string, nodeElement: TopoNode, _position: { x: number; y: number }) => {
      void nodeId;
      addNode(nodeElement);

      if (isAnnotationNodeType(nodeElement.type)) {
        void saveAnnotationNodesFromGraph();
        return;
      }

      if (isSpecialNetworkNode(nodeElement) && !isBridgeNetworkNode(nodeElement)) {
        void saveNetworkNodesFromGraph();
        return;
      }

      void createNode(toNodeSaveData(nodeElement));
    },
    [addNode]
  );

  const handleDeleteNode = React.useCallback(
    (nodeId: string) => {
      const nodes = getNodes();
      const edges = getEdges();
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

      // Remove connected links from YAML for non-network nodes
      if (!node || !isSpecialNetworkNode(node)) {
        const connectedEdges = edges.filter(
          (edge) => edge.source === nodeId || edge.target === nodeId
        );
        for (const edge of connectedEdges) {
          void deleteLink(toLinkSaveData(edge));
        }
      }
    },
    [getNodes, getEdges, removeNodeAndEdges, menuHandlers]
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
