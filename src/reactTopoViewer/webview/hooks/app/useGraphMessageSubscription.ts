/**
 * useGraphMessageSubscription - Message subscription hook for graph updates
 *
 * Handles extension messages related to graph state:
 * - topology-data: Replace nodes/edges, reinit TopologyIO
 * - node-renamed: Update node ID and edge references
 * - node-data-updated: Update node extraData
 * - edge-stats-update: Update edge extraData (packet stats)
 */
import { useEffect } from "react";
import type { Node, Edge } from "@xyflow/react";

import type { TopoNode, TopoEdge } from "../../../shared/types/graph";
import type {
  EdgeAnnotation,
  FreeTextAnnotation,
  FreeShapeAnnotation,
  GroupStyleAnnotation,
  NodeAnnotation
} from "../../../shared/types/topology";
import { subscribeToWebviewMessages, type TypedMessageEvent } from "../../utils/webviewMessageBus";
import { pruneEdgeAnnotations } from "../../utils/edgeAnnotations";
import { annotationsToNodes } from "../../utils/annotationNodeConverters";
import { applyGroupMembershipToNodes } from "../../utils/groupMembership";
import { isServicesInitialized, getTopologyIO } from "../../services";
import { useGraphStore } from "../../stores/graphStore";
import { useTopoViewerStore } from "../../stores/topoViewerStore";

// ============================================================================
// Message Types
// ============================================================================

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
// Helper Functions
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

// ============================================================================
// Message Handlers
// ============================================================================

function handleTopologyDataMessage(msg: TopologyDataMessage): void {
  const { nodes, edges } = extractNodesAndEdges(msg);
  const { setNodes, setEdges } = useGraphStore.getState();
  const { setEdgeAnnotations } = useTopoViewerStore.getState();

  if (nodes && edges) {
    const data = msg.data;
    const uniqueNodes = buildMergedNodes(
      nodes,
      data?.nodeAnnotations,
      (data?.groupStyleAnnotations ?? []) as GroupStyleAnnotation[],
      data?.freeTextAnnotations ?? [],
      data?.freeShapeAnnotations ?? []
    );
    setNodes(uniqueNodes);
    setEdges(edges as Edge[]);
    reinitializeTopologyIO();
  }

  // Handle edge annotations update
  const rawAnnotations = msg.data?.edgeAnnotations;
  if (Array.isArray(rawAnnotations) && edges) {
    const cleaned = pruneEdgeAnnotations(rawAnnotations, edges);
    setEdgeAnnotations(cleaned);
  }
}

function handleNodeRenamedMessage(msg: NodeRenamedMessage): void {
  if (msg.data?.oldId && msg.data?.newId) {
    const { renameNode } = useGraphStore.getState();
    renameNode(msg.data.oldId, msg.data.newId, msg.data.name);
  }
}

function handleNodeDataUpdatedMessage(msg: NodeDataUpdatedMessage): void {
  if (msg.data?.nodeId && msg.data?.extraData) {
    const { updateNodeData } = useGraphStore.getState();
    updateNodeData(msg.data.nodeId, msg.data.extraData);
  }
}

function handleEdgeStatsUpdateMessage(msg: EdgeStatsUpdateMessage): void {
  const updates = msg.data?.edgeUpdates;
  if (!updates || updates.length === 0) return;

  const { setEdges } = useGraphStore.getState();
  const updateMap = new Map(updates.map((u) => [u.id, u]));
  setEdges((current) => current.map((edge) => applyEdgeStatsToEdge(edge, updateMap)));
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook to subscribe to graph-related extension messages.
 * Should be called once at the app root.
 */
export function useGraphMessageSubscription(): void {
  useEffect(() => {
    const handleMessage = (event: TypedMessageEvent) => {
      const message = event.data as ExtensionMessage | undefined;
      if (!message?.type) return;

      switch (message.type) {
        case "topology-data":
          handleTopologyDataMessage(message as TopologyDataMessage);
          break;
        case "node-renamed":
          handleNodeRenamedMessage(message as NodeRenamedMessage);
          break;
        case "node-data-updated":
          handleNodeDataUpdatedMessage(message as NodeDataUpdatedMessage);
          break;
        case "edge-stats-update":
          handleEdgeStatsUpdateMessage(message as EdgeStatsUpdateMessage);
          break;
      }
    };

    return subscribeToWebviewMessages(handleMessage);
  }, []);
}
