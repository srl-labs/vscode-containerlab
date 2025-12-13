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
  useNodesState,
  useEdgesState,
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

    // Link creation mode state
    const [linkSourceNode, setLinkSourceNode] = useState<string | null>(null);
    const [mousePosition, setMousePosition] = useState<{ x: number; y: number } | null>(null);

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

    // Link creation handlers
    const startLinkCreation = useCallback((nodeId: string) => {
      log.info(`[ReactFlowCanvas] Starting link creation from: ${nodeId}`);
      setLinkSourceNode(nodeId);
    }, []);

    const completeLinkCreation = useCallback((targetNodeId: string) => {
      if (!linkSourceNode || linkSourceNode === targetNodeId) return;

      log.info(`[ReactFlowCanvas] Completing link: ${linkSourceNode} -> ${targetNodeId}`);

      const edgeId = `${linkSourceNode}-${targetNodeId}-${Date.now()}`;

      // Send to extension to create in YAML
      sendCommandToExtension('create-link', {
        linkData: {
          id: edgeId,
          source: linkSourceNode,
          target: targetNodeId,
          sourceEndpoint: 'eth1',
          targetEndpoint: 'eth1'
        }
      });

      // Add to local state for immediate feedback
      const newEdge = {
        id: edgeId,
        source: linkSourceNode,
        target: targetNodeId,
        type: 'topology-edge',
        data: {
          sourceEndpoint: 'eth1',
          targetEndpoint: 'eth1',
          linkStatus: 'unknown'
        }
      };

      setEdges((eds) => [...eds, newEdge]);
      setLinkSourceNode(null);
      setMousePosition(null);
    }, [linkSourceNode, setEdges]);

    const cancelLinkCreation = useCallback(() => {
      log.info('[ReactFlowCanvas] Cancelling link creation');
      setLinkSourceNode(null);
      setMousePosition(null);
    }, []);

    // Track mouse movement when in link creation mode
    useEffect(() => {
      if (!linkSourceNode) return;

      const handleMouseMove = (e: MouseEvent) => {
        setMousePosition({ x: e.clientX, y: e.clientY });
      };

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          cancelLinkCreation();
        }
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('keydown', handleKeyDown);

      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('keydown', handleKeyDown);
      };
    }, [linkSourceNode, cancelLinkCreation]);

    // Get source node position for drawing the connection line
    const sourceNodePosition = useMemo(() => {
      if (!linkSourceNode) return null;
      const node = nodes.find(n => n.id === linkSourceNode);
      if (!node) return null;
      // Get the center of the node (approximate)
      const nodeWidth = 60; // Default node width
      const nodeHeight = 60; // Default node height
      return {
        x: node.position.x + nodeWidth / 2,
        y: node.position.y + nodeHeight / 2
      };
    }, [linkSourceNode, nodes]);

    // Handle node click to complete link when in link creation mode
    const handleNodeClickForLink = useCallback((event: React.MouseEvent, nodeId: string) => {
      if (linkSourceNode && linkSourceNode !== nodeId) {
        event.stopPropagation();
        completeLinkCreation(nodeId);
      }
    }, [linkSourceNode, completeLinkCreation]);

    // Wrapped node click handler that checks for link creation mode first
    const wrappedOnNodeClick = useCallback((event: React.MouseEvent, node: { id: string }) => {
      if (linkSourceNode) {
        handleNodeClickForLink(event, node.id);
        return;
      }
      // Fall through to default handler
      handlers.onNodeClick(event, node as Parameters<typeof handlers.onNodeClick>[1]);
    }, [linkSourceNode, handleNodeClickForLink, handlers]);

    // Build context menu items based on menu type
    const contextMenuItems = useMemo((): ContextMenuItem[] => {
      const { type, targetId } = handlers.contextMenu;
      const isEditMode = state.mode === 'edit';
      const isLocked = state.isLocked;
      const closeContextMenu = handlers.closeContextMenu;

      if (type === 'node' && targetId) {
        return buildNodeContextMenu({
          targetId, isEditMode, isLocked, closeContextMenu, editNode, handleDeleteNode,
          linkSourceNode, startLinkCreation, cancelLinkCreation
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
    }, [handlers, state.mode, state.isLocked, editNode, editEdge, handleDeleteNode, handleDeleteEdge, nodes, edges, setNodes, linkSourceNode, startLinkCreation, cancelLinkCreation]);

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
          onNodeClick={wrappedOnNodeClick}
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
        </ReactFlow>

        {/* Context Menu */}
        <ContextMenu
          isVisible={handlers.contextMenu.type !== null}
          position={handlers.contextMenu.position}
          items={contextMenuItems}
          onClose={handlers.closeContextMenu}
        />

        {/* Link Creation Visual Line */}
        {linkSourceNode && mousePosition && sourceNodePosition && handlers.reactFlowInstance.current && (
          <LinkCreationLine
            sourcePosition={sourceNodePosition}
            mousePosition={mousePosition}
            reactFlowInstance={handlers.reactFlowInstance.current}
          />
        )}

        {/* Link Creation Mode Indicator */}
        {linkSourceNode && (
          <div
            style={{
              position: 'absolute',
              top: 10,
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'var(--vscode-editor-background, #1e1e1e)',
              border: '1px solid var(--vscode-focusBorder, #007acc)',
              borderRadius: 4,
              padding: '6px 12px',
              fontSize: 12,
              color: 'var(--vscode-editor-foreground, #cccccc)',
              zIndex: 1000,
              pointerEvents: 'none'
            }}
          >
            Creating link from <strong>{linkSourceNode}</strong> — Click on target node or press Escape to cancel
          </div>
        )}
      </div>
    );
  }
);

/**
 * Visual line component for link creation mode
 */
interface LinkCreationLineProps {
  sourcePosition: { x: number; y: number };
  mousePosition: { x: number; y: number };
  reactFlowInstance: ReactFlowInstance;
}

const LinkCreationLine: React.FC<LinkCreationLineProps> = ({
  sourcePosition,
  mousePosition,
  reactFlowInstance
}) => {
  // Convert source position (flow coordinates) to screen coordinates
  const viewport = reactFlowInstance.getViewport();
  const screenSourceX = sourcePosition.x * viewport.zoom + viewport.x;
  const screenSourceY = sourcePosition.y * viewport.zoom + viewport.y;

  // Get the canvas container bounds
  const container = document.querySelector('.react-flow-canvas');
  if (!container) return null;
  const bounds = container.getBoundingClientRect();

  // Calculate relative mouse position within the canvas
  const relativeMouseX = mousePosition.x - bounds.left;
  const relativeMouseY = mousePosition.y - bounds.top;

  return (
    <svg
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 999
      }}
    >
      <line
        x1={screenSourceX}
        y1={screenSourceY}
        x2={relativeMouseX}
        y2={relativeMouseY}
        stroke="#007acc"
        strokeWidth={2}
        strokeDasharray="5,5"
      />
      <circle
        cx={relativeMouseX}
        cy={relativeMouseY}
        r={6}
        fill="#007acc"
        opacity={0.7}
      />
    </svg>
  );
};

ReactFlowCanvasComponent.displayName = 'ReactFlowCanvas';

export const ReactFlowCanvas = ReactFlowCanvasComponent;
