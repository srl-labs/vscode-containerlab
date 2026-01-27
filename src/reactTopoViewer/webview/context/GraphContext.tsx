/**
 * GraphContext - Single source of truth for React Flow graph state
 *
 * This context owns the React Flow nodes/edges state and provides
 * all graph manipulation operations. React Flow is the source of truth.
 */
import React, { useCallback, useMemo, useEffect, useRef } from "react";
import { useNodesState, useEdgesState } from "@xyflow/react";
import type { Node, Edge, OnNodesChange, OnEdgesChange } from "@xyflow/react";

import type { TopoNode, TopoEdge } from "../../shared/types/graph";
import type {
  EdgeAnnotation,
  NodeAnnotation,
  GroupStyleAnnotation,
  FreeTextAnnotation,
  FreeShapeAnnotation
} from "../../shared/types/topology";
import { subscribeToWebviewMessages, type TypedMessageEvent } from "../utils/webviewMessageBus";
import { pruneEdgeAnnotations } from "../utils/edgeAnnotations";
import { annotationsToNodes } from "../utils/annotationNodeConverters";
import { applyGroupMembershipToNodes } from "../utils/groupMembership";
import { isServicesInitialized, getTopologyIO } from "../services";
import { useAppActionsSelector, useAppSelector } from "./AppContext";

/**
 * Graph state interface
 */
export interface GraphState {
  nodes: Node[];
  edges: Edge[];
}

/**
 * Graph actions interface
 */
export interface GraphActions {
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  addNode: (node: TopoNode) => void;
  addEdge: (edge: TopoEdge) => void;
  removeNode: (nodeId: string) => void;
  removeEdge: (edgeId: string) => void;
  removeNodeAndEdges: (nodeId: string) => void;
  updateNodePositions: (
    positions: Array<{ id: string; position: { x: number; y: number } }>
  ) => void;
  updateNodeData: (nodeId: string, data: Partial<Record<string, unknown>>) => void;
  renameNode: (oldId: string, newId: string, name?: string) => void;
  /** Update any node properties (position, dimensions, data) */
  updateNode: (nodeId: string, updates: Partial<Node>) => void;
  /** Replace a node entirely (for annotation updates) */
  replaceNode: (nodeId: string, newNode: Node) => void;
  /** Update any edge properties (data, endpoints, style) */
  updateEdge: (edgeId: string, updates: Partial<Edge>) => void;
  /** Update edge data (merged) */
  updateEdgeData: (edgeId: string, data: Partial<Record<string, unknown>>) => void;
}

/**
 * Combined context value
 */
export type GraphContextValue = GraphState & GraphActions;

/**
 * Props for graph model
 */
export interface GraphModelProps {
  initialNodes?: TopoNode[];
  initialEdges?: TopoEdge[];
  onEdgeAnnotationsUpdate?: (annotations: EdgeAnnotation[]) => void;
}

/**
 * Extension message types for graph updates
 */
interface TopologyDataMessage {
  type: "topology-data";
  nodes?: TopoNode[];
  edges?: TopoEdge[];
  data?: {
    nodes?: TopoNode[];
    edges?: TopoEdge[];
    edgeAnnotations?: EdgeAnnotation[];
    freeTextAnnotations?: FreeTextAnnotation[];
    freeShapeAnnotations?: FreeShapeAnnotation[];
    groupStyleAnnotations?: GroupStyleAnnotation[];
    nodeAnnotations?: NodeAnnotation[];
  };
}

interface NodeRenamedMessage {
  type: "node-renamed";
  data?: { oldId?: string; newId?: string; name?: string };
}

interface NodeDataUpdatedMessage {
  type: "node-data-updated";
  data?: { nodeId?: string; extraData?: Record<string, unknown> };
}

interface EdgeStatsUpdateMessage {
  type: "edge-stats-update";
  data?: {
    edgeUpdates?: Array<{
      id: string;
      extraData: Record<string, unknown>;
      classes?: string;
    }>;
  };
}

type ExtensionMessage =
  | TopologyDataMessage
  | NodeRenamedMessage
  | NodeDataUpdatedMessage
  | EdgeStatsUpdateMessage
  | { type: string };

// ============================================================================
// Message handler helpers (extracted for complexity reduction)
// ============================================================================

/** Apply edge stats update to a single edge */
function applyEdgeStatsToEdge(
  edge: Edge,
  updateMap: Map<string, { id: string; extraData: Record<string, unknown>; classes?: string }>
): Edge {
  const update = updateMap.get(edge.id);
  if (!update) return edge;
  const oldExtraData = ((edge.data as Record<string, unknown>)?.extraData ?? {}) as Record<
    string,
    unknown
  >;
  const newExtraData = { ...oldExtraData, ...update.extraData };
  return {
    ...edge,
    data: { ...edge.data, extraData: newExtraData },
    className: update.classes ?? edge.className
  };
}

/** Context for topology data message handling */
interface TopologyDataContext {
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  onEdgeAnnotationsUpdate?: (annotations: EdgeAnnotation[]) => void;
}

/** Build merged nodes from topology and annotations */
function buildMergedNodes(
  newNodes: TopoNode[],
  nodeAnnotations: NodeAnnotation[] | undefined,
  groupStyleAnnotations: GroupStyleAnnotation[],
  freeTextAnnotations: FreeTextAnnotation[],
  freeShapeAnnotations: FreeShapeAnnotation[]
): Node[] {
  const topoWithMembership = applyGroupMembershipToNodes(
    newNodes,
    nodeAnnotations,
    groupStyleAnnotations
  );
  const annotationNodes = annotationsToNodes(
    freeTextAnnotations,
    freeShapeAnnotations,
    groupStyleAnnotations
  );
  const mergedNodes = [...(topoWithMembership as Node[]), ...(annotationNodes as Node[])];
  // Deduplicate by id in case annotations are already included
  return Array.from(new Map(mergedNodes.map((n) => [n.id, n])).values());
}

/** Reinitialize TopologyIO for external file changes */
function reinitializeTopologyIO(): void {
  const yamlFilePath = (window as { __INITIAL_DATA__?: { yamlFilePath?: string } }).__INITIAL_DATA__
    ?.yamlFilePath;
  if (yamlFilePath && isServicesInitialized()) {
    const topologyIO = getTopologyIO();
    void topologyIO.initializeFromFile(yamlFilePath);
  }
}

/** Extract nodes and edges from topology data message */
function extractNodesAndEdges(msg: TopologyDataMessage): {
  nodes: TopoNode[] | undefined;
  edges: TopoEdge[] | undefined;
} {
  const nodes = msg.nodes || msg.data?.nodes;
  const edges = msg.edges || msg.data?.edges;
  return { nodes: nodes as TopoNode[] | undefined, edges: edges as TopoEdge[] | undefined };
}

/** Apply graph state update from topology data */
function applyGraphStateUpdate(
  nodes: TopoNode[],
  edges: TopoEdge[],
  msg: TopologyDataMessage,
  ctx: TopologyDataContext
): void {
  const data = msg.data;
  const uniqueNodes = buildMergedNodes(
    nodes,
    data?.nodeAnnotations,
    (data?.groupStyleAnnotations ?? []) as GroupStyleAnnotation[],
    data?.freeTextAnnotations ?? [],
    data?.freeShapeAnnotations ?? []
  );
  ctx.setNodes(uniqueNodes);
  ctx.setEdges(edges as Edge[]);
  reinitializeTopologyIO();
}

/** Apply edge annotations update if available */
function applyEdgeAnnotationsUpdate(
  rawAnnotations: EdgeAnnotation[] | undefined,
  edges: TopoEdge[] | undefined,
  onUpdate: ((annotations: EdgeAnnotation[]) => void) | undefined
): void {
  if (!Array.isArray(rawAnnotations) || !edges || !onUpdate) return;
  const cleaned = pruneEdgeAnnotations(rawAnnotations, edges);
  onUpdate(cleaned);
}

/** Handle topology-data message */
function handleTopologyDataMessage(msg: TopologyDataMessage, ctx: TopologyDataContext): void {
  const { nodes, edges } = extractNodesAndEdges(msg);

  if (nodes && edges) {
    applyGraphStateUpdate(nodes, edges, msg, ctx);
  }

  applyEdgeAnnotationsUpdate(msg.data?.edgeAnnotations, edges, ctx.onEdgeAnnotationsUpdate);
}

/** Handle node-renamed message */
function handleNodeRenamedMessage(
  msg: NodeRenamedMessage,
  renameNode: (oldId: string, newId: string, name?: string) => void
): void {
  if (msg.data?.oldId && msg.data?.newId) {
    renameNode(msg.data.oldId, msg.data.newId, msg.data.name);
  }
}

/** Handle node-data-updated message */
function handleNodeDataUpdatedMessage(
  msg: NodeDataUpdatedMessage,
  updateNodeData: (nodeId: string, data: Partial<Record<string, unknown>>) => void
): void {
  if (msg.data?.nodeId && msg.data?.extraData) {
    updateNodeData(msg.data.nodeId, msg.data.extraData);
  }
}

/** Handle edge-stats-update message */
function handleEdgeStatsUpdateMessage(
  msg: EdgeStatsUpdateMessage,
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>
): void {
  const updates = msg.data?.edgeUpdates;
  if (!updates || updates.length === 0) return;

  const updateMap = new Map(updates.map((u) => [u.id, u]));
  setEdges((current) => current.map((edge) => applyEdgeStatsToEdge(edge, updateMap)));
}

// ============================================================================
// Graph Model
// ============================================================================

/**
 * Graph model - Provides React Flow state management
 */
export function useGraphModel({
  initialNodes = [],
  initialEdges = [],
  onEdgeAnnotationsUpdate
}: GraphModelProps): { state: GraphState; actions: GraphActions } {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(initialNodes as Node[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initialEdges as Edge[]);

  // Track if we've received initial data to avoid duplicate processing
  const initializedRef = useRef(false);

  // Add a node (with duplicate check)
  const addNode = useCallback(
    (node: TopoNode) => {
      setNodes((current) => {
        if (current.some((n) => n.id === node.id)) return current;
        return [...current, node as Node];
      });
    },
    [setNodes]
  );

  // Add an edge (with duplicate check)
  const addEdge = useCallback(
    (edge: TopoEdge) => {
      setEdges((current) => {
        if (current.some((e) => e.id === edge.id)) return current;
        return [...current, edge as Edge];
      });
    },
    [setEdges]
  );

  // Remove a node by ID
  const removeNode = useCallback(
    (nodeId: string) => {
      setNodes((current) => current.filter((n) => n.id !== nodeId));
    },
    [setNodes]
  );

  // Remove an edge by ID
  const removeEdge = useCallback(
    (edgeId: string) => {
      setEdges((current) => current.filter((e) => e.id !== edgeId));
    },
    [setEdges]
  );

  // Remove a node and all connected edges
  const removeNodeAndEdges = useCallback(
    (nodeId: string) => {
      setNodes((current) => current.filter((n) => n.id !== nodeId));
      setEdges((current) => current.filter((e) => e.source !== nodeId && e.target !== nodeId));
    },
    [setNodes, setEdges]
  );

  // Update node positions (batch)
  const updateNodePositions = useCallback(
    (positions: Array<{ id: string; position: { x: number; y: number } }>) => {
      if (positions.length === 0) return;
      const updates = new Map(positions.map((p) => [p.id, p.position]));
      setNodes((current) =>
        current.map((node) => {
          const pos = updates.get(node.id);
          if (!pos) return node;
          return { ...node, position: pos };
        })
      );
    },
    [setNodes]
  );

  // Update node data
  const updateNodeData = useCallback(
    (nodeId: string, extraData: Partial<Record<string, unknown>>) => {
      setNodes((current) =>
        current.map((node) => {
          if (node.id !== nodeId) return node;
          const currentData = node.data as Record<string, unknown>;
          const updatedData: Record<string, unknown> = {
            ...currentData,
            extraData
          };
          // Also update top-level visual properties
          if (extraData.topoViewerRole !== undefined) {
            updatedData.role = extraData.topoViewerRole;
          }
          if (extraData.iconColor !== undefined) {
            updatedData.iconColor = extraData.iconColor;
          }
          if (extraData.iconCornerRadius !== undefined) {
            updatedData.iconCornerRadius = extraData.iconCornerRadius;
          }
          return { ...node, data: updatedData };
        })
      );
    },
    [setNodes]
  );

  // Rename a node (updates ID and edge references)
  const renameNode = useCallback(
    (oldId: string, newId: string, name?: string) => {
      const nextName = name ?? newId;
      setNodes((current) =>
        current.map((node) => {
          if (node.id !== oldId) return node;
          return {
            ...node,
            id: newId,
            data: { ...node.data, label: nextName }
          };
        })
      );
      setEdges((current) =>
        current.map((edge) => {
          if (edge.source !== oldId && edge.target !== oldId) return edge;
          return {
            ...edge,
            source: edge.source === oldId ? newId : edge.source,
            target: edge.target === oldId ? newId : edge.target
          };
        })
      );
    },
    [setNodes, setEdges]
  );

  // Update any node properties (for annotation nodes)
  const updateNode = useCallback(
    (nodeId: string, updates: Partial<Node>) => {
      setNodes((current) =>
        current.map((node) => {
          if (node.id !== nodeId) return node;
          // Merge data if provided
          const mergedData = updates.data ? { ...node.data, ...updates.data } : node.data;
          return { ...node, ...updates, data: mergedData };
        })
      );
    },
    [setNodes]
  );

  // Replace a node entirely
  const replaceNode = useCallback(
    (nodeId: string, newNode: Node) => {
      setNodes((current) => current.map((node) => (node.id === nodeId ? newNode : node)));
    },
    [setNodes]
  );

  // Update any edge properties
  const updateEdge = useCallback(
    (edgeId: string, updates: Partial<Edge>) => {
      setEdges((current) =>
        current.map((edge) => {
          if (edge.id !== edgeId) return edge;
          const mergedData = updates.data
            ? { ...edge.data, ...(updates.data as Record<string, unknown>) }
            : edge.data;
          return { ...edge, ...updates, data: mergedData };
        })
      );
    },
    [setEdges]
  );

  // Update edge data only (merged)
  const updateEdgeData = useCallback(
    (edgeId: string, data: Partial<Record<string, unknown>>) => {
      updateEdge(edgeId, { data });
    },
    [updateEdge]
  );

  // Handle extension messages
  useEffect(() => {
    const ctx: TopologyDataContext = { setNodes, setEdges, onEdgeAnnotationsUpdate };

    const handleMessage = (event: TypedMessageEvent) => {
      const message = event.data as ExtensionMessage | undefined;
      if (!message?.type) return;

      switch (message.type) {
        case "topology-data":
          handleTopologyDataMessage(message as TopologyDataMessage, ctx);
          break;
        case "node-renamed":
          handleNodeRenamedMessage(message as NodeRenamedMessage, renameNode);
          break;
        case "node-data-updated":
          handleNodeDataUpdatedMessage(message as NodeDataUpdatedMessage, updateNodeData);
          break;
        case "edge-stats-update":
          handleEdgeStatsUpdateMessage(message as EdgeStatsUpdateMessage, setEdges);
          break;
      }
    };

    return subscribeToWebviewMessages(handleMessage);
  }, [setNodes, setEdges, renameNode, updateNodeData, onEdgeAnnotationsUpdate]);

  // Set initialized flag
  useEffect(() => {
    if (!initializedRef.current && initialNodes.length > 0) {
      initializedRef.current = true;
    }
  }, [initialNodes]);

  const state = useMemo<GraphState>(() => ({ nodes, edges }), [nodes, edges]);

  const actions = useMemo<GraphActions>(
    () => ({
      setNodes,
      setEdges,
      onNodesChange,
      onEdgesChange,
      addNode,
      addEdge,
      removeNode,
      removeEdge,
      removeNodeAndEdges,
      updateNodePositions,
      updateNodeData,
      renameNode,
      updateNode,
      replaceNode,
      updateEdge,
      updateEdgeData
    }),
    [
      setNodes,
      setEdges,
      onNodesChange,
      onEdgesChange,
      addNode,
      addEdge,
      removeNode,
      removeEdge,
      removeNodeAndEdges,
      updateNodePositions,
      updateNodeData,
      renameNode,
      updateNode,
      replaceNode,
      updateEdge,
      updateEdgeData
    ]
  );

  return { state, actions };
}

/**
 * Hook to access graph state and actions
 */
export function useGraph(): GraphContextValue {
  const graphState = useAppSelector((state) => state.graph);
  const graphActions = useAppActionsSelector((actions) => actions.graph);
  return useMemo(() => ({ ...graphState, ...graphActions }), [graphState, graphActions]);
}

/**
 * Hook for graph state only (for components that only read)
 */
export function useGraphState(): GraphState {
  return useAppSelector((state) => state.graph);
}

/**
 * Hook for graph actions only (stable reference)
 */
export function useGraphActions(): GraphActions {
  return useAppActionsSelector((actions) => actions.graph);
}
