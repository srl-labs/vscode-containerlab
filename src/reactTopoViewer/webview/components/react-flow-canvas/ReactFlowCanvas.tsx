/**
 * ReactFlowCanvas - Main React Flow canvas component for topology visualization
 * Full-featured canvas with grid snapping, node creation, edge creation, context menus
 */
import React, {
  useRef,
  useImperativeHandle,
  forwardRef,
  useCallback,
  useMemo
} from 'react';
import {
  ReactFlow,
  Background,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
  SelectionMode,
  ConnectionMode,
  type ReactFlowInstance,
  type ConnectionLineComponentProps
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import type { ReactFlowCanvasRef, ReactFlowCanvasProps } from './types';
import { nodeTypes } from './nodes';
import { edgeTypes } from './edges';
import { useTopoViewer } from '../../context/TopoViewerContext';
import { LinkCreationProvider } from '../../context/LinkCreationContext';
import { ContextMenu, type ContextMenuItem } from '../context-menu/ContextMenu';
import { buildNodeContextMenu, buildEdgeContextMenu, buildPaneContextMenu } from './contextMenuBuilders';
import {
  useElementConversion,
  useDeleteHandlers,
  useLinkCreation,
  useSourceNodePosition,
  useKeyboardDeleteHandlers,
  useCanvasRefMethods,
  useCanvasHandlers,
  GRID_SIZE
} from '../../hooks/react-flow';
import type { Node, Edge } from '@xyflow/react';

/** Hook for building context menu items */
function useContextMenuItems(
  handlers: ReturnType<typeof useCanvasHandlers>,
  state: { mode: 'view' | 'edit'; isLocked: boolean },
  editNode: (id: string | null) => void,
  editEdge: (id: string | null) => void,
  handleDeleteNode: (nodeId: string) => void,
  handleDeleteEdge: (edgeId: string) => void,
  nodes: Node[],
  edges: Edge[],
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>,
  linkSourceNode: string | null,
  startLinkCreation: (nodeId: string) => void,
  cancelLinkCreation: () => void
): ContextMenuItem[] {
  return useMemo(() => {
    const { type, targetId } = handlers.contextMenu;
    const isEditMode = state.mode === 'edit';
    const isLocked = state.isLocked;

    if (type === 'node' && targetId) {
      return buildNodeContextMenu({
        targetId, isEditMode, isLocked, closeContextMenu: handlers.closeContextMenu, editNode, handleDeleteNode,
        linkSourceNode, startLinkCreation, cancelLinkCreation
      });
    }
    if (type === 'edge' && targetId) {
      return buildEdgeContextMenu({
        targetId, isEditMode, isLocked, closeContextMenu: handlers.closeContextMenu, editEdge, handleDeleteEdge
      });
    }
    if (type === 'pane') {
      return buildPaneContextMenu({
        isEditMode, isLocked, closeContextMenu: handlers.closeContextMenu,
        reactFlowInstance: handlers.reactFlowInstance, nodes, edges, setNodes
      });
    }
    return [];
  }, [handlers, state.mode, state.isLocked, editNode, editEdge, handleDeleteNode, handleDeleteEdge, nodes, edges, setNodes, linkSourceNode, startLinkCreation, cancelLinkCreation]);
}

/** Hook for wrapped node click handling */
function useWrappedNodeClick(
  linkSourceNode: string | null,
  completeLinkCreation: (nodeId: string) => void,
  onNodeClick: ReturnType<typeof useCanvasHandlers>['onNodeClick']
) {
  return useCallback((event: React.MouseEvent, node: { id: string; type?: string }) => {
    // When in link creation mode, complete the link
    if (linkSourceNode) {
      // Prevent loop links on cloud nodes
      const isLoopLink = linkSourceNode === node.id;
      const isCloudNode = node.type === 'cloud-node';
      if (isLoopLink && isCloudNode) {
        // Don't complete - cloud nodes don't support loop links
        return;
      }
      event.stopPropagation();
      completeLinkCreation(node.id);
      return;
    }
    onNodeClick(event, node as Parameters<typeof onNodeClick>[1]);
  }, [linkSourceNode, completeLinkCreation, onNodeClick]);
}

/** CSS styles for the canvas */
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
 * Custom connection line component - matches the context menu link creation style
 * Shows a dashed blue line with a circle at the cursor position
 */
const CustomConnectionLine: React.FC<ConnectionLineComponentProps> = ({
  fromX,
  fromY,
  toX,
  toY
}) => {
  return (
    <g>
      <line
        x1={fromX}
        y1={fromY}
        x2={toX}
        y2={toY}
        stroke="#007acc"
        strokeWidth={2}
        strokeDasharray="5,5"
      />
      <circle
        cx={toX}
        cy={toY}
        r={6}
        fill="#007acc"
        opacity={0.7}
      />
    </g>
  );
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
    const floatingPanelRef = useRef<{ triggerShake: () => void } | null>(null);

    const handlers = useCanvasHandlers({
      selectNode, selectEdge, editNode, editEdge,
      mode: state.mode, isLocked: state.isLocked,
      onNodesChangeBase: onNodesChange, onEdgesChangeBase: onEdgesChange,
      setEdges, onLockedAction: () => floatingPanelRef.current?.triggerShake()
    });

    useElementConversion(elements, setNodes, setEdges);

    const { linkSourceNode, mousePosition, startLinkCreation, completeLinkCreation, cancelLinkCreation } = useLinkCreation(setEdges);
    const { handleDeleteNode, handleDeleteEdge } = useDeleteHandlers(edges, setNodes, setEdges, selectNode, selectEdge, handlers.closeContextMenu, onNodeDelete, onEdgeDelete);
    const sourceNodePosition = useSourceNodePosition(linkSourceNode, nodes);

    useKeyboardDeleteHandlers(state.mode, state.isLocked, state.selectedNode, state.selectedEdge, handleDeleteNode, handleDeleteEdge);

    const refMethods = useCanvasRefMethods(handlers.reactFlowInstance, nodes, edges, setNodes);
    useImperativeHandle(ref, () => refMethods, [refMethods]);

    const wrappedOnNodeClick = useWrappedNodeClick(linkSourceNode, completeLinkCreation, handlers.onNodeClick);
    const contextMenuItems = useContextMenuItems(handlers, state, editNode, editEdge, handleDeleteNode, handleDeleteEdge, nodes, edges, setNodes, linkSourceNode, startLinkCreation, cancelLinkCreation);

    return (
      <div style={canvasStyle} className="react-flow-canvas">
        <LinkCreationProvider linkSourceNode={linkSourceNode}>
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
            connectionLineComponent={CustomConnectionLine}
            fitView
            fitViewOptions={fitViewOptions}
            defaultViewport={defaultViewport}
            minZoom={0.1}
            maxZoom={Infinity}
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
            <Background variant={BackgroundVariant.Dots} gap={GRID_SIZE} size={1} color="#555" />
          </ReactFlow>
        </LinkCreationProvider>

        <ContextMenu
          isVisible={handlers.contextMenu.type !== null}
          position={handlers.contextMenu.position}
          items={contextMenuItems}
          onClose={handlers.closeContextMenu}
        />

        {linkSourceNode && mousePosition && sourceNodePosition && handlers.reactFlowInstance.current && (
          <LinkCreationLine
            sourcePosition={sourceNodePosition}
            mousePosition={mousePosition}
            reactFlowInstance={handlers.reactFlowInstance.current}
          />
        )}

        {linkSourceNode && (
          <LinkCreationIndicator linkSourceNode={linkSourceNode} />
        )}
      </div>
    );
  }
);

/** Link creation indicator component */
const LinkCreationIndicator: React.FC<{ linkSourceNode: string }> = ({ linkSourceNode }) => (
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
);

/** Visual line component for link creation mode */
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
  const viewport = reactFlowInstance.getViewport();
  const screenSourceX = sourcePosition.x * viewport.zoom + viewport.x;
  const screenSourceY = sourcePosition.y * viewport.zoom + viewport.y;

  const container = document.querySelector('.react-flow-canvas');
  if (!container) return null;
  const bounds = container.getBoundingClientRect();
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
      <circle cx={relativeMouseX} cy={relativeMouseY} r={6} fill="#007acc" opacity={0.7} />
    </svg>
  );
};

ReactFlowCanvasComponent.displayName = 'ReactFlowCanvas';

export const ReactFlowCanvas = ReactFlowCanvasComponent;
