/**
 * Canvas event handlers for ReactFlowCanvas
 */
import { useCallback, useRef } from 'react';
import type {
  ReactFlowInstance,
  OnNodesChange,
  NodeMouseHandler,
  EdgeMouseHandler,
  OnConnect,
  Connection
} from '@xyflow/react';
import { log } from '../../utils/logger';

interface CanvasHandlersConfig {
  selectNode: (id: string | null) => void;
  selectEdge: (id: string | null) => void;
  editNode: (id: string | null) => void;
  editEdge: (id: string | null) => void;
  mode: 'view' | 'edit';
  onNodesChangeBase: OnNodesChange;
}

interface CanvasHandlers {
  reactFlowInstance: React.MutableRefObject<ReactFlowInstance | null>;
  onInit: (instance: ReactFlowInstance) => void;
  onNodeClick: NodeMouseHandler;
  onNodeDoubleClick: NodeMouseHandler;
  onEdgeClick: EdgeMouseHandler;
  onEdgeDoubleClick: EdgeMouseHandler;
  onPaneClick: () => void;
  onConnect: OnConnect;
  handleNodesChange: OnNodesChange;
}

const ANNOTATION_NODE_TYPES = ['group-node', 'free-text-node', 'free-shape-node'];
const EDITABLE_NODE_TYPES = ['topology-node', 'cloud-node'];

/**
 * Hook for canvas event handlers
 */
export function useCanvasHandlers(config: CanvasHandlersConfig): CanvasHandlers {
  const { selectNode, selectEdge, editNode, editEdge, mode, onNodesChangeBase } = config;
  const reactFlowInstance = useRef<ReactFlowInstance | null>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const onInit = useCallback((instance: ReactFlowInstance) => {
    reactFlowInstance.current = instance;
    log.info('[ReactFlowCanvas] React Flow initialized');
    setTimeout(() => instance.fitView({ padding: 0.2 }), 100);
  }, []);

  const onNodeClick: NodeMouseHandler = useCallback((event, node) => {
    log.info(`[ReactFlowCanvas] Node clicked: ${node.id}`);
    if (ANNOTATION_NODE_TYPES.includes(node.type || '')) return;
    selectNode(node.id);
    selectEdge(null);
  }, [selectNode, selectEdge]);

  const onNodeDoubleClick: NodeMouseHandler = useCallback((event, node) => {
    log.info(`[ReactFlowCanvas] Node double clicked: ${node.id}`);
    if (modeRef.current === 'edit' && EDITABLE_NODE_TYPES.includes(node.type || '')) {
      editNode(node.id);
    }
  }, [editNode]);

  const onEdgeClick: EdgeMouseHandler = useCallback((event, edge) => {
    log.info(`[ReactFlowCanvas] Edge clicked: ${edge.id}`);
    selectEdge(edge.id);
    selectNode(null);
  }, [selectNode, selectEdge]);

  const onEdgeDoubleClick: EdgeMouseHandler = useCallback((event, edge) => {
    log.info(`[ReactFlowCanvas] Edge double clicked: ${edge.id}`);
    if (modeRef.current === 'edit') {
      editEdge(edge.id);
    }
  }, [editEdge]);

  const onPaneClick = useCallback(() => {
    selectNode(null);
    selectEdge(null);
  }, [selectNode, selectEdge]);

  const onConnect: OnConnect = useCallback((connection: Connection) => {
    log.info(`[ReactFlowCanvas] Connection: ${connection.source} -> ${connection.target}`);
  }, []);

  const handleNodesChange: OnNodesChange = useCallback((changes) => {
    onNodesChangeBase(changes);
  }, [onNodesChangeBase]);

  return {
    reactFlowInstance,
    onInit,
    onNodeClick,
    onNodeDoubleClick,
    onEdgeClick,
    onEdgeDoubleClick,
    onPaneClick,
    onConnect,
    handleNodesChange
  };
}
