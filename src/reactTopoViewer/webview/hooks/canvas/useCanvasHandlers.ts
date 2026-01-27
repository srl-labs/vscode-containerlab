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
  type XYPosition
} from "@xyflow/react";

import { log } from "../../utils/logger";
import { isLineHandleActive } from "../../components/canvas/nodes/AnnotationHandles";
import {
  FREE_TEXT_NODE_TYPE,
  FREE_SHAPE_NODE_TYPE,
  GROUP_NODE_TYPE,
  isAnnotationNodeType
} from "../../utils/annotationNodeConverters";
import { saveAnnotationNodesFromGraph, saveNodePositions } from "../../services";
import { useGraphStore } from "../../stores/graphStore";

// Grid size for snapping
export const GRID_SIZE = 20;

// Snap position to grid
export function snapToGrid(position: XYPosition): XYPosition {
  return {
    x: Math.round(position.x / GRID_SIZE) * GRID_SIZE,
    y: Math.round(position.y / GRID_SIZE) * GRID_SIZE
  };
}

/** Handlers for group member movement during drag */
export interface GroupMemberHandlers {
  /** Get member node IDs for a group */
  getGroupMembers?: (groupId: string) => string[];
  /** Handle node dropped (for group membership updates) */
  onNodeDropped?: (nodeId: string, position: { x: number; y: number }) => void;
}

interface CanvasHandlersConfig {
  selectNode: (id: string | null) => void;
  selectEdge: (id: string | null) => void;
  editNode: (id: string | null) => void;
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

const ANNOTATION_NODE_TYPES: readonly string[] = [
  GROUP_NODE_TYPE,
  FREE_TEXT_NODE_TYPE,
  FREE_SHAPE_NODE_TYPE
];
const EDITABLE_NODE_TYPES = ["topology-node", "cloud-node"];

function generateEdgeId(source: string, target: string): string {
  return `${source}-${target}-${Date.now()}`;
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

/** Clean up group tracking refs */
function cleanupGroupRefs(
  nodeId: string,
  groupMembersRef: React.RefObject<Map<string, string[]>>,
  groupLastPositionRef: React.RefObject<Map<string, XYPosition>>
): void {
  groupMembersRef.current?.delete(nodeId);
  groupLastPositionRef.current?.delete(nodeId);
}

/** Hook for node drag handlers with group member movement */
function useNodeDragHandlers(
  modeRef: React.RefObject<"view" | "edit">,
  nodes: Node[] | undefined,
  onNodesChangeBase: OnNodesChange,
  setNodes: React.Dispatch<React.SetStateAction<Node[]>> | undefined,
  groupMemberHandlers?: GroupMemberHandlers
) {
  // Track the last position of a dragging group to compute delta
  const groupLastPositionRef = useRef<Map<string, XYPosition>>(new Map());
  // Track member IDs that are being moved with a group
  const groupMembersRef = useRef<Map<string, string[]>>(new Map());

  const onNodeDragStart: NodeMouseHandler = useCallback(
    (_event, node) => {
      if (modeRef.current !== "edit" || !nodes) return;

      // If dragging a group node, capture members and their initial positions
      if (node.type === GROUP_NODE_TYPE && groupMemberHandlers?.getGroupMembers) {
        const memberIds = groupMemberHandlers.getGroupMembers(node.id);
        groupMembersRef.current.set(node.id, memberIds);
        groupLastPositionRef.current.set(node.id, { ...node.position });
      }

      log.info("[ReactFlowCanvas] Drag started");
    },
    [modeRef, nodes, groupMemberHandlers]
  );

  // Called during drag - moves members with group using direct state update
  const onNodeDrag: NodeMouseHandler = useCallback(
    (_event, node) => {
      if (modeRef.current !== "edit" || !setNodes) return;

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
    [modeRef, setNodes]
  );

  const onNodeDragStop: NodeMouseHandler = useCallback(
    (_event, node) => {
      if (modeRef.current !== "edit") return;

      // Skip for shape nodes with active line handle
      if (node.type === "free-shape-node" && isLineHandleActive()) {
        return;
      }

      const isGroupNode = node.type === GROUP_NODE_TYPE;
      const finalPosition = isGroupNode ? node.position : snapToGrid(node.position);
      const changes: NodeChange[] = [
        { type: "position", id: node.id, position: finalPosition, dragging: false }
      ];

      // Handle group node members
      if (isGroupNode) {
        const memberIds = groupMembersRef.current.get(node.id) ?? [];
        const memberChanges = buildGroupMemberChanges(node, memberIds, nodes);
        changes.push(...memberChanges);
        cleanupGroupRefs(node.id, groupMembersRef, groupLastPositionRef);
      }

      onNodesChangeBase(changes);
      log.info(`[ReactFlowCanvas] Node ${node.id} moved to ${finalPosition.x}, ${finalPosition.y}`);

      // Notify group member handler for non-group nodes
      if (!isGroupNode && groupMemberHandlers?.onNodeDropped) {
        groupMemberHandlers.onNodeDropped(node.id, finalPosition);
      }

      const currentNodes = useGraphStore.getState().nodes;
      const nodeTypeMap = new Map(currentNodes.map((n) => [n.id, n.type]));
      const movedPositions = changes
        .filter((change) => change.type === "position" && change.position)
        .map((change) => ({ id: change.id, position: change.position! }));

      const topoPositions = movedPositions.filter(
        (pos) => !isAnnotationNodeType(nodeTypeMap.get(pos.id))
      );
      const movedAnnotations = movedPositions.some((pos) =>
        isAnnotationNodeType(nodeTypeMap.get(pos.id))
      );

      if (topoPositions.length > 0) {
        void saveNodePositions(topoPositions);
      }

      if (movedAnnotations) {
        void saveAnnotationNodesFromGraph(currentNodes);
      }
    },
    [modeRef, nodes, onNodesChangeBase, groupMemberHandlers]
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
  closeContextMenu: () => void,
  modeRef: React.RefObject<"view" | "edit">,
  isLockedRef: React.RefObject<boolean>,
  onLockedAction?: () => void
) {
  const onNodeClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      log.info(`[ReactFlowCanvas] Node clicked: ${node.id}`);
      closeContextMenu();
      if (ANNOTATION_NODE_TYPES.includes(node.type || "")) return;
      selectNode(node.id);
      selectEdge(null);
    },
    [selectNode, selectEdge, closeContextMenu]
  );

  const onNodeDoubleClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      log.info(`[ReactFlowCanvas] Node double clicked: ${node.id}`);
      if (modeRef.current === "edit" && EDITABLE_NODE_TYPES.includes(node.type || "")) {
        if (isLockedRef.current) {
          onLockedAction?.();
          return;
        }
        editNode(node.id);
      }
    },
    [editNode, onLockedAction, modeRef, isLockedRef]
  );

  return { onNodeClick, onNodeDoubleClick };
}

/** Hook for edge click handlers */
function useEdgeClickHandlers(
  selectNode: (id: string | null) => void,
  selectEdge: (id: string | null) => void,
  editEdge: (id: string | null) => void,
  closeContextMenu: () => void,
  modeRef: React.RefObject<"view" | "edit">,
  isLockedRef: React.RefObject<boolean>,
  onLockedAction?: () => void
) {
  const onEdgeClick: EdgeMouseHandler = useCallback(
    (_event, edge) => {
      log.info(`[ReactFlowCanvas] Edge clicked: ${edge.id}`);
      closeContextMenu();
      selectEdge(edge.id);
      selectNode(null);
    },
    [selectNode, selectEdge, closeContextMenu]
  );

  const onEdgeDoubleClick: EdgeMouseHandler = useCallback(
    (_event, edge) => {
      log.info(`[ReactFlowCanvas] Edge double clicked: ${edge.id}`);
      if (modeRef.current === "edit") {
        if (isLockedRef.current) {
          onLockedAction?.();
          return;
        }
        editEdge(edge.id);
      }
    },
    [editEdge, onLockedAction, modeRef, isLockedRef]
  );

  return { onEdgeClick, onEdgeDoubleClick };
}

/** Hook for pane click handler */
function usePaneClickHandler(
  selectNode: (id: string | null) => void,
  selectEdge: (id: string | null) => void,
  closeContextMenu: () => void,
  reactFlowInstance: React.RefObject<ReactFlowInstance | null>,
  modeRef: React.RefObject<"view" | "edit">,
  isLockedRef: React.RefObject<boolean>,
  onLockedAction?: () => void
) {
  return useCallback(
    (_event: React.MouseEvent) => {
      closeContextMenu();

      selectNode(null);
      selectEdge(null);
    },
    [
      selectNode,
      selectEdge,
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
      const edgeId = generateEdgeId(connection.source, connection.target);

      const edgeData = {
        id: edgeId,
        source: connection.source,
        target: connection.target,
        sourceEndpoint: "eth1",
        targetEndpoint: "eth1"
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
const SELECTABLE_NODE_TYPES = ["topology-node", "cloud-node"];

/** Hook for selection change handler (box selection support) */
function useSelectionChangeHandler(
  selectNode: (id: string | null) => void,
  selectEdge: (id: string | null) => void,
  closeContextMenu: () => void
): OnSelectionChangeFunc {
  return useCallback(
    ({ nodes, edges }) => {
      closeContextMenu();

      // Filter to only topology/cloud nodes (ignore annotation nodes for context selection)
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
    [selectNode, selectEdge, closeContextMenu]
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
    editEdge,
    mode,
    isLocked,
    onNodesChangeBase,
    onLockedAction,
    nodes,
    setNodes,
    onEdgeCreated,
    groupMemberHandlers
  } = config;

  const reactFlowInstance = useRef<ReactFlowInstance | null>(null);
  const modeRef = useRef(mode);
  const isLockedRef = useRef(isLocked);
  modeRef.current = mode;
  isLockedRef.current = isLocked;

  // Context menu state
  const { contextMenu, closeContextMenu, openNodeMenu, openEdgeMenu, openPaneMenu } =
    useContextMenuState();

  // Initialize
  const onInit = useCallback((instance: ReactFlowInstance) => {
    reactFlowInstance.current = instance;
    log.info("[ReactFlowCanvas] React Flow initialized");
    setTimeout(() => {
      void instance.fitView({ padding: 0.2 });
    }, 100);
  }, []);

  // Click handlers (extracted hooks)
  const { onNodeClick, onNodeDoubleClick } = useNodeClickHandlers(
    selectNode,
    selectEdge,
    editNode,
    closeContextMenu,
    modeRef,
    isLockedRef,
    onLockedAction
  );
  const { onEdgeClick, onEdgeDoubleClick } = useEdgeClickHandlers(
    selectNode,
    selectEdge,
    editEdge,
    closeContextMenu,
    modeRef,
    isLockedRef,
    onLockedAction
  );
  const onPaneClick = usePaneClickHandler(
    selectNode,
    selectEdge,
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
    modeRef,
    nodes,
    onNodesChangeBase,
    setNodes,
    groupMemberHandlers
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
  const onSelectionChange = useSelectionChangeHandler(selectNode, selectEdge, closeContextMenu);

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
