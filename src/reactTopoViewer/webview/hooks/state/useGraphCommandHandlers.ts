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
  NodeCreatedHandler,
} from "../../../shared/types/graph";
import type { NodeSaveData } from "../../../shared/io/NodePersistenceIO";
import type { TopologyHostCommand } from "../../../shared/types/messages";
import {
  createLink,
  createNode,
  deleteLink,
  deleteNode,
  saveAnnotationNodesFromGraph,
  saveNetworkNodesFromGraph,
  executeTopologyCommand,
} from "../../services";
import {
  isAnnotationNodeType,
  nodesToAnnotations,
} from "../../annotations/annotationNodeConverters";
import { toLinkSaveData } from "../../services/linkSaveData";
import {
  BRIDGE_NETWORK_TYPES,
  SPECIAL_NETWORK_TYPES,
  getNetworkType,
} from "../../utils/networkNodeTypes";
import { buildNetworkNodeAnnotations } from "../../utils/networkNodeAnnotations";
import { useGraphStore } from "../../stores/graphStore";

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
  handleBatchPaste: (payload: { nodes: TopoNode[]; edges: TopoEdge[] }) => void;
  handleDeleteNode: (nodeId: string) => void;
  handleDeleteLink: (edgeId: string) => void;
}

// ============================================================================
// Helpers
// ============================================================================

type NodeElementData = Record<string, unknown> & { extraData?: Record<string, unknown> };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTopoNode(node: Node): node is TopoNode {
  return (
    node.type === "topology-node" ||
    node.type === "network-node" ||
    node.type === "group-node" ||
    node.type === "free-text-node" ||
    node.type === "free-shape-node" ||
    node.type === "traffic-rate-node"
  );
}

function getNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function getExtraDataRecord(data: Record<string, unknown>): Record<string, unknown> | undefined {
  const { extraData } = data;
  return isRecord(extraData) ? extraData : undefined;
}

const NODE_FALLBACK_PROPS = [
  "kind",
  "type",
  "image",
  "group",
  "groupId",
  "topoViewerRole",
  "iconColor",
  "iconCornerRadius",
  "labelPosition",
  "direction",
  "labelBackgroundColor",
  "interfacePattern",
] as const;

const NETWORK_NODE_TYPE = "network-node";

function mergeNodeExtraData(data: NodeElementData): NodeSaveData["extraData"] {
  const ed = data.extraData ?? {};
  const result: Record<string, unknown> = { ...ed };
  for (const key of NODE_FALLBACK_PROPS) {
    if (result[key] === undefined) {
      const topLevelValue = (data as Record<string, unknown>)[key];
      if (topLevelValue !== undefined) {
        result[key] = topLevelValue;
      }
    }
  }

  // New nodes carry the visual icon in data.role; persist it as topoViewerRole
  // so host snapshots keep custom icons instead of falling back to defaults.
  if (result.topoViewerRole === undefined) {
    const role = data.role;
    if (typeof role === "string" && role.trim().length > 0) {
      result.topoViewerRole = role;
    }
  }

  return result;
}

function toNodeSaveData(node: TopoNode): NodeSaveData {
  const data = node.data as NodeElementData;
  const name = getNonEmptyString(data.label) ?? getNonEmptyString(data.name) ?? node.id;
  return {
    id: node.id,
    name,
    position: node.position,
    extraData: mergeNodeExtraData(data),
  };
}

function isSpecialNetworkNode(node: TopoNode): boolean {
  if (node.type !== NETWORK_NODE_TYPE) return false;
  const data = node.data;
  const type = getNetworkType(data);
  return type !== undefined && type.length > 0 && SPECIAL_NETWORK_TYPES.has(type);
}

function isBridgeNetworkNode(node: TopoNode): boolean {
  const data = node.data;
  const type = getNetworkType(data);
  return type !== undefined && type.length > 0 && BRIDGE_NETWORK_TYPES.has(type);
}

const VXLAN_NETWORK_TYPES = new Set(["vxlan", "vxlan-stitch"]);
const VXLAN_DEFAULTS = { extRemote: "127.0.0.1", extVni: "100", extDstPort: "4789" };

type LinkTypeDetectionResult = { linkType: string; networkNodeId: string } | undefined;

function detectSpecialLinkType(
  nodes: TopoNode[],
  sourceId: string,
  targetId: string
): LinkTypeDetectionResult {
  const sourceNode = nodes.find((node) => node.id === sourceId);
  if (sourceNode?.type === NETWORK_NODE_TYPE) {
    const data = sourceNode.data;
    const type = getNetworkType(data);
    if (type !== undefined && type.length > 0 && SPECIAL_NETWORK_TYPES.has(type)) {
      return { linkType: type, networkNodeId: sourceId };
    }
  }

  const targetNode = nodes.find((node) => node.id === targetId);
  if (targetNode?.type === NETWORK_NODE_TYPE) {
    const data = targetNode.data;
    const type = getNetworkType(data);
    if (type !== undefined && type.length > 0 && SPECIAL_NETWORK_TYPES.has(type)) {
      return { linkType: type, networkNodeId: targetId };
    }
  }

  return undefined;
}

function getAliasYamlNodeId(node: TopoNode | undefined): string | undefined {
  if (!node) return undefined;
  const data = node.data;
  const extraData = getExtraDataRecord(data) ?? {};
  const yamlNodeId =
    typeof extraData.extYamlNodeId === "string" ? extraData.extYamlNodeId.trim() : "";
  if (yamlNodeId.length === 0 || yamlNodeId === node.id) return undefined;
  const type = getNetworkType(data);
  if (type === undefined || type.length === 0 || !BRIDGE_NETWORK_TYPES.has(type)) return undefined;
  return yamlNodeId;
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
      const nodes = getNodes().filter(isTopoNode);
      const detection = detectSpecialLinkType(nodes, edgeData.source, edgeData.target);
      const edgeExtraData: Record<string, unknown> = {};
      if (detection) {
        edgeExtraData.extType = detection.linkType;
      }
      const sourceAliasYaml = getAliasYamlNodeId(nodes.find((node) => node.id === edgeData.source));
      const targetAliasYaml = getAliasYamlNodeId(nodes.find((node) => node.id === edgeData.target));
      if (sourceAliasYaml !== undefined) {
        edgeExtraData.yamlSourceNodeId = sourceAliasYaml;
      }
      if (targetAliasYaml !== undefined) {
        edgeExtraData.yamlTargetNodeId = targetAliasYaml;
      }
      const extraData = Object.keys(edgeExtraData).length > 0 ? edgeExtraData : undefined;
      const edge: TopoEdge = {
        id: edgeData.id,
        source: edgeData.source,
        target: edgeData.target,
        type: "topology-edge",
        data: {
          sourceEndpoint: edgeData.sourceEndpoint,
          targetEndpoint: edgeData.targetEndpoint,
          ...(extraData ? { extraData } : {}),
        } as TopologyEdgeData,
      };
      addEdge(edge);
      void createLink(toLinkSaveData(edge));

      if (detection && VXLAN_NETWORK_TYPES.has(detection.linkType)) {
        const node = nodes.find((n) => n.id === detection.networkNodeId);
        const existingExtra = node ? (getExtraDataRecord(node.data) ?? {}) : {};
        const nextExtra = {
          ...existingExtra,
          extRemote: existingExtra.extRemote ?? VXLAN_DEFAULTS.extRemote,
          extVni: existingExtra.extVni ?? VXLAN_DEFAULTS.extVni,
          extDstPort: existingExtra.extDstPort ?? VXLAN_DEFAULTS.extDstPort,
        };
        useGraphStore.getState().updateNodeData(detection.networkNodeId, nextExtra);
      }
    },
    [addEdge, getNodes]
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

  const handleBatchPaste = React.useCallback(
    (payload: { nodes: TopoNode[]; edges: TopoEdge[] }) => {
      const { nodes: pastedNodes, edges: pastedEdges } = payload;
      if (pastedNodes.length === 0 && pastedEdges.length === 0) return;

      const commands: TopologyHostCommand[] = [];

      for (const node of pastedNodes) {
        if (isAnnotationNodeType(node.type)) continue;
        if (isSpecialNetworkNode(node) && !isBridgeNetworkNode(node)) continue;
        commands.push({ command: "addNode", payload: toNodeSaveData(node) });
      }

      for (const edge of pastedEdges) {
        commands.push({ command: "addLink", payload: toLinkSaveData(edge) });
      }

      const graphNodes = useGraphStore.getState().nodes;
      const { freeTextAnnotations, freeShapeAnnotations, trafficRateAnnotations, groups } =
        nodesToAnnotations(graphNodes);
      const networkNodeAnnotations = buildNetworkNodeAnnotations(graphNodes);
      const shouldSaveAnnotations =
        freeTextAnnotations.length > 0 ||
        freeShapeAnnotations.length > 0 ||
        trafficRateAnnotations.length > 0 ||
        groups.length > 0 ||
        networkNodeAnnotations.length > 0;

      if (shouldSaveAnnotations) {
        commands.push({
          command: "setAnnotations",
          payload: {
            freeTextAnnotations,
            freeShapeAnnotations,
            trafficRateAnnotations,
            groupStyleAnnotations: groups,
            networkNodeAnnotations,
          },
        });
      }

      if (commands.length === 0) return;
      void executeTopologyCommand(
        { command: "batch", payload: { commands } },
        { applySnapshot: false }
      );
    },
    [
      buildNetworkNodeAnnotations,
      executeTopologyCommand,
      isAnnotationNodeType,
      isBridgeNetworkNode,
      isSpecialNetworkNode,
      nodesToAnnotations,
      toLinkSaveData,
      toNodeSaveData,
    ]
  );

  const handleDeleteNode = React.useCallback(
    (nodeId: string) => {
      const nodes = getNodes().filter(isTopoNode);
      const node = nodes.find((n) => n.id === nodeId);

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
    handleBatchPaste,
    handleDeleteNode,
    handleDeleteLink,
  };
}
