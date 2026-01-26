/**
 * useGraphCreation - Composed hook for node, edge, and network creation
 *
 * Extracts graph creation logic from App.tsx:
 * - Edge creation (useEdgeCreation + handleCreateLinkFromNode)
 * - Node creation (useNodeCreation + useNodeCreationHandlers)
 * - Network creation (useNetworkCreation + handleNetworkCreatedCallback + handleAddNetworkFromPanel)
 */
import React from "react";
import type { ReactFlowInstance } from "@xyflow/react";

import { useNodeCreation } from "../graph/useNodeCreation";
import { useNetworkCreation, type NetworkType } from "../graph/useNetworkCreation";
import { useNodeCreationHandlers, type NodeCreationState } from "../panels/useEditorHandlers";
import type { CustomNodeTemplate } from "../../../shared/types/editors";
import type { TopoNode } from "../../../shared/types/graph";
import type { FloatingActionPanelHandle } from "../../components/panels/floatingPanel/FloatingActionPanel";
import { getViewportCenter } from "../../utils/viewportUtils";

/** Edge data structure for edge creation callback */
interface EdgeData {
  id: string;
  source: string;
  target: string;
  sourceEndpoint: string;
  targetEndpoint: string;
}

/** Callback type for edge creation */
type EdgeCreatedCallback = (sourceId: string, targetId: string, edgeData: EdgeData) => void;

/** Callback type for node creation */
export type NodeCreatedCallback = (
  nodeId: string,
  nodeElement: TopoNode,
  position: Position
) => void;

/** Position type */
type Position = { x: number; y: number };

/**
 * Configuration for useGraphCreation hook
 */
export interface GraphCreationConfig {
  /** React Flow instance for viewport operations */
  rfInstance: ReactFlowInstance | null;
  floatingPanelRef: React.RefObject<FloatingActionPanelHandle | null>;
  state: {
    mode: "edit" | "view";
    isLocked: boolean;
    customNodes: CustomNodeTemplate[];
    defaultNode: string;
    nodes: TopoNode[];
  };
  /** Callback when an edge is created */
  onEdgeCreated: EdgeCreatedCallback;
  /** Callback when a node is created */
  onNodeCreated: NodeCreatedCallback;
  /** Callback to add a node element to state */
  addNode: (element: TopoNode) => void;
  /** Callback to open new custom node template editor */
  onNewCustomNode: () => void;
}

/**
 * Return type for useGraphCreation hook
 */
export interface GraphCreationReturn {
  /** Start edge creation mode from a node */
  startEdgeCreation: (nodeId: string) => void;
  /** Handle link creation from node (wrapper for startEdgeCreation) */
  handleCreateLinkFromNode: (nodeId: string) => void;
  /** Create a node at specific position */
  createNodeAtPosition: (position: Position, template?: CustomNodeTemplate) => void;
  /** Handle adding a node from the floating panel */
  handleAddNodeFromPanel: (templateName?: string) => void;
  /** Create a network at specific position */
  createNetworkAtPosition: (position: Position, networkType: NetworkType) => string | null;
  /** Handle adding a network from the floating panel */
  handleAddNetworkFromPanel: (networkType?: string) => void;
}

/**
 * Hook that composes node, edge, and network creation logic.
 *
 * Consolidates ~65 lines of graph creation code from App.tsx.
 */
export function useGraphCreation(config: GraphCreationConfig): GraphCreationReturn {
  const {
    rfInstance,
    floatingPanelRef,
    state,
    onEdgeCreated,
    onNodeCreated,
    // addNode is kept in interface for backwards compatibility but not used here
    // Network nodes now use onNodeCreated for undo/redo support
    onNewCustomNode
  } = config;

  const getUsedNodeIds = React.useCallback(() => {
    const ids = new Set<string>();
    for (const node of state.nodes) {
      if (node.id) ids.add(node.id);
    }
    return ids;
  }, [state.nodes]);

  const getUsedNodeNames = React.useCallback(() => {
    const names = new Set<string>();
    for (const node of state.nodes) {
      const data = node.data as Record<string, unknown>;
      const name = data?.label || data?.name;
      if (typeof name === "string" && name) names.add(name);
    }
    return names;
  }, [state.nodes]);

  const getExistingNetworkNodes = React.useCallback(() => {
    const nodes: Array<{ id: string; kind: NetworkType }> = [];
    for (const node of state.nodes) {
      const data = node.data as Record<string, unknown>;
      if (data.role !== "cloud" && data.topoViewerRole !== "cloud") continue;
      const kind = data.kind || data.nodeType;
      if (typeof kind === "string") {
        nodes.push({ id: node.id, kind: kind as NetworkType });
      }
    }
    return nodes;
  }, [state.nodes]);

  // Edge creation - uses ReactFlow's connection API
  // Note: Edge creation is primarily handled through ReactFlow's onConnect callback
  // This function is kept for programmatic edge creation if needed
  const startEdgeCreation = React.useCallback(
    (_nodeId: string) => {
      // Edge creation in ReactFlow is handled through the onConnect callback
      // and the connection line feature. This function could be used to
      // start an interactive edge creation mode if needed.
      void onEdgeCreated;
    },
    [onEdgeCreated]
  );

  const handleCreateLinkFromNode = React.useCallback((_nodeId: string) => {
    // Same as startEdgeCreation - edge creation handled through ReactFlow
  }, []);

  // Node creation state
  const nodeCreationState: NodeCreationState = {
    isLocked: state.isLocked,
    customNodes: state.customNodes,
    defaultNode: state.defaultNode
  };

  // Node creation
  const { createNodeAtPosition } = useNodeCreation(rfInstance, {
    mode: state.mode,
    isLocked: state.isLocked,
    customNodes: state.customNodes,
    defaultNode: state.defaultNode,
    getUsedNodeNames,
    getUsedNodeIds,
    onNodeCreated,
    onLockedClick: () => floatingPanelRef.current?.triggerShake()
  });

  // Node creation handlers (for panel)
  const { handleAddNodeFromPanel } = useNodeCreationHandlers(
    floatingPanelRef,
    nodeCreationState,
    rfInstance,
    createNodeAtPosition,
    onNewCustomNode
  );

  // Network creation callback - uses the same handler as regular nodes (which has undo/redo support)
  // Persistence is handled by snapshot-based undo/redo after graph mutations
  const handleNetworkCreatedCallback = React.useCallback(
    (networkId: string, networkElement: TopoNode, position: Position) => {
      // Delegate to the node created handler which handles persistence and undo/redo
      // The handler detects network nodes by role='cloud' and persists appropriately:
      // - Bridge types (bridge, ovs-bridge): saved to YAML nodes + nodeAnnotations
      // - Other network types (host, vxlan, etc.): saved to networkNodeAnnotations only
      onNodeCreated(networkId, networkElement, position);
    },
    [onNodeCreated]
  );

  // Network creation
  const { createNetworkAtPosition } = useNetworkCreation({
    mode: state.mode,
    isLocked: state.isLocked,
    getExistingNodeIds: getUsedNodeIds,
    getExistingNetworkNodes,
    onNetworkCreated: handleNetworkCreatedCallback,
    onLockedClick: () => floatingPanelRef.current?.triggerShake()
  });

  // Handle adding network from panel
  const handleAddNetworkFromPanel = React.useCallback(
    (networkType?: string) => {
      if (state.isLocked) {
        floatingPanelRef.current?.triggerShake();
        return;
      }
      // Get viewport center for network node placement
      const position = getViewportCenter(rfInstance);
      createNetworkAtPosition(position, (networkType || "host") as NetworkType);
    },
    [rfInstance, state.isLocked, createNetworkAtPosition, floatingPanelRef]
  );

  return {
    startEdgeCreation,
    handleCreateLinkFromNode,
    createNodeAtPosition,
    handleAddNodeFromPanel,
    createNetworkAtPosition,
    handleAddNetworkFromPanel
  };
}
