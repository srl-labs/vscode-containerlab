/**
 * ReactFlowCanvas - Main React Flow canvas component for topology visualization
 * Full-featured canvas with grid snapping, node creation, edge creation, context menus
 */
import React, {
  useRef,
  useEffect,
  useImperativeHandle,
  forwardRef,
  useCallback,
  useMemo,
  useState
} from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  BackgroundVariant,
  SelectionMode,
  ConnectionMode
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import type { CyElement } from '../../../shared/types/topology';
import type { ReactFlowCanvasRef, ReactFlowCanvasProps } from './types';
import { convertElements } from './conversion';
import { nodeTypes } from './nodes';
import { edgeTypes } from './edges';
import { applyLayout, hasPresetPositions, type LayoutName } from './layout';
import { useTopoViewer } from '../../context/TopoViewerContext';
import { useCanvasHandlers, GRID_SIZE } from './useCanvasHandlers';
import { ContextMenu, type ContextMenuItem } from '../context-menu/ContextMenu';
import { sendCommandToExtension } from '../../utils/extensionMessaging';
import { log } from '../../utils/logger';
import { buildNodeContextMenu, buildEdgeContextMenu, buildPaneContextMenu } from './contextMenuBuilders';

/**
 * CSS styles for the canvas
 */
const canvasStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0
};

/**
 * MiniMap node color function
 */
function getMiniMapNodeColor(node: Node): string {
  switch (node.type) {
    case 'topology-node':
      return '#005aff';
    case 'cloud-node':
      return '#6B7280';
    case 'group-node':
      return 'rgba(200, 200, 200, 0.5)';
    case 'free-text-node':
      return '#F59E0B';
    case 'free-shape-node':
      return '#10B981';
    default:
      return '#888';
  }
}

// Pro options (disable attribution)
const proOptions = { hideAttribution: true };

// Default viewport
const defaultViewport = { x: 0, y: 0, zoom: 1 };

// Fit view options
const fitViewOptions = { padding: 0.2 };

/**
 * ReactFlowCanvas component
 */
const ReactFlowCanvasComponent = forwardRef<ReactFlowCanvasRef, ReactFlowCanvasProps>(
  ({ elements, onNodeDelete, onEdgeDelete }, ref) => {
    const { state, selectNode, selectEdge, editNode, editEdge } = useTopoViewer();
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [isInitialized, setIsInitialized] = useState(false);
    const prevElementsRef = useRef<CyElement[]>([]);
    const floatingPanelRef = useRef<{ triggerShake: () => void } | null>(null);

    // Use extracted event handlers
    const handlers = useCanvasHandlers({
      selectNode,
      selectEdge,
      editNode,
      editEdge,
      mode: state.mode,
      isLocked: state.isLocked,
      onNodesChangeBase: onNodesChange,
      onEdgesChangeBase: onEdgesChange,
      setEdges,
      onLockedAction: () => floatingPanelRef.current?.triggerShake()
    });

    // Convert elements when they change
    useEffect(() => {
      if (!elements.length && isInitialized) {
        setNodes([]);
        setEdges([]);
        return;
      }

      if (prevElementsRef.current === elements) return;
      prevElementsRef.current = elements;

      log.info(`[ReactFlowCanvas] Converting ${elements.length} elements`);
      const { nodes: rfNodes, edges: rfEdges } = convertElements(elements);

      if (!hasPresetPositions(rfNodes) && rfNodes.length > 0) {
        log.info('[ReactFlowCanvas] Applying force layout (no preset positions)');
        setNodes(applyLayout('force', rfNodes, rfEdges));
      } else {
        setNodes(rfNodes);
      }

      setEdges(rfEdges);
      setIsInitialized(true);
    }, [elements, setNodes, setEdges, isInitialized]);

    // Expose ref methods
    useImperativeHandle(ref, () => ({
      fit: () => {
        handlers.reactFlowInstance.current?.fitView({ padding: 0.2, duration: 200 });
      },
      runLayout: (layoutName: string) => {
        const newNodes = applyLayout(layoutName as LayoutName, nodes, edges);
        setNodes(newNodes);
        setTimeout(() => {
          handlers.reactFlowInstance.current?.fitView({ padding: 0.2, duration: 200 });
        }, 100);
      },
      getReactFlowInstance: () => handlers.reactFlowInstance.current
    }), [nodes, edges, setNodes, handlers.reactFlowInstance]);

    // Delete node handler
    const handleDeleteNode = useCallback((nodeId: string) => {
      log.info(`[ReactFlowCanvas] Deleting node: ${nodeId}`);

      // Remove from local state
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));

      // Notify extension
      sendCommandToExtension('panel-delete-node', { nodeId });
      onNodeDelete?.(nodeId);

      selectNode(null);
      handlers.closeContextMenu();
    }, [setNodes, setEdges, selectNode, onNodeDelete, handlers]);

    // Delete edge handler
    const handleDeleteEdge = useCallback((edgeId: string) => {
      log.info(`[ReactFlowCanvas] Deleting edge: ${edgeId}`);

      const edge = edges.find((e) => e.id === edgeId);

      // Remove from local state
      setEdges((eds) => eds.filter((e) => e.id !== edgeId));

      // Notify extension
      if (edge) {
        const edgeData = edge.data as Record<string, unknown> | undefined;
        sendCommandToExtension('panel-delete-link', {
          edgeId,
          linkData: {
            source: edge.source,
            target: edge.target,
            sourceEndpoint: edgeData?.sourceEndpoint || '',
            targetEndpoint: edgeData?.targetEndpoint || ''
          }
        });
      }
      onEdgeDelete?.(edgeId);

      selectEdge(null);
      handlers.closeContextMenu();
    }, [edges, setEdges, selectEdge, onEdgeDelete, handlers]);

    // Build context menu items based on menu type
    const contextMenuItems = useMemo((): ContextMenuItem[] => {
      const { type, targetId } = handlers.contextMenu;
      const isEditMode = state.mode === 'edit';
      const isLocked = state.isLocked;
      const closeContextMenu = handlers.closeContextMenu;

      if (type === 'node' && targetId) {
        return buildNodeContextMenu({
          targetId, isEditMode, isLocked, closeContextMenu, editNode, handleDeleteNode
        });
      }

      if (type === 'edge' && targetId) {
        return buildEdgeContextMenu({
          targetId, isEditMode, isLocked, closeContextMenu, editEdge, handleDeleteEdge
        });
      }

      if (type === 'pane') {
        return buildPaneContextMenu({
          isEditMode, isLocked, closeContextMenu,
          reactFlowInstance: handlers.reactFlowInstance,
          nodes, edges, setNodes
        });
      }

      return [];
    }, [handlers, state.mode, state.isLocked, editNode, editEdge, handleDeleteNode, handleDeleteEdge, nodes, edges, setNodes]);

    // Keyboard handlers for delete
    useEffect(() => {
      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Delete' || event.key === 'Backspace') {
          if (state.mode !== 'edit' || state.isLocked) return;

          // Don't delete if we're in an input field
          if ((event.target as HTMLElement).tagName === 'INPUT' ||
              (event.target as HTMLElement).tagName === 'TEXTAREA') {
            return;
          }

          if (state.selectedNode) {
            handleDeleteNode(state.selectedNode);
          } else if (state.selectedEdge) {
            handleDeleteEdge(state.selectedEdge);
          }
        }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }, [state.mode, state.isLocked, state.selectedNode, state.selectedEdge, handleDeleteNode, handleDeleteEdge]);

    return (
      <div style={canvasStyle} className="react-flow-canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={handlers.handleNodesChange}
          onEdgesChange={onEdgesChange}
          onInit={handlers.onInit}
          onNodeClick={handlers.onNodeClick}
          onNodeDoubleClick={handlers.onNodeDoubleClick}
          onNodeDragStop={handlers.onNodeDragStop}
          onNodeContextMenu={handlers.onNodeContextMenu}
          onEdgeClick={handlers.onEdgeClick}
          onEdgeDoubleClick={handlers.onEdgeDoubleClick}
          onEdgeContextMenu={handlers.onEdgeContextMenu}
          onPaneClick={handlers.onPaneClick}
          onPaneContextMenu={handlers.onPaneContextMenu}
          onConnect={handlers.onConnect}
          fitView
          fitViewOptions={fitViewOptions}
          defaultViewport={defaultViewport}
          minZoom={0.1}
          maxZoom={4}
          snapToGrid
          snapGrid={[GRID_SIZE, GRID_SIZE]}
          selectionMode={SelectionMode.Partial}
          selectNodesOnDrag={false}
          panOnDrag
          selectionOnDrag={false}
          selectionKeyCode="Shift"
          connectionMode={ConnectionMode.Loose}
          proOptions={proOptions}
          deleteKeyCode={null}
          multiSelectionKeyCode="Shift"
          nodesDraggable={state.mode === 'edit' && !state.isLocked}
          nodesConnectable={state.mode === 'edit' && !state.isLocked}
          elementsSelectable
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={GRID_SIZE}
            size={1}
            color="#555"
          />
          <Controls
            showZoom
            showFitView
            showInteractive={false}
            position="bottom-right"
          />
          <MiniMap
            nodeColor={getMiniMapNodeColor}
            nodeStrokeWidth={3}
            zoomable
            pannable
            position="bottom-left"
          />
        </ReactFlow>

        {/* Context Menu */}
        <ContextMenu
          isVisible={handlers.contextMenu.type !== null}
          position={handlers.contextMenu.position}
          items={contextMenuItems}
          onClose={handlers.closeContextMenu}
        />
      </div>
    );
  }
);

ReactFlowCanvasComponent.displayName = 'ReactFlowCanvas';

export const ReactFlowCanvas = ReactFlowCanvasComponent;
