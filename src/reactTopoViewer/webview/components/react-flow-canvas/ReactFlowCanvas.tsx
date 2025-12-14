/**
 * ReactFlowCanvas - Main React Flow canvas component for topology visualization
 * Full-featured canvas with grid snapping, node creation, edge creation, context menus
 */
import React, {
  useRef,
  useImperativeHandle,
  forwardRef,
  useCallback,
  useMemo,
  useEffect
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
import { isLineHandleActive } from './nodes/AnnotationHandles';
import { useTopoViewer } from '../../context/TopoViewerContext';
import { LinkCreationProvider } from '../../context/LinkCreationContext';
import { AnnotationHandlersProvider } from '../../context/AnnotationHandlersContext';
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
  useAnnotationCanvasHandlers,
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
  cancelLinkCreation: () => void,
  annotationHandlers?: import('./types').AnnotationHandlers
): ContextMenuItem[] {
  return useMemo(() => {
    const { type, targetId } = handlers.contextMenu;
    const isEditMode = state.mode === 'edit';
    const isLocked = state.isLocked;

    if (type === 'node' && targetId) {
      // Find the node to get its type
      const targetNode = nodes.find(n => n.id === targetId);
      const targetNodeType = targetNode?.type;

      return buildNodeContextMenu({
        targetId, targetNodeType, isEditMode, isLocked, closeContextMenu: handlers.closeContextMenu, editNode, handleDeleteNode,
        linkSourceNode, startLinkCreation, cancelLinkCreation,
        editFreeText: annotationHandlers?.onEditFreeText,
        editFreeShape: annotationHandlers?.onEditFreeShape,
        deleteFreeText: annotationHandlers?.onDeleteFreeText,
        deleteFreeShape: annotationHandlers?.onDeleteFreeShape
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
  }, [handlers, state.mode, state.isLocked, editNode, editEdge, handleDeleteNode, handleDeleteEdge, nodes, edges, setNodes, linkSourceNode, startLinkCreation, cancelLinkCreation, annotationHandlers]);
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
/** Node type constants */
const ANNOTATION_NODE_TYPES_SET = new Set(['free-text-node', 'free-shape-node']);

/**
 * Hook to sync annotation nodes into the React Flow nodes state.
 * This ensures React Flow can update annotation node positions during drag.
 * - Adds new annotation nodes to nodes state
 * - Updates data for existing annotation nodes (preserving React Flow's position)
 * - Removes annotation nodes that no longer exist in annotationNodes
 */
function useSyncAnnotationNodes(
  annotationNodes: Node[] | undefined,
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>
) {
  useEffect(() => {
    if (!annotationNodes) return;

    setNodes(currentNodes => {
      const incomingById = new Map<string, Node>();
      for (const node of annotationNodes) {
        incomingById.set(node.id, node);
      }

      const nextNodes: Node[] = [];

      // Update existing nodes in-place (preserve React Flow internals like `selected`)
      for (const currentNode of currentNodes) {
        const isAnnotation = ANNOTATION_NODE_TYPES_SET.has(currentNode.type || '');
        if (!isAnnotation) {
          nextNodes.push(currentNode);
          continue;
        }

        const incoming = incomingById.get(currentNode.id);
        if (!incoming) {
          // Annotation was removed
          continue;
        }
        incomingById.delete(currentNode.id);

        // When a line handle is being dragged, use the incoming position
        // (computed from annotation data) to properly update the node's visual position.
        // Otherwise, preserve React Flow's position to avoid jitter during node dragging.
        const isLineNode = currentNode.type === 'free-shape-node' &&
          (incoming.data as { shapeType?: string })?.shapeType === 'line';
        const useIncomingPosition = isLineNode && isLineHandleActive();

        nextNodes.push({
          ...currentNode,
          ...incoming,
          position: useIncomingPosition ? incoming.position : currentNode.position,
          // Always update to the latest annotation data.
          data: incoming.data,
          // Preserve selection/dragging state managed by React Flow.
          selected: currentNode.selected,
          dragging: currentNode.dragging
        });
      }

      // Add any new annotation nodes that weren't in the current state yet
      for (const node of incomingById.values()) {
        nextNodes.push(node);
      }

      return nextNodes;
    });
  }, [annotationNodes, setNodes]);
}

const ReactFlowCanvasComponent = forwardRef<ReactFlowCanvasRef, ReactFlowCanvasProps>(
  ({ elements, annotationNodes, annotationMode, annotationHandlers, onNodeDelete, onEdgeDelete }, ref) => {
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
    useSyncAnnotationNodes(annotationNodes, setNodes);

    const { linkSourceNode, mousePosition, startLinkCreation, completeLinkCreation, cancelLinkCreation } = useLinkCreation(setEdges);
    const { handleDeleteNode, handleDeleteEdge } = useDeleteHandlers(edges, setNodes, setEdges, selectNode, selectEdge, handlers.closeContextMenu, onNodeDelete, onEdgeDelete);
    const sourceNodePosition = useSourceNodePosition(linkSourceNode, nodes);

    useKeyboardDeleteHandlers(state.mode, state.isLocked, state.selectedNode, state.selectedEdge, handleDeleteNode, handleDeleteEdge);

    const refMethods = useCanvasRefMethods(handlers.reactFlowInstance, nodes, edges, setNodes);
    useImperativeHandle(ref, () => refMethods, [refMethods]);

    const wrappedOnNodeClick = useWrappedNodeClick(linkSourceNode, completeLinkCreation, handlers.onNodeClick);
    const contextMenuItems = useContextMenuItems(handlers, state, editNode, editEdge, handleDeleteNode, handleDeleteEdge, nodes, edges, setNodes, linkSourceNode, startLinkCreation, cancelLinkCreation, annotationHandlers);

    // Use annotation canvas handlers hook for annotation-related interactions
    const { wrappedOnPaneClick, wrappedOnNodeDoubleClick, wrappedOnNodeDragStop, isInAddMode, addModeMessage } = useAnnotationCanvasHandlers({
      mode: state.mode, isLocked: state.isLocked, annotationMode, annotationHandlers,
      reactFlowInstanceRef: handlers.reactFlowInstance,
      baseOnPaneClick: handlers.onPaneClick, baseOnNodeDoubleClick: handlers.onNodeDoubleClick, baseOnNodeDragStop: handlers.onNodeDragStop
    });

    return (
      <div style={canvasStyle} className="react-flow-canvas">
        <AnnotationHandlersProvider handlers={annotationHandlers}>
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
            onNodeDoubleClick={wrappedOnNodeDoubleClick}
            onNodeDragStop={wrappedOnNodeDragStop}
            onNodeContextMenu={handlers.onNodeContextMenu}
            onEdgeClick={handlers.onEdgeClick}
            onEdgeDoubleClick={handlers.onEdgeDoubleClick}
            onEdgeContextMenu={handlers.onEdgeContextMenu}
            onPaneClick={wrappedOnPaneClick}
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
            panOnDrag={!isInAddMode}
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
        </AnnotationHandlersProvider>

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

        {isInAddMode && addModeMessage && (
          <AnnotationModeIndicator message={addModeMessage} />
        )}
      </div>
    );
  }
);

/** Annotation mode indicator component */
const AnnotationModeIndicator: React.FC<{ message: string }> = ({ message }) => (
  <div
    style={{
      position: 'absolute',
      top: 10,
      left: '50%',
      transform: 'translateX(-50%)',
      background: 'var(--vscode-editor-background, #1e1e1e)',
      border: '1px solid var(--vscode-charts-green, #4ec9b0)',
      borderRadius: 4,
      padding: '6px 12px',
      fontSize: 12,
      color: 'var(--vscode-editor-foreground, #cccccc)',
      zIndex: 1000,
      pointerEvents: 'none'
    }}
  >
    {message}
  </div>
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
