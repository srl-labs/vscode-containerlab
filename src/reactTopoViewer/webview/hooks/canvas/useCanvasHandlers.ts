/**
 * Canvas event handlers for ReactFlowCanvas
 * Comprehensive handlers for all canvas interactions
 */
import type React from "react";
import { useCallback, useRef, useState } from "react";
import {
  type ReactFlowInstance,
  type OnNodesChange,
  type NodeMouseHandler,
  type EdgeMouseHandler,
  type OnConnect,
  type OnSelectionChangeFunc,
  type Connection,
  type Node,
  type Edge,
  type NodeChange,
  type NodePositionChange,
  type XYPosition
} from "@xyflow/react";

import type { TopoNode, TopoEdge, FreeShapeNodeData } from "../../../shared/types/graph";
import { log } from "../../utils/logger";
import { isLineHandleActive } from "../../components/canvas/nodes/AnnotationHandles";
import {
  FREE_TEXT_NODE_TYPE,
  FREE_SHAPE_NODE_TYPE,
  GROUP_NODE_TYPE,
  isAnnotationNodeType
} from "../../annotations/annotationNodeConverters";
import { DEFAULT_LINE_LENGTH } from "../../annotations/constants";
import {
  saveAnnotationNodesFromGraph,
  saveNodePositions,
  saveNodePositionsWithAnnotations
} from "../../services";
import { useGraphStore } from "../../stores/graphStore";
import { allocateEndpointsForLink } from "../../utils/endpointAllocator";
import { buildEdgeId } from "../../utils/edgeId";
import { snapToGrid } from "../../utils/grid";

/** Handlers for group member movement during drag */
export interface GroupMemberHandlers {
  /** Get member node IDs for a group */
  getGroupMembers?: (groupId: string, options?: { includeNested?: boolean }) => string[];
  /** Handle node dropped (for group membership updates) */
  onNodeDropped?: (nodeId: string, position: { x: number; y: number }) => void;
}

interface CanvasHandlersConfig {
  selectNode: (id: string | null) => void;
  selectEdge: (id: string | null) => void;
  editNode: (id: string | null) => void;
  editNetwork: (id: string | null) => void;
  editEdge: (id: string | null) => void;
  mode: "view" | "edit";
  isLocked: boolean;
  onNodesChangeBase: OnNodesChange;
  onLockedAction?: () => void;
  /** Current nodes (needed for position tracking) */
  nodes?: Node[];
  /** Direct setNodes for member node updates (bypasses React Flow drag tracking) */
  setNodes?: React.Dispatch<React.SetStateAction<Node[]>>;
  /** Callback when an edge is created via drag-to-connect */
  onEdgeCreated?: (
    sourceId: string,
    targetId: string,
    edgeData: {
      id: string;
      source: string;
      target: string;
      sourceEndpoint: string;
      targetEndpoint: string;
    }
  ) => void;
  /** Handlers for group member movement */
  groupMemberHandlers?: GroupMemberHandlers;
  /** Optional shared React Flow instance ref */
  reactFlowInstanceRef?: React.RefObject<ReactFlowInstance | null>;
  /** Geo layout support */
  geoLayout?: {
    isGeoLayout: boolean;
    isEditable: boolean;
    getGeoUpdateForNode?: (node: Node) => {
      geoCoordinates?: { lat: number; lng: number };
      endGeoCoordinates?: { lat: number; lng: number };
    } | null;
  };
}

interface ContextMenuState {
  type: "node" | "edge" | "pane" | null;
  position: { x: number; y: number };
  targetId: string | null;
}

interface CanvasHandlers {
  reactFlowInstance: React.RefObject<ReactFlowInstance | null>;
  onInit: (instance: ReactFlowInstance) => void;
  onNodeClick: NodeMouseHandler;
  onNodeDoubleClick: NodeMouseHandler;
  onEdgeClick: EdgeMouseHandler;
  onEdgeDoubleClick: EdgeMouseHandler;
  onPaneClick: (event: React.MouseEvent) => void;
  onConnect: OnConnect;
  handleNodesChange: OnNodesChange;
  onSelectionChange: OnSelectionChangeFunc;
  onNodeContextMenu: (event: React.MouseEvent, node: Node) => void;
  onEdgeContextMenu: (event: React.MouseEvent, edge: Edge) => void;
  onPaneContextMenu: (event: MouseEvent | React.MouseEvent) => void;
  onNodeDragStart: NodeMouseHandler;
  onNodeDrag: NodeMouseHandler;
  onNodeDragStop: NodeMouseHandler;
  contextMenu: ContextMenuState;
  closeContextMenu: () => void;
}

const NODE_TYPE_TOPOLOGY = "topology-node";
const NODE_TYPE_NETWORK = "network-node";
const EDITABLE_NODE_TYPES = [NODE_TYPE_TOPOLOGY, NODE_TYPE_NETWORK];

// ============================================================================
// Line drag helpers
// ============================================================================

interface LineDragSnapshot {
  nodePosition: XYPosition;
  startPosition: XYPosition;
  endPosition: XYPosition;
}

function isLineShapeNode(node: Node): node is Node<FreeShapeNodeData> {
  if (node.type !== FREE_SHAPE_NODE_TYPE) return false;
  const data = node.data as FreeShapeNodeData | undefined;
  return data?.shapeType === "line";
}

function getLineEndpoints(node: Node): { start: XYPosition; end: XYPosition } | null {
  if (!isLineShapeNode(node)) return null;
  const data = node.data as FreeShapeNodeData;
  const start = data.startPosition ?? node.position;
  const end =
    data.endPosition ?? {
      x: start.x + DEFAULT_LINE_LENGTH,
      y: start.y
    };
  return {
    start: { x: start.x, y: start.y },
    end: { x: end.x, y: end.y }
  };
}

function recordLineDragSnapshot(
  snapshots: Map<string, LineDragSnapshot>,
  node: Node
): void {
  const endpoints = getLineEndpoints(node);
  if (!endpoints) return;
  snapshots.set(node.id, {
    nodePosition: { x: node.position.x, y: node.position.y },
    startPosition: endpoints.start,
    endPosition: endpoints.end
  });
}

function collectLineDragNodes(
  draggedNode: Node,
  nodes: Node[] | undefined,
  groupMemberHandlers?: GroupMemberHandlers
): Node[] {
  if (!nodes) {
    return isLineShapeNode(draggedNode) ? [draggedNode] : [];
  }

  if (draggedNode.type === GROUP_NODE_TYPE && groupMemberHandlers?.getGroupMembers) {
    const memberIds = groupMemberHandlers.getGroupMembers(draggedNode.id, { includeNested: true });
    return memberIds
      .map((id) => nodes.find((node) => node.id === id))
      .filter((node): node is Node => Boolean(node))
      .filter(isLineShapeNode);
  }

  const selectedLines = nodes.filter((node) => node.selected && isLineShapeNode(node));
  if (selectedLines.length > 0) return selectedLines;
  return isLineShapeNode(draggedNode) ? [draggedNode] : [];
}

function applyLineDragSnapshots(snapshots: Map<string, LineDragSnapshot>): void {
  if (snapshots.size === 0) return;
  const currentNodes = useGraphStore.getState().nodes;
  const updateNode = useGraphStore.getState().updateNode;

  for (const [id, snapshot] of snapshots) {
    const currentNode = currentNodes.find((node) => node.id === id);
    if (!currentNode) continue;
    const dx = currentNode.position.x - snapshot.nodePosition.x;
    const dy = currentNode.position.y - snapshot.nodePosition.y;
    if (dx === 0 && dy === 0) continue;
    updateNode(id, {
      data: {
        startPosition: {
          x: snapshot.startPosition.x + dx,
          y: snapshot.startPosition.y + dy
        },
        endPosition: {
          x: snapshot.endPosition.x + dx,
          y: snapshot.endPosition.y + dy
        }
      }
    });
  }

  snapshots.clear();
}

// ============================================================================
// Node drag stop helpers (extracted for complexity reduction)
// ============================================================================

/** Build position changes for group members */
function buildGroupMemberChanges(
  _node: Node,
  members: string[],
  nodes: Node[] | undefined
): NodeChange[] {
  const changes: NodeChange[] = [];
  for (const memberId of members) {
    const memberNode = nodes?.find((n) => n.id === memberId);
    if (memberNode) {
      changes.push({
        type: "position",
        id: memberId,
        position: memberNode.position,
        dragging: false
      });
    }
  }
  return changes;
}

function buildSelectedNodeChanges(
  draggedNodeId: string,
  nodes: Node[] | undefined,
  excludeIds: Set<string>,
  delta?: XYPosition
): NodeChange[] {
  if (!nodes) return [];
  const changes: NodeChange[] = [];
  for (const node of nodes) {
    if (node.id === draggedNodeId) continue;
    if (!node.selected) continue;
    if (excludeIds.has(node.id)) continue;
    const position = delta
      ? { x: node.position.x + delta.x, y: node.position.y + delta.y }
      : node.position;
    changes.push({ type: "position", id: node.id, position, dragging: false });
  }
  return changes;
}

function isNodePositionChange(change: NodeChange): change is NodePositionChange {
  return change.type === "position" && change.position !== undefined;
}

/** Clean up group tracking refs */
function cleanupGroupRefs(
  nodeId: string,
  groupMembersRef: React.RefObject<Map<string, string[]>>,
  groupLastPositionRef: React.RefObject<Map<string, XYPosition>>
): void {
  groupMembersRef.current?.delete(nodeId);
  groupLastPositionRef.current?.delete(nodeId);
}

function updateNodeWithGeoData(
  setNodes: React.Dispatch<React.SetStateAction<Node[]>> | undefined,
  nodeId: string,
  update: {
    geoCoordinates?: { lat: number; lng: number };
    endGeoCoordinates?: { lat: number; lng: number };
  }
) {
  if (!setNodes) return;
  setNodes((latestNodes) => applyGeoUpdateToNodeList(latestNodes, nodeId, update));
}

function applyGeoUpdateToNodeList(
  nodes: Node[],
  nodeId: string,
  update: {
    geoCoordinates?: { lat: number; lng: number };
    endGeoCoordinates?: { lat: number; lng: number };
  }
): Node[] {
  return nodes.map((n) => {
    if (n.id !== nodeId) return n;
    const data = (n.data ?? {}) as Record<string, unknown>;
    return {
      ...n,
      data: {
        ...data,
        ...(update.geoCoordinates ? { geoCoordinates: update.geoCoordinates } : {}),
        ...(update.endGeoCoordinates ? { endGeoCoordinates: update.endGeoCoordinates } : {})
      }
    };
  });
}

function saveGeoUpdate(
  currentNodes: Node[],
  nodeId: string,
  update: {
    geoCoordinates?: { lat: number; lng: number };
    endGeoCoordinates?: { lat: number; lng: number };
  }
) {
  const nodeTypeMap = new Map(currentNodes.map((n) => [n.id, n.type]));
  const isAnnotation = isAnnotationNodeType(nodeTypeMap.get(nodeId));

  if (isAnnotation) {
    const nodesForSave = applyGeoUpdateToNodeList(currentNodes, nodeId, update);
    void saveAnnotationNodesFromGraph(nodesForSave);
    return;
  }

  if (update.geoCoordinates) {
    void saveNodePositions([{ id: nodeId, geoCoordinates: update.geoCoordinates }]);
  }
}

function handleGeoDragStop(
  node: Node,
  onNodesChangeBase: OnNodesChange,
  setNodes: React.Dispatch<React.SetStateAction<Node[]>> | undefined,
  geoLayout: CanvasHandlersConfig["geoLayout"]
): boolean {
  const isGeoEdit = geoLayout?.isGeoLayout && geoLayout.isEditable;
  if (!isGeoEdit || !geoLayout?.getGeoUpdateForNode) return false;

  const draggedPosition = node.position;
  log.info(
    `[ReactFlowCanvas] Node ${node.id} dragged to geo position ${draggedPosition.x}, ${draggedPosition.y}`
  );

  const changes: NodeChange[] = [
    { type: "position", id: node.id, position: draggedPosition, dragging: false }
  ];
  onNodesChangeBase(changes);

  const currentNodes = useGraphStore.getState().nodes;
  const storeNode = currentNodes.find((n) => n.id === node.id);
  if (!storeNode) return true;

  const movedNode = { ...storeNode, position: draggedPosition };
  const update = geoLayout.getGeoUpdateForNode(movedNode);
  if (!update?.geoCoordinates && !update?.endGeoCoordinates) return true;

  updateNodeWithGeoData(setNodes, node.id, update);
  saveGeoUpdate(currentNodes, node.id, update);
  return true;
}

function finalizeGroupChanges(
  node: Node,
  nodes: Node[] | undefined,
  groupMembersRef: React.RefObject<Map<string, string[]>>,
  groupLastPositionRef: React.RefObject<Map<string, XYPosition>>
): NodeChange[] {
  const memberIds = groupMembersRef.current.get(node.id) ?? [];
  const memberChanges = buildGroupMemberChanges(node, memberIds, nodes);
  cleanupGroupRefs(node.id, groupMembersRef, groupLastPositionRef);
  return memberChanges;
}

function persistPositionChanges(changes: NodeChange[]) {
  const currentNodes = useGraphStore.getState().nodes;
  const nodeTypeMap = new Map(currentNodes.map((n) => [n.id, n.type]));
  const movedPositions = changes
    .filter(isNodePositionChange)
    .map((change) => ({ id: change.id, position: change.position }));

  const topoPositions = movedPositions.filter(
    (pos) => !isAnnotationNodeType(nodeTypeMap.get(pos.id))
  );
  const movedAnnotations = movedPositions.some((pos) =>
    isAnnotationNodeType(nodeTypeMap.get(pos.id))
  );

  // When both topology positions and annotations are moved together (e.g., group with members),
  // save them in a single command to create one undo entry
  if (topoPositions.length > 0 && movedAnnotations) {
    void saveNodePositionsWithAnnotations(topoPositions, currentNodes);
    return;
  }

  if (topoPositions.length > 0) {
    void saveNodePositions(topoPositions);
  }

  if (movedAnnotations) {
    // Use applySnapshot: false to prevent snapshot re-apply from reverting local changes
    void saveAnnotationNodesFromGraph(currentNodes, { applySnapshot: false });
  }
}

/** Hook for node drag handlers with group member movement */
function useNodeDragHandlers(
  isLockedRef: React.RefObject<boolean>,
  nodes: Node[] | undefined,
  onNodesChangeBase: OnNodesChange,
  setNodes: React.Dispatch<React.SetStateAction<Node[]>> | undefined,
  groupMemberHandlers?: GroupMemberHandlers,
  geoLayout?: CanvasHandlersConfig["geoLayout"]
) {
  // Track the last position of a dragging group to compute delta
  const groupLastPositionRef = useRef<Map<string, XYPosition>>(new Map());
  // Track member IDs that are being moved with a group
  const groupMembersRef = useRef<Map<string, string[]>>(new Map());
  const lineDragStartRef = useRef<Map<string, LineDragSnapshot>>(new Map());

  const onNodeDragStart: NodeMouseHandler = useCallback(
    (_event, node) => {
      if (isLockedRef.current || !nodes) return;

      // If dragging a group node, capture members and their initial positions
      if (node.type === GROUP_NODE_TYPE && groupMemberHandlers?.getGroupMembers) {
        const memberIds = groupMemberHandlers.getGroupMembers(node.id, { includeNested: true });
        groupMembersRef.current.set(node.id, memberIds);
        groupLastPositionRef.current.set(node.id, { ...node.position });
      }

      lineDragStartRef.current.clear();
      const lineNodes = collectLineDragNodes(node, nodes, groupMemberHandlers);
      for (const lineNode of lineNodes) {
        recordLineDragSnapshot(lineDragStartRef.current, lineNode);
      }
    },
    [isLockedRef, nodes, groupMemberHandlers]
  );

  // Called during drag - moves members with group using direct state update
  const onNodeDrag: NodeMouseHandler = useCallback(
    (_event, node) => {
      if (isLockedRef.current || !setNodes) return;

      // Handle group member movement during drag
      if (node.type === GROUP_NODE_TYPE) {
        const lastPos = groupLastPositionRef.current.get(node.id);
        const memberIds = groupMembersRef.current.get(node.id);

        if (lastPos && memberIds && memberIds.length > 0) {
          // Calculate delta
          const dx = node.position.x - lastPos.x;
          const dy = node.position.y - lastPos.y;

          if (dx !== 0 || dy !== 0) {
            // Build a set for fast lookup
            const memberIdSet = new Set(memberIds);

            // Update member positions directly via setNodes (bypasses React Flow drag tracking)
            setNodes((currentNodes) =>
              currentNodes.map((n) => {
                if (memberIdSet.has(n.id)) {
                  return {
                    ...n,
                    position: {
                      x: n.position.x + dx,
                      y: n.position.y + dy
                    }
                  };
                }
                return n;
              })
            );
          }
        }

        // Update last position for next delta calculation
        groupLastPositionRef.current.set(node.id, { ...node.position });
      }
    },
    [isLockedRef, setNodes]
  );

  const onNodeDragStop: NodeMouseHandler = useCallback(
    (_event, node) => {
      if (isLockedRef.current) return;

      // Skip for shape nodes with active line handle
      if (node.type === FREE_SHAPE_NODE_TYPE && isLineHandleActive()) {
        lineDragStartRef.current.clear();
        return;
      }

      if (handleGeoDragStop(node, onNodesChangeBase, setNodes, geoLayout)) {
        lineDragStartRef.current.clear();
        return;
      }

      // Normal (non-geo) mode: update preset position
      const isGroupNode = node.type === GROUP_NODE_TYPE;
      const shouldSnap =
        node.type !== FREE_SHAPE_NODE_TYPE && node.type !== FREE_TEXT_NODE_TYPE;
      const finalPosition =
        isGroupNode || !shouldSnap ? node.position : snapToGrid(node.position);
      const changes: NodeChange[] = [
        { type: "position", id: node.id, position: finalPosition, dragging: false }
      ];
      const delta = isGroupNode
        ? null
        : {
            x: finalPosition.x - node.position.x,
            y: finalPosition.y - node.position.y
          };

      // Handle group node members
      if (isGroupNode) {
        changes.push(...finalizeGroupChanges(node, nodes, groupMembersRef, groupLastPositionRef));
      }

      // Include other selected nodes for multi-drag persistence (and snap with same delta)
      const excludeIds = new Set(
        changes.filter((c): c is NodeChange & { id: string } => "id" in c).map((c) => c.id)
      );
      changes.push(
        ...buildSelectedNodeChanges(
          node.id,
          nodes,
          excludeIds,
          delta && (delta.x !== 0 || delta.y !== 0) ? delta : undefined
        )
      );

      onNodesChangeBase(changes);
      log.info(`[ReactFlowCanvas] Node ${node.id} moved to ${finalPosition.x}, ${finalPosition.y}`);

      // Notify group member handler for membership updates
      if (groupMemberHandlers?.onNodeDropped) {
        groupMemberHandlers.onNodeDropped(node.id, finalPosition);
      }

      applyLineDragSnapshots(lineDragStartRef.current);
      persistPositionChanges(changes);
    },
    [isLockedRef, nodes, onNodesChangeBase, groupMemberHandlers, geoLayout, setNodes]
  );

  return { onNodeDragStart, onNodeDrag, onNodeDragStop };
}

/** Hook for context menu handlers */
function useContextMenuHandlers(
  selectNode: (id: string | null) => void,
  selectEdge: (id: string | null) => void,
  openNodeMenu: (x: number, y: number, id: string) => void,
  openEdgeMenu: (x: number, y: number, id: string) => void,
  openPaneMenu: (x: number, y: number) => void
) {
  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault();
      event.stopPropagation();
      selectNode(node.id);
      selectEdge(null);
      openNodeMenu(event.clientX, event.clientY, node.id);
    },
    [selectNode, selectEdge, openNodeMenu]
  );

  const onEdgeContextMenu = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      event.preventDefault();
      event.stopPropagation();
      selectEdge(edge.id);
      selectNode(null);
      openEdgeMenu(event.clientX, event.clientY, edge.id);
    },
    [selectNode, selectEdge, openEdgeMenu]
  );

  const onPaneContextMenu = useCallback(
    (event: MouseEvent | React.MouseEvent) => {
      event.preventDefault();
      selectNode(null);
      selectEdge(null);
      openPaneMenu(event.clientX, event.clientY);
    },
    [selectNode, selectEdge, openPaneMenu]
  );

  return { onNodeContextMenu, onEdgeContextMenu, onPaneContextMenu };
}

/** Hook for context menu state management */
function useContextMenuState() {
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    type: null,
    position: { x: 0, y: 0 },
    targetId: null
  });

  const closeContextMenu = useCallback(() => {
    setContextMenu({ type: null, position: { x: 0, y: 0 }, targetId: null });
  }, []);

  const openNodeMenu = useCallback((x: number, y: number, nodeId: string) => {
    setContextMenu({ type: "node", position: { x, y }, targetId: nodeId });
  }, []);

  const openEdgeMenu = useCallback((x: number, y: number, edgeId: string) => {
    setContextMenu({ type: "edge", position: { x, y }, targetId: edgeId });
  }, []);

  const openPaneMenu = useCallback((x: number, y: number) => {
    setContextMenu({ type: "pane", position: { x, y }, targetId: null });
  }, []);

  return { contextMenu, closeContextMenu, openNodeMenu, openEdgeMenu, openPaneMenu };
}

/** Hook for node click handlers */
function useNodeClickHandlers(
  selectNode: (id: string | null) => void,
  selectEdge: (id: string | null) => void,
  editNode: (id: string | null) => void,
  editNetwork: (id: string | null) => void,
  closeContextMenu: () => void,
  modeRef: React.RefObject<"view" | "edit">
) {
  const onNodeClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      log.info(`[ReactFlowCanvas] Node clicked: ${node.id}`);
      closeContextMenu();
      if (isAnnotationNodeType(node.type)) return;
      // In edit mode, open editor directly (read-only when locked)
      if (modeRef.current === "edit" && EDITABLE_NODE_TYPES.includes(node.type || "")) {
        if (node.type === NODE_TYPE_NETWORK) {
          editNetwork(node.id);
        } else {
          editNode(node.id);
        }
      } else {
        selectNode(node.id);
        selectEdge(null);
      }
    },
    [selectNode, selectEdge, editNode, editNetwork, closeContextMenu, modeRef]
  );

  const onNodeDoubleClick: NodeMouseHandler = useCallback(
    (_event, _node) => {
      // Node editing in edit mode is handled by single click.
      // Annotation double-click (text/shape/group) is handled by the annotation wrapper.
    },
    []
  );

  return { onNodeClick, onNodeDoubleClick };
}

/** Hook for edge click handlers */
function useEdgeClickHandlers(
  selectNode: (id: string | null) => void,
  selectEdge: (id: string | null) => void,
  editEdge: (id: string | null) => void,
  closeContextMenu: () => void,
  modeRef: React.RefObject<"view" | "edit">
) {
  const onEdgeClick: EdgeMouseHandler = useCallback(
    (_event, edge) => {
      log.info(`[ReactFlowCanvas] Edge clicked: ${edge.id}`);
      closeContextMenu();
      // In edit mode, open editor directly (read-only when locked)
      if (modeRef.current === "edit") {
        editEdge(edge.id);
      } else {
        selectEdge(edge.id);
        selectNode(null);
      }
    },
    [selectNode, selectEdge, editEdge, closeContextMenu, modeRef]
  );

  const onEdgeDoubleClick: EdgeMouseHandler = useCallback(
    (_event, _edge) => {
      // Edge editing in edit mode is handled by single click.
    },
    []
  );

  return { onEdgeClick, onEdgeDoubleClick };
}

/** Hook for pane click handler */
function usePaneClickHandler(
  selectNode: (id: string | null) => void,
  selectEdge: (id: string | null) => void,
  editNode: (id: string | null) => void,
  closeContextMenu: () => void,
  reactFlowInstance: React.RefObject<ReactFlowInstance | null>,
  modeRef: React.RefObject<"view" | "edit">,
  isLockedRef: React.RefObject<boolean>,
  onLockedAction?: () => void
) {
  return useCallback(
    (_event: React.MouseEvent) => {
      closeContextMenu();
      document.dispatchEvent(new Event("topoviewer:pane-click"));

      selectNode(null);
      selectEdge(null);
      // Clear editing state so panel returns to palette
      editNode(null);
    },
    [
      selectNode,
      selectEdge,
      editNode,
      closeContextMenu,
      onLockedAction,
      reactFlowInstance,
      modeRef,
      isLockedRef
    ]
  );
}

/** Hook for connection handler */
function useConnectionHandler(
  modeRef: React.RefObject<"view" | "edit">,
  isLockedRef: React.RefObject<boolean>,
  onLockedAction?: () => void,
  onEdgeCreated?: (
    sourceId: string,
    targetId: string,
    edgeData: {
      id: string;
      source: string;
      target: string;
      sourceEndpoint: string;
      targetEndpoint: string;
    }
  ) => void
) {
  return useCallback(
    (connection: Connection) => {
      if (modeRef.current !== "edit") return;
      if (isLockedRef.current) {
        onLockedAction?.();
        return;
      }
      if (!connection.source || !connection.target) return;

      log.info(
        `[ReactFlowCanvas] Creating edge via drag-connect: ${connection.source} -> ${connection.target}`
      );
      const { nodes, edges } = useGraphStore.getState();
      const { sourceEndpoint, targetEndpoint } = allocateEndpointsForLink(
        nodes as TopoNode[],
        edges as TopoEdge[],
        connection.source,
        connection.target
      );
      const edgeId = buildEdgeId(
        connection.source,
        connection.target,
        sourceEndpoint,
        targetEndpoint
      );

      const edgeData = {
        id: edgeId,
        source: connection.source,
        target: connection.target,
        sourceEndpoint,
        targetEndpoint
      };

      // Use unified callback which handles:
      // 1. Adding edge to React state
      // 2. Persisting via TopologyHost commands
      // 3. Undo/redo support
      if (onEdgeCreated) {
        onEdgeCreated(connection.source, connection.target, edgeData);
      }
    },
    [onLockedAction, modeRef, isLockedRef, onEdgeCreated]
  );
}

/** Node types that can be selected via box selection and synced to context */
const SELECTABLE_NODE_TYPES = [NODE_TYPE_TOPOLOGY, NODE_TYPE_NETWORK];

/** Hook for selection change handler (box selection support) */
function useSelectionChangeHandler(
  selectNode: (id: string | null) => void,
  selectEdge: (id: string | null) => void
): OnSelectionChangeFunc {
  return useCallback(
    ({ nodes, edges }) => {
      // Filter to only topology/network nodes (ignore annotation nodes for context selection)
      const selectableNodes = nodes.filter((n) => SELECTABLE_NODE_TYPES.includes(n.type || ""));

      // If exactly one selectable node is selected, sync to context
      if (selectableNodes.length === 1 && edges.length === 0) {
        selectNode(selectableNodes[0].id);
        return;
      }

      // If exactly one edge is selected and no nodes, sync to context
      if (edges.length === 1 && selectableNodes.length === 0) {
        selectEdge(edges[0].id);
        return;
      }

      // Multiple items selected or no selectable items - clear context selection
      // (React Flow manages the visual selection via node.selected property)
      if (
        selectableNodes.length > 1 ||
        edges.length > 1 ||
        (selectableNodes.length > 0 && edges.length > 0)
      ) {
        selectNode(null);
        selectEdge(null);
        log.info(`[ReactFlowCanvas] Box selection: ${nodes.length} nodes, ${edges.length} edges`);
      }
    },
    [selectNode, selectEdge]
  );
}

/**
 * Hook for canvas event handlers
 */
export function useCanvasHandlers(config: CanvasHandlersConfig): CanvasHandlers {
  const {
    selectNode,
    selectEdge,
    editNode,
    editNetwork,
    editEdge,
    mode,
    isLocked,
    onNodesChangeBase,
    onLockedAction,
    nodes,
    setNodes,
    onEdgeCreated,
    groupMemberHandlers,
    reactFlowInstanceRef,
    geoLayout
  } = config;

  const reactFlowInstance = reactFlowInstanceRef ?? useRef<ReactFlowInstance | null>(null);
  const modeRef = useRef(mode);
  const isLockedRef = useRef(isLocked);
  modeRef.current = mode;
  isLockedRef.current = isLocked;

  // Context menu state
  const { contextMenu, closeContextMenu, openNodeMenu, openEdgeMenu, openPaneMenu } =
    useContextMenuState();

  // Initialize
  const onInit = useCallback(
    (instance: ReactFlowInstance) => {
      reactFlowInstance.current = instance;
      log.info("[ReactFlowCanvas] React Flow initialized");
      // Don't auto-fitView in geo layout mode - map controls the viewport
      if (!geoLayout?.isGeoLayout) {
        setTimeout(() => {
          void instance.fitView({ padding: 0.2 });
        }, 100);
      }
    },
    [geoLayout?.isGeoLayout]
  );

  // Click handlers (extracted hooks)
  const { onNodeClick, onNodeDoubleClick } = useNodeClickHandlers(
    selectNode,
    selectEdge,
    editNode,
    editNetwork,
    closeContextMenu,
    modeRef
  );
  const { onEdgeClick, onEdgeDoubleClick } = useEdgeClickHandlers(
    selectNode,
    selectEdge,
    editEdge,
    closeContextMenu,
    modeRef
  );
  const onPaneClick = usePaneClickHandler(
    selectNode,
    selectEdge,
    editNode,
    closeContextMenu,
    reactFlowInstance,
    modeRef,
    isLockedRef,
    onLockedAction
  );
  const onConnect = useConnectionHandler(modeRef, isLockedRef, onLockedAction, onEdgeCreated);

  // Node changes handler - all nodes (topology + annotation) live in the graph store
  // The graph store is the single source of truth, so we pass changes through directly
  const handleNodesChange: OnNodesChange = useCallback(
    (changes: NodeChange[]) => {
      onNodesChangeBase(changes);
    },
    [onNodesChangeBase]
  );

  // Drag handlers (extracted hook)
  const { onNodeDragStart, onNodeDrag, onNodeDragStop } = useNodeDragHandlers(
    isLockedRef,
    nodes,
    onNodesChangeBase,
    setNodes,
    groupMemberHandlers,
    geoLayout
  );

  // Context menu handlers (extracted hook)
  const { onNodeContextMenu, onEdgeContextMenu, onPaneContextMenu } = useContextMenuHandlers(
    selectNode,
    selectEdge,
    openNodeMenu,
    openEdgeMenu,
    openPaneMenu
  );

  // Selection change handler (for box selection)
  const onSelectionChange = useSelectionChangeHandler(selectNode, selectEdge);

  return {
    reactFlowInstance,
    onInit,
    onNodeClick,
    onNodeDoubleClick,
    onEdgeClick,
    onEdgeDoubleClick,
    onPaneClick,
    onConnect,
    handleNodesChange,
    onSelectionChange,
    onNodeContextMenu,
    onEdgeContextMenu,
    onPaneContextMenu,
    onNodeDragStart,
    onNodeDrag,
    onNodeDragStop,
    contextMenu,
    closeContextMenu
  };
}
