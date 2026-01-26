/**
 * GraphContext - Single source of truth for React Flow graph state
 *
 * This context owns the React Flow nodes/edges state and provides
 * all graph manipulation operations. React Flow is the source of truth.
 */
import React, { createContext, useContext, useCallback, useMemo, useEffect, useRef } from "react";
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
interface GraphContextValue extends GraphState, GraphActions {}

const GraphContext = createContext<GraphContextValue | undefined>(undefined);

/**
 * Props for GraphProvider
 */
interface GraphProviderProps {
  children: React.ReactNode;
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

/**
 * GraphProvider - Provides React Flow state management
 */
export const GraphProvider: React.FC<GraphProviderProps> = ({
  children,
  initialNodes = [],
  initialEdges = [],
  onEdgeAnnotationsUpdate
}) => {
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
    const handleMessage = (event: TypedMessageEvent) => {
      const message = event.data as ExtensionMessage | undefined;
      if (!message?.type) return;

      if (message.type === "topology-data") {
        const msg = message as TopologyDataMessage;
        const newNodes = msg.nodes || msg.data?.nodes;
        const newEdges = msg.edges || msg.data?.edges;
        const rawEdgeAnnotations = msg.data?.edgeAnnotations;
        const nodeAnnotations = msg.data?.nodeAnnotations;
        const groupStyleAnnotations = msg.data?.groupStyleAnnotations ?? [];

        if (newNodes && newEdges) {
          const topoWithMembership = applyGroupMembershipToNodes(
            newNodes as TopoNode[],
            nodeAnnotations,
            groupStyleAnnotations as GroupStyleAnnotation[]
          );
          const annotationNodes = annotationsToNodes(
            msg.data?.freeTextAnnotations ?? [],
            msg.data?.freeShapeAnnotations ?? [],
            groupStyleAnnotations as GroupStyleAnnotation[]
          );
          const mergedNodes = [...(topoWithMembership as Node[]), ...(annotationNodes as Node[])];
          // Deduplicate by id in case annotations are already included
          const uniqueNodes = Array.from(new Map(mergedNodes.map((n) => [n.id, n])).values());

          setNodes(uniqueNodes);
          setEdges(newEdges as Edge[]);

          // Reinitialize TopologyIO for external file changes
          const yamlFilePath = (window as { __INITIAL_DATA__?: { yamlFilePath?: string } })
            .__INITIAL_DATA__?.yamlFilePath;
          if (yamlFilePath && isServicesInitialized()) {
            const topologyIO = getTopologyIO();
            void topologyIO.initializeFromFile(yamlFilePath);
          }
        }

        // Handle edge annotations
        if (Array.isArray(rawEdgeAnnotations) && newEdges && onEdgeAnnotationsUpdate) {
          const cleaned = pruneEdgeAnnotations(rawEdgeAnnotations, newEdges as TopoEdge[]);
          onEdgeAnnotationsUpdate(cleaned);
        }
      }

      if (message.type === "node-renamed") {
        const msg = message as NodeRenamedMessage;
        if (msg.data?.oldId && msg.data?.newId) {
          renameNode(msg.data.oldId, msg.data.newId, msg.data.name);
        }
      }

      if (message.type === "node-data-updated") {
        const msg = message as NodeDataUpdatedMessage;
        if (msg.data?.nodeId && msg.data?.extraData) {
          updateNodeData(msg.data.nodeId, msg.data.extraData);
        }
      }

      if (message.type === "edge-stats-update") {
        const msg = message as EdgeStatsUpdateMessage;
        const updates = msg.data?.edgeUpdates;
        if (updates && updates.length > 0) {
          const updateMap = new Map(updates.map((u) => [u.id, u]));
          setEdges((current) =>
            current.map((edge) => {
              const update = updateMap.get(edge.id);
              if (!update) return edge;
              const oldExtraData = ((edge.data as Record<string, unknown>)?.extraData ??
                {}) as Record<string, unknown>;
              const newExtraData = { ...oldExtraData, ...update.extraData };
              return {
                ...edge,
                data: { ...edge.data, extraData: newExtraData },
                className: update.classes ?? edge.className
              };
            })
          );
        }
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

  const value = useMemo<GraphContextValue>(
    () => ({
      nodes,
      edges,
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
      nodes,
      edges,
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

  return <GraphContext.Provider value={value}>{children}</GraphContext.Provider>;
};

/**
 * Hook to access graph state and actions
 */
export function useGraph(): GraphContextValue {
  const context = useContext(GraphContext);
  if (!context) {
    throw new Error("useGraph must be used within a GraphProvider");
  }
  return context;
}

/**
 * Hook for graph state only (for components that only read)
 */
export function useGraphState(): GraphState {
  const { nodes, edges } = useGraph();
  return useMemo(() => ({ nodes, edges }), [nodes, edges]);
}

/**
 * Hook for graph actions only (stable reference)
 */
export function useGraphActions(): GraphActions {
  const context = useGraph();
  return useMemo(
    () => ({
      setNodes: context.setNodes,
      setEdges: context.setEdges,
      onNodesChange: context.onNodesChange,
      onEdgesChange: context.onEdgesChange,
      addNode: context.addNode,
      addEdge: context.addEdge,
      removeNode: context.removeNode,
      removeEdge: context.removeEdge,
      removeNodeAndEdges: context.removeNodeAndEdges,
      updateNodePositions: context.updateNodePositions,
      updateNodeData: context.updateNodeData,
      renameNode: context.renameNode,
      updateNode: context.updateNode,
      replaceNode: context.replaceNode,
      updateEdge: context.updateEdge,
      updateEdgeData: context.updateEdgeData
    }),
    [context]
  );
}
