/**
 * useGraphCreation - Composed hook for node, edge, and network creation
 *
 * Extracts graph creation logic from App.tsx:
 * - Edge creation (useEdgeCreation + handleCreateLinkFromNode)
 * - Node creation (useNodeCreation + useNodeCreationHandlers)
 * - Network creation (useNetworkCreation + handleNetworkCreatedCallback + handleAddNetworkFromPanel)
 */
import React from "react";
import type { Core as CyCore } from "cytoscape";

import { useEdgeCreation } from "../graph/useEdgeCreation";
import { useNodeCreation } from "../graph/useNodeCreation";
import { useNetworkCreation, type NetworkType } from "../graph/useNetworkCreation";
import { useNodeCreationHandlers, type NodeCreationState } from "../panels/useEditorHandlers";
import type { CustomNodeTemplate } from "../../../shared/types/editors";
import type { CyElement } from "../../../shared/types/topology";
import type { FloatingActionPanelHandle } from "../../components/panels/floatingPanel/FloatingActionPanel";

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
type NodeCreatedCallback = (nodeId: string, nodeElement: CyElement, position: Position) => void;

/** Position type */
type Position = { x: number; y: number };

/**
 * Configuration for useGraphCreation hook
 */
export interface GraphCreationConfig {
  cyInstance: CyCore | null;
  floatingPanelRef: React.RefObject<FloatingActionPanelHandle | null>;
  state: {
    mode: "edit" | "view";
    isLocked: boolean;
    customNodes: CustomNodeTemplate[];
    defaultNode: string;
    elements: CyElement[];
  };
  /** Callback when an edge is created */
  onEdgeCreated: EdgeCreatedCallback;
  /** Callback when a node is created */
  onNodeCreated: NodeCreatedCallback;
  /** Callback to add a node element to state */
  addNode: (element: {
    group: "nodes" | "edges";
    data: Record<string, unknown>;
    position?: Position;
    classes?: string;
  }) => void;
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
    cyInstance,
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
    for (const el of state.elements) {
      if (el.group !== "nodes") continue;
      const id = (el.data as Record<string, unknown>)?.id;
      if (typeof id === "string" && id) ids.add(id);
    }
    return ids;
  }, [state.elements]);

  const getUsedNodeNames = React.useCallback(() => {
    const names = new Set<string>();
    for (const el of state.elements) {
      if (el.group !== "nodes") continue;
      const name = (el.data as Record<string, unknown>)?.name;
      if (typeof name === "string" && name) names.add(name);
    }
    return names;
  }, [state.elements]);

  const getExistingNetworkNodes = React.useCallback(() => {
    const nodes: Array<{ id: string; kind: NetworkType }> = [];
    for (const el of state.elements) {
      if (el.group !== "nodes") continue;
      const data = el.data as Record<string, unknown>;
      if (data.topoViewerRole !== "cloud") continue;
      const id = data.id;
      const kind = data.kind;
      if (typeof id === "string" && typeof kind === "string") {
        nodes.push({ id, kind: kind as NetworkType });
      }
    }
    return nodes;
  }, [state.elements]);

  // Edge creation
  const { startEdgeCreation } = useEdgeCreation(cyInstance, {
    mode: state.mode,
    isLocked: state.isLocked,
    onEdgeCreated
  });

  const handleCreateLinkFromNode = React.useCallback(
    (nodeId: string) => {
      startEdgeCreation(nodeId);
    },
    [startEdgeCreation]
  );

  // Node creation state
  const nodeCreationState: NodeCreationState = {
    isLocked: state.isLocked,
    customNodes: state.customNodes,
    defaultNode: state.defaultNode
  };

  // Node creation
  const { createNodeAtPosition } = useNodeCreation(cyInstance, {
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
    cyInstance,
    createNodeAtPosition,
    onNewCustomNode
  );

  // Network creation callback - uses the same handler as regular nodes (which has undo/redo support)
  // The persistence logic is handled in useGraphUndoRedoHandlers based on node type
  const handleNetworkCreatedCallback = React.useCallback(
    (
      networkId: string,
      networkElement: {
        group: "nodes" | "edges";
        data: Record<string, unknown>;
        position?: Position;
        classes?: string;
      },
      position: Position
    ) => {
      // Delegate to the node created handler which handles persistence and undo/redo
      // The handler detects network nodes by topoViewerRole='cloud' and persists appropriately:
      // - Bridge types (bridge, ovs-bridge): saved to YAML nodes + nodeAnnotations
      // - Other network types (host, vxlan, etc.): saved to networkNodeAnnotations only
      onNodeCreated(networkId, networkElement as CyElement, position);
    },
    [onNodeCreated]
  );

  // Network creation
  const { createNetworkAtPosition } = useNetworkCreation(cyInstance, {
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
      if (!cyInstance || state.isLocked) {
        floatingPanelRef.current?.triggerShake();
        return;
      }
      const extent = cyInstance.extent();
      const position = { x: (extent.x1 + extent.x2) / 2, y: (extent.y1 + extent.y2) / 2 };
      createNetworkAtPosition(position, (networkType || "host") as NetworkType);
    },
    [cyInstance, state.isLocked, createNetworkAtPosition, floatingPanelRef]
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
