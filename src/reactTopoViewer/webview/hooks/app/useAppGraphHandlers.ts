/**
 * useAppGraphHandlers - app-level graph mutation wiring.
 */
import React from "react";
import type { ReactFlowInstance } from "@xyflow/react";

import type { LinkEditorData } from "../../../shared/types/editors";
import type {
  TopologyEdgeData,
  TopoEdge,
  TopoNode,
  EdgeCreatedHandler,
  NodeCreatedHandler
} from "../../../shared/types/graph";
import type { GraphActions } from "../../stores/graphStore";
import { convertEditorDataToLinkSaveData } from "../../utils/linkEditorConversions";
import { useGraphHandlersWithContext } from "../state";

interface MenuHandlers {
  handleDeleteNode: (nodeId: string) => void;
  handleDeleteLink: (edgeId: string) => void;
}

type GraphActionSubset = Pick<
  GraphActions,
  | "addNode"
  | "addEdge"
  | "removeNodeAndEdges"
  | "removeEdge"
  | "updateNodeData"
  | "updateEdge"
  | "renameNode"
>;

interface AppGraphHandlersConfig {
  rfInstance: ReactFlowInstance | null;
  menuHandlers: MenuHandlers;
  actions: GraphActionSubset;
}

function toRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    return {};
  }
  const record: Record<string, unknown> = {};
  for (const [key, entryValue] of Object.entries(value)) {
    record[key] = entryValue;
  }
  return record;
}

function isTopologyEdgeData(value: unknown): value is TopologyEdgeData {
  const record = toRecord(value);
  const sourceEndpoint = record.sourceEndpoint;
  const targetEndpoint = record.targetEndpoint;
  return typeof sourceEndpoint === "string" && typeof targetEndpoint === "string";
}

export interface AppGraphHandlers {
  handleEdgeCreated: EdgeCreatedHandler;
  handleNodeCreatedCallback: NodeCreatedHandler;
  handleBatchPaste: (payload: { nodes: TopoNode[]; edges: TopoEdge[] }) => void;
  handleDeleteNode: (nodeId: string) => void;
  handleDeleteLink: (edgeId: string) => void;
  handleUpdateNodeData: (nodeId: string, extraData: Record<string, unknown>) => void;
  handleUpdateEdgeData: (edgeId: string, data: LinkEditorData) => void;
  renameNodeInGraph: (oldId: string, newId: string, name?: string) => void;
  addNodeDirect: (node: TopoNode) => void;
  addEdgeDirect: (edge: TopoEdge) => void;
}

export function useAppGraphHandlers({
  rfInstance,
  menuHandlers,
  actions
}: AppGraphHandlersConfig): AppGraphHandlers {
  const {
    addNode,
    addEdge,
    removeNodeAndEdges,
    removeEdge,
    updateNodeData,
    updateEdge,
    renameNode
  } = actions;

  const addNodeDirect = React.useCallback(
    (node: TopoNode) => {
      addNode(node);
    },
    [addNode]
  );

  const addEdgeDirect = React.useCallback(
    (edge: TopoEdge) => {
      addEdge(edge);
    },
    [addEdge]
  );

  const getNodes = React.useCallback(() => rfInstance?.getNodes() ?? [], [rfInstance]);
  const getEdges = React.useCallback((): TopoEdge[] => {
    const edges = rfInstance?.getEdges() ?? [];
    return edges.filter((edge): edge is TopoEdge => isTopologyEdgeData(edge.data));
  }, [rfInstance]);

  const {
    handleEdgeCreated,
    handleNodeCreatedCallback,
    handleBatchPaste,
    handleDeleteNode,
    handleDeleteLink
  } = useGraphHandlersWithContext({
    getNodes,
    getEdges,
    addNode: addNodeDirect,
    addEdge: addEdgeDirect,
    removeNodeAndEdges,
    removeEdge,
    menuHandlers
  });

  const handleUpdateNodeData = React.useCallback(
    (nodeId: string, extraData: Record<string, unknown>) => {
      updateNodeData(nodeId, extraData);
    },
    [updateNodeData]
  );

  const handleUpdateEdgeData = React.useCallback(
    (edgeId: string, data: LinkEditorData) => {
      const saveData = convertEditorDataToLinkSaveData(data);
      updateEdge(edgeId, {
        source: saveData.source,
        target: saveData.target,
        data: {
          sourceEndpoint: saveData.sourceEndpoint ?? data.sourceEndpoint,
          targetEndpoint: saveData.targetEndpoint ?? data.targetEndpoint,
          ...(saveData.extraData ? { extraData: saveData.extraData } : {})
        }
      });
    },
    [updateEdge]
  );

  const renameNodeInGraph = React.useCallback(
    (oldId: string, newId: string, name?: string) => {
      renameNode(oldId, newId, name);
    },
    [renameNode]
  );

  return {
    handleEdgeCreated,
    handleNodeCreatedCallback,
    handleBatchPaste,
    handleDeleteNode,
    handleDeleteLink,
    handleUpdateNodeData,
    handleUpdateEdgeData,
    renameNodeInGraph,
    addNodeDirect,
    addEdgeDirect
  };
}
