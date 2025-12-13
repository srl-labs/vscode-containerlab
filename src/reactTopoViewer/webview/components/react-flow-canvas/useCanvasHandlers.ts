/**
 * Canvas event handlers for ReactFlowCanvas
 * Comprehensive handlers for all canvas interactions
 */
import type React from 'react';
import { useCallback, useRef, useState } from 'react';
import type {
  ReactFlowInstance,
  OnNodesChange,
  NodeMouseHandler,
  EdgeMouseHandler,
  OnConnect,
  Connection,
  Node,
  Edge,
  NodeChange,
  XYPosition
} from '@xyflow/react';
import { log } from '../../utils/logger';
import { sendCommandToExtension } from '../../utils/extensionMessaging';

// Grid size for snapping
export const GRID_SIZE = 20;

// Snap position to grid
export function snapToGrid(position: XYPosition): XYPosition {
  return {
    x: Math.round(position.x / GRID_SIZE) * GRID_SIZE,
    y: Math.round(position.y / GRID_SIZE) * GRID_SIZE
  };
}

interface CanvasHandlersConfig {
  selectNode: (id: string | null) => void;
  selectEdge: (id: string | null) => void;
  editNode: (id: string | null) => void;
  editEdge: (id: string | null) => void;
  mode: 'view' | 'edit';
  isLocked: boolean;
  onNodesChangeBase: OnNodesChange;
  onEdgesChangeBase: (changes: unknown[]) => void;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  onLockedAction?: () => void;
}

interface ContextMenuState {
  type: 'node' | 'edge' | 'pane' | null;
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
  onNodeContextMenu: (event: React.MouseEvent, node: Node) => void;
  onEdgeContextMenu: (event: React.MouseEvent, edge: Edge) => void;
  onPaneContextMenu: (event: React.MouseEvent) => void;
  onNodeDragStop: NodeMouseHandler;
  contextMenu: ContextMenuState;
  closeContextMenu: () => void;
}

const ANNOTATION_NODE_TYPES = ['group-node', 'free-text-node', 'free-shape-node'];
const EDITABLE_NODE_TYPES = ['topology-node', 'cloud-node'];

let nodeIdCounter = 0;
function generateNodeId(): string {
  nodeIdCounter += 1;
  return `node-${Date.now()}-${nodeIdCounter}`;
}

function generateEdgeId(source: string, target: string): string {
  return `${source}-${target}-${Date.now()}`;
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
    setContextMenu({ type: 'node', position: { x, y }, targetId: nodeId });
  }, []);

  const openEdgeMenu = useCallback((x: number, y: number, edgeId: string) => {
    setContextMenu({ type: 'edge', position: { x, y }, targetId: edgeId });
  }, []);

  const openPaneMenu = useCallback((x: number, y: number) => {
    setContextMenu({ type: 'pane', position: { x, y }, targetId: null });
  }, []);

  return { contextMenu, closeContextMenu, openNodeMenu, openEdgeMenu, openPaneMenu };
}

/** Hook for node click handlers */
function useNodeClickHandlers(
  selectNode: (id: string | null) => void,
  selectEdge: (id: string | null) => void,
  editNode: (id: string | null) => void,
  closeContextMenu: () => void,
  modeRef: React.RefObject<'view' | 'edit'>,
  isLockedRef: React.RefObject<boolean>,
  onLockedAction?: () => void
) {
  const onNodeClick: NodeMouseHandler = useCallback((event, node) => {
    log.info(`[ReactFlowCanvas] Node clicked: ${node.id}`);
    closeContextMenu();
    if (ANNOTATION_NODE_TYPES.includes(node.type || '')) return;
    selectNode(node.id);
    selectEdge(null);
  }, [selectNode, selectEdge, closeContextMenu]);

  const onNodeDoubleClick: NodeMouseHandler = useCallback((event, node) => {
    log.info(`[ReactFlowCanvas] Node double clicked: ${node.id}`);
    if (modeRef.current === 'edit' && EDITABLE_NODE_TYPES.includes(node.type || '')) {
      if (isLockedRef.current) {
        onLockedAction?.();
        return;
      }
      editNode(node.id);
    }
  }, [editNode, onLockedAction, modeRef, isLockedRef]);

  return { onNodeClick, onNodeDoubleClick };
}

/** Hook for edge click handlers */
function useEdgeClickHandlers(
  selectNode: (id: string | null) => void,
  selectEdge: (id: string | null) => void,
  editEdge: (id: string | null) => void,
  closeContextMenu: () => void,
  modeRef: React.RefObject<'view' | 'edit'>,
  isLockedRef: React.RefObject<boolean>,
  onLockedAction?: () => void
) {
  const onEdgeClick: EdgeMouseHandler = useCallback((event, edge) => {
    log.info(`[ReactFlowCanvas] Edge clicked: ${edge.id}`);
    closeContextMenu();
    selectEdge(edge.id);
    selectNode(null);
  }, [selectNode, selectEdge, closeContextMenu]);

  const onEdgeDoubleClick: EdgeMouseHandler = useCallback((event, edge) => {
    log.info(`[ReactFlowCanvas] Edge double clicked: ${edge.id}`);
    if (modeRef.current === 'edit') {
      if (isLockedRef.current) {
        onLockedAction?.();
        return;
      }
      editEdge(edge.id);
    }
  }, [editEdge, onLockedAction, modeRef, isLockedRef]);

  return { onEdgeClick, onEdgeDoubleClick };
}

/** Hook for pane click handler */
function usePaneClickHandler(
  selectNode: (id: string | null) => void,
  selectEdge: (id: string | null) => void,
  closeContextMenu: () => void,
  reactFlowInstance: React.RefObject<ReactFlowInstance | null>,
  modeRef: React.RefObject<'view' | 'edit'>,
  isLockedRef: React.RefObject<boolean>,
  onLockedAction?: () => void
) {
  return useCallback((event: React.MouseEvent) => {
    closeContextMenu();

    if (event.shiftKey && modeRef.current === 'edit') {
      if (isLockedRef.current) {
        onLockedAction?.();
        return;
      }
      const rfInstance = reactFlowInstance.current;
      if (!rfInstance) return;

      const bounds = (event.target as HTMLElement).getBoundingClientRect();
      const position = rfInstance.screenToFlowPosition({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top
      });
      const snappedPosition = snapToGrid(position);
      const nodeId = generateNodeId();
      log.info(`[ReactFlowCanvas] Creating node at ${snappedPosition.x}, ${snappedPosition.y}`);

      sendCommandToExtension('create-node', {
        nodeId,
        position: snappedPosition,
        nodeData: { name: nodeId, topoViewerRole: 'default' }
      });
      return;
    }

    selectNode(null);
    selectEdge(null);
  }, [selectNode, selectEdge, closeContextMenu, onLockedAction, reactFlowInstance, modeRef, isLockedRef]);
}

/** Hook for connection handler */
function useConnectionHandler(
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>,
  modeRef: React.RefObject<'view' | 'edit'>,
  isLockedRef: React.RefObject<boolean>,
  onLockedAction?: () => void
) {
  return useCallback((connection: Connection) => {
    if (modeRef.current !== 'edit') return;
    if (isLockedRef.current) {
      onLockedAction?.();
      return;
    }
    if (!connection.source || !connection.target) return;

    log.info(`[ReactFlowCanvas] Creating edge: ${connection.source} -> ${connection.target}`);
    const edgeId = generateEdgeId(connection.source, connection.target);

    sendCommandToExtension('create-link', {
      linkData: {
        id: edgeId,
        source: connection.source,
        target: connection.target,
        sourceEndpoint: 'eth1',
        targetEndpoint: 'eth1'
      }
    });

    const newEdge: Edge = {
      id: edgeId,
      source: connection.source,
      target: connection.target,
      type: 'topology-edge',
      data: { sourceEndpoint: 'eth1', targetEndpoint: 'eth1', linkStatus: 'unknown' }
    };

    setEdges((edges) => [...edges, newEdge]);
  }, [setEdges, onLockedAction, modeRef, isLockedRef]);
}

/**
 * Hook for canvas event handlers
 */
export function useCanvasHandlers(config: CanvasHandlersConfig): CanvasHandlers {
  const { selectNode, selectEdge, editNode, editEdge, mode, isLocked, onNodesChangeBase, setEdges, onLockedAction } = config;

  const reactFlowInstance = useRef<ReactFlowInstance | null>(null);
  const modeRef = useRef(mode);
  const isLockedRef = useRef(isLocked);
  modeRef.current = mode;
  isLockedRef.current = isLocked;

  // Context menu
  const { contextMenu, closeContextMenu, openNodeMenu, openEdgeMenu, openPaneMenu } = useContextMenuState();

  // Initialize
  const onInit = useCallback((instance: ReactFlowInstance) => {
    reactFlowInstance.current = instance;
    log.info('[ReactFlowCanvas] React Flow initialized');
    setTimeout(() => instance.fitView({ padding: 0.2 }), 100);
  }, []);

  // Click handlers
  const { onNodeClick, onNodeDoubleClick } = useNodeClickHandlers(selectNode, selectEdge, editNode, closeContextMenu, modeRef, isLockedRef, onLockedAction);
  const { onEdgeClick, onEdgeDoubleClick } = useEdgeClickHandlers(selectNode, selectEdge, editEdge, closeContextMenu, modeRef, isLockedRef, onLockedAction);
  const onPaneClick = usePaneClickHandler(selectNode, selectEdge, closeContextMenu, reactFlowInstance, modeRef, isLockedRef, onLockedAction);
  const onConnect = useConnectionHandler(setEdges, modeRef, isLockedRef, onLockedAction);

  // Node changes with snapping
  const handleNodesChange: OnNodesChange = useCallback((changes: NodeChange[]) => {
    const snappedChanges = changes.map((change) => {
      if (change.type === 'position' && change.position) {
        return { ...change, position: snapToGrid(change.position) };
      }
      return change;
    });
    onNodesChangeBase(snappedChanges);
  }, [onNodesChangeBase]);

  // Drag stop
  const onNodeDragStop: NodeMouseHandler = useCallback((event, node) => {
    if (modeRef.current !== 'edit') return;
    const snappedPosition = snapToGrid(node.position);
    log.info(`[ReactFlowCanvas] Node ${node.id} dragged to ${snappedPosition.x}, ${snappedPosition.y}`);
    sendCommandToExtension('save-node-positions', { positions: [{ id: node.id, position: snappedPosition }] });
  }, []);

  // Context menus
  const onNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
    event.preventDefault();
    event.stopPropagation();
    selectNode(node.id);
    selectEdge(null);
    openNodeMenu(event.clientX, event.clientY, node.id);
  }, [selectNode, selectEdge, openNodeMenu]);

  const onEdgeContextMenu = useCallback((event: React.MouseEvent, edge: Edge) => {
    event.preventDefault();
    event.stopPropagation();
    selectEdge(edge.id);
    selectNode(null);
    openEdgeMenu(event.clientX, event.clientY, edge.id);
  }, [selectNode, selectEdge, openEdgeMenu]);

  const onPaneContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    selectNode(null);
    selectEdge(null);
    openPaneMenu(event.clientX, event.clientY);
  }, [selectNode, selectEdge, openPaneMenu]);

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
    onNodeContextMenu,
    onEdgeContextMenu,
    onPaneContextMenu,
    onNodeDragStop,
    contextMenu,
    closeContextMenu
  };
}
