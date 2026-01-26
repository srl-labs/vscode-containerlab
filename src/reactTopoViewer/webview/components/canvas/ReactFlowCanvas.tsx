/**
 * ReactFlowCanvas - Main React Flow canvas component for topology visualization
 *
 * This is now a fully controlled component - nodes/edges come from GraphContext.
 * No internal state duplication.
 */
import React, {
  useRef,
  useImperativeHandle,
  forwardRef,
  useCallback,
  useMemo,
  useEffect,
  useState
} from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  SelectionMode,
  ConnectionMode,
  useStore
} from "@xyflow/react";
import type { Node, Edge, ReactFlowInstance, ConnectionLineComponentProps } from "@xyflow/react";

import "@xyflow/react/dist/style.css";

import { useTopoViewer } from "../../context/TopoViewerContext";
import { useGraph } from "../../context/GraphContext";
import { LinkCreationProvider } from "../../context/LinkCreationContext";
import { AnnotationHandlersProvider } from "../../context/AnnotationHandlersContext";
import { EdgeInfoProvider } from "../../context/EdgeInfoContext";
import { EdgeRenderConfigProvider } from "../../context/EdgeRenderConfigContext";
import { NodeRenderConfigProvider } from "../../context/NodeRenderConfigContext";
import { ContextMenu, type ContextMenuItem } from "../context-menu/ContextMenu";
import {
  useDeleteHandlers,
  useLinkCreation,
  useSourceNodePosition,
  useCanvasRefMethods,
  useCanvasHandlers,
  useAnnotationCanvasHandlers,
  GRID_SIZE
} from "../../hooks/canvas";
import { rafThrottle } from "../../utils/throttle";

import {
  buildNodeContextMenu,
  buildEdgeContextMenu,
  buildPaneContextMenu
} from "./contextMenuBuilders";
import { edgeTypes } from "./edges";
import { nodeTypes } from "./nodes";
import type { ReactFlowCanvasRef, ReactFlowCanvasProps } from "./types";

/**
 * Hook for building context menu items.
 */
function useContextMenuItems(
  handlers: ReturnType<typeof useCanvasHandlers>,
  state: { mode: "view" | "edit"; isLocked: boolean },
  editNode: (id: string | null) => void,
  editEdge: (id: string | null) => void,
  handleDeleteNode: (nodeId: string) => void,
  handleDeleteEdge: (edgeId: string) => void,
  nodesRef: React.RefObject<Node[]>,
  edgesRef: React.RefObject<Edge[]>,
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>,
  linkSourceNode: string | null,
  startLinkCreation: (nodeId: string) => void,
  cancelLinkCreation: () => void,
  annotationHandlers?: import("./types").AnnotationHandlers
): ContextMenuItem[] {
  const { type, targetId } = handlers.contextMenu;

  return useMemo(() => {
    const isEditMode = state.mode === "edit";
    const isLocked = state.isLocked;
    const nodes = nodesRef.current ?? [];
    const edges = edgesRef.current ?? [];

    if (type === "node" && targetId) {
      const targetNode = nodes.find((n) => n.id === targetId);
      const targetNodeType = targetNode?.type;

      return buildNodeContextMenu({
        targetId,
        targetNodeType,
        isEditMode,
        isLocked,
        closeContextMenu: handlers.closeContextMenu,
        editNode,
        handleDeleteNode,
        linkSourceNode,
        startLinkCreation,
        cancelLinkCreation,
        editFreeText: annotationHandlers?.onEditFreeText,
        editFreeShape: annotationHandlers?.onEditFreeShape,
        deleteFreeText: annotationHandlers?.onDeleteFreeText,
        deleteFreeShape: annotationHandlers?.onDeleteFreeShape,
        editGroup: annotationHandlers?.onEditGroup,
        deleteGroup: annotationHandlers?.onDeleteGroup
      });
    }
    if (type === "edge" && targetId) {
      return buildEdgeContextMenu({
        targetId,
        isEditMode,
        isLocked,
        closeContextMenu: handlers.closeContextMenu,
        editEdge,
        handleDeleteEdge
      });
    }
    if (type === "pane") {
      return buildPaneContextMenu({
        isEditMode,
        isLocked,
        closeContextMenu: handlers.closeContextMenu,
        reactFlowInstance: handlers.reactFlowInstance,
        nodes,
        edges,
        setNodes
      });
    }
    return [];
  }, [
    type,
    targetId,
    state.mode,
    state.isLocked,
    handlers.closeContextMenu,
    handlers.reactFlowInstance,
    editNode,
    editEdge,
    handleDeleteNode,
    handleDeleteEdge,
    nodesRef,
    edgesRef,
    setNodes,
    linkSourceNode,
    startLinkCreation,
    cancelLinkCreation,
    annotationHandlers
  ]);
}

/** Hook for wrapped node click handling */
function useWrappedNodeClick(
  linkSourceNode: string | null,
  completeLinkCreation: (nodeId: string) => void,
  onNodeClick: ReturnType<typeof useCanvasHandlers>["onNodeClick"]
) {
  return useCallback(
    (event: React.MouseEvent, node: { id: string; type?: string }) => {
      if (linkSourceNode) {
        const isLoopLink = linkSourceNode === node.id;
        const isCloudNode = node.type === "cloud-node";
        if (isLoopLink && isCloudNode) {
          return;
        }
        event.stopPropagation();
        completeLinkCreation(node.id);
        return;
      }
      onNodeClick(event, node as Parameters<typeof onNodeClick>[1]);
    },
    [linkSourceNode, completeLinkCreation, onNodeClick]
  );
}

/** CSS styles for the canvas */
const canvasStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0
};

/**
 * Custom connection line component
 */
const CustomConnectionLine: React.FC<ConnectionLineComponentProps> = ({
  fromX,
  fromY,
  toX,
  toY
}) => (
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
    <circle cx={toX} cy={toY} r={6} fill="#007acc" opacity={0.7} />
  </g>
);

// Constants
const proOptions = { hideAttribution: true };
const defaultViewport = { x: 0, y: 0, zoom: 1 };
const fitViewOptions = { padding: 0.2 };
const LOW_DETAIL_ZOOM_THRESHOLD = 0.5;
const LARGE_GRAPH_NODE_THRESHOLD = 600;
const LARGE_GRAPH_EDGE_THRESHOLD = 900;

/**
 * Inner component that uses useStore (requires ReactFlowProvider ancestor)
 * Now fully controlled - nodes/edges come from GraphContext (unified source of truth).
 * All nodes (topology + annotation) are in the same array.
 */
const ReactFlowCanvasInner = forwardRef<ReactFlowCanvasRef, ReactFlowCanvasProps>(
  (
    {
      nodes: propNodes,
      edges: propEdges,
      annotationMode,
      annotationHandlers,
      onNodeDelete,
      onEdgeDelete,
      linkLabelMode = "show-all",
      onInit: onInitProp,
      onEdgeCreated,
      onShiftClickCreate
    },
    ref
  ) => {
    const { state, selectNode, selectEdge, editNode, editEdge } = useTopoViewer();

    // Get setters from GraphContext - these update the single source of truth
    const { setNodes, setEdges, onNodesChange, onEdgesChange } = useGraph();

    const floatingPanelRef = useRef<{ triggerShake: () => void } | null>(null);

    // All nodes (topology + annotation) are now unified in propNodes
    const allNodes = (propNodes as Node[]) ?? [];

    // Refs for context menu (to avoid re-renders)
    const nodesRef = useRef<Node[]>(allNodes);
    const edgesRef = useRef<Edge[]>((propEdges as Edge[]) ?? []);
    nodesRef.current = allNodes;
    edgesRef.current = (propEdges as Edge[]) ?? [];

    const handlers = useCanvasHandlers({
      selectNode,
      selectEdge,
      editNode,
      editEdge,
      mode: state.mode,
      isLocked: state.isLocked,
      onNodesChangeBase: onNodesChange,
      onLockedAction: () => floatingPanelRef.current?.triggerShake(),
      nodes: allNodes,
      setNodes,
      onEdgeCreated,
      groupMemberHandlers: {
        getGroupMembers: annotationHandlers?.getGroupMembers,
        onNodeDropped: annotationHandlers?.onNodeDropped
      }
    });

    const { linkSourceNode, startLinkCreation, completeLinkCreation, cancelLinkCreation } =
      useLinkCreation(onEdgeCreated);
    const { handleDeleteNode, handleDeleteEdge } = useDeleteHandlers(
      selectNode,
      selectEdge,
      handlers.closeContextMenu,
      onNodeDelete,
      onEdgeDelete
    );
    const sourceNodePosition = useSourceNodePosition(linkSourceNode, allNodes);

    const isLargeGraph =
      allNodes.length >= LARGE_GRAPH_NODE_THRESHOLD ||
      (propEdges?.length ?? 0) >= LARGE_GRAPH_EDGE_THRESHOLD;
    const isLowDetail = useStore(
      useCallback(
        (store) => {
          const zoom = store.transform[2];
          return isLargeGraph && zoom <= LOW_DETAIL_ZOOM_THRESHOLD;
        },
        [isLargeGraph]
      ),
      (left, right) => left === right
    );

    // Note: Keyboard delete handling is done by useAppKeyboardShortcuts in App.tsx
    // which uses handleDeleteNode for proper undo/redo support.
    // Do NOT add useKeyboardDeleteHandlers here as it bypasses the undo system.

    const refMethods = useCanvasRefMethods(
      handlers.reactFlowInstance,
      allNodes,
      (propEdges as Edge[]) ?? [],
      setNodes,
      setEdges
    );
    useImperativeHandle(ref, () => refMethods, [refMethods]);

    const wrappedOnNodeClick = useWrappedNodeClick(
      linkSourceNode,
      completeLinkCreation,
      handlers.onNodeClick
    );
    const contextMenuItems = useContextMenuItems(
      handlers,
      state,
      editNode,
      editEdge,
      handleDeleteNode,
      handleDeleteEdge,
      nodesRef,
      edgesRef,
      setNodes,
      linkSourceNode,
      startLinkCreation,
      cancelLinkCreation,
      annotationHandlers
    );

    const {
      wrappedOnPaneClick,
      wrappedOnNodeDoubleClick,
      wrappedOnNodeDragStart,
      wrappedOnNodeDragStop,
      isInAddMode,
      addModeMessage
    } = useAnnotationCanvasHandlers({
      mode: state.mode,
      isLocked: state.isLocked,
      annotationMode,
      annotationHandlers,
      reactFlowInstanceRef: handlers.reactFlowInstance,
      baseOnPaneClick: handlers.onPaneClick,
      baseOnNodeDoubleClick: handlers.onNodeDoubleClick,
      baseOnNodeDragStart: handlers.onNodeDragStart,
      baseOnNodeDragStop: handlers.onNodeDragStop,
      onShiftClickCreate
    });

    const handleNodeDragStart = useCallback(
      (event: React.MouseEvent, node: Node) => {
        wrappedOnNodeDragStart(event, node);
      },
      [wrappedOnNodeDragStart]
    );

    const handleNodeDrag = useCallback(
      (event: React.MouseEvent, node: Node) => {
        handlers.onNodeDrag(event, node);
      },
      [handlers.onNodeDrag]
    );

    const handleNodeDragStop = useCallback(
      (event: React.MouseEvent, node: Node) => {
        wrappedOnNodeDragStop(event, node);
      },
      [wrappedOnNodeDragStop]
    );

    const edgeRenderConfig = useMemo(
      () => ({
        labelMode: linkLabelMode,
        suppressLabels: isLowDetail,
        suppressHitArea: isLowDetail
      }),
      [linkLabelMode, isLowDetail]
    );

    const nodeRenderConfig = useMemo(
      () => ({
        suppressLabels: isLowDetail
      }),
      [isLowDetail]
    );

    const wrappedOnInit = useCallback(
      (instance: ReactFlowInstance) => {
        handlers.onInit(instance);
        onInitProp?.(instance);
      },
      [handlers.onInit, onInitProp]
    );

    return (
      <div style={canvasStyle} className="react-flow-canvas">
        <NodeRenderConfigProvider value={nodeRenderConfig}>
          <EdgeRenderConfigProvider value={edgeRenderConfig}>
            <EdgeInfoProvider>
              <AnnotationHandlersProvider handlers={annotationHandlers}>
                <LinkCreationProvider linkSourceNode={linkSourceNode}>
                  <ReactFlow
                    nodes={allNodes}
                    edges={(propEdges as Edge[]) ?? []}
                    nodeTypes={nodeTypes}
                    edgeTypes={edgeTypes}
                    onNodesChange={handlers.handleNodesChange}
                    onEdgesChange={onEdgesChange}
                    onInit={wrappedOnInit}
                    onNodeClick={wrappedOnNodeClick}
                    onNodeDoubleClick={wrappedOnNodeDoubleClick}
                    onNodeDragStart={handleNodeDragStart}
                    onNodeDrag={handleNodeDrag}
                    onNodeDragStop={handleNodeDragStop}
                    onNodeContextMenu={handlers.onNodeContextMenu}
                    onEdgeClick={handlers.onEdgeClick}
                    onEdgeDoubleClick={handlers.onEdgeDoubleClick}
                    onEdgeContextMenu={handlers.onEdgeContextMenu}
                    onPaneClick={wrappedOnPaneClick}
                    onPaneContextMenu={handlers.onPaneContextMenu}
                    onConnect={handlers.onConnect}
                    onSelectionChange={handlers.onSelectionChange}
                    connectionLineComponent={CustomConnectionLine}
                    fitView
                    fitViewOptions={fitViewOptions}
                    defaultViewport={defaultViewport}
                    minZoom={0.1}
                    maxZoom={Infinity}
                    onlyRenderVisibleElements={!isLowDetail}
                    selectionMode={SelectionMode.Partial}
                    selectNodesOnDrag={false}
                    panOnDrag={!isInAddMode}
                    selectionOnDrag={!isInAddMode}
                    selectionKeyCode="Shift"
                    connectionMode={ConnectionMode.Loose}
                    proOptions={proOptions}
                    deleteKeyCode={null}
                    multiSelectionKeyCode="Shift"
                    nodesDraggable={state.mode === "edit" && !state.isLocked}
                    nodesConnectable={state.mode === "edit" && !state.isLocked}
                    elementsSelectable
                  >
                    {!isLowDetail && (
                      <Background
                        variant={BackgroundVariant.Dots}
                        gap={GRID_SIZE}
                        size={1}
                        color="#555"
                      />
                    )}
                  </ReactFlow>
                </LinkCreationProvider>
              </AnnotationHandlersProvider>
            </EdgeInfoProvider>
          </EdgeRenderConfigProvider>
        </NodeRenderConfigProvider>

        <ContextMenu
          isVisible={handlers.contextMenu.type !== null}
          position={handlers.contextMenu.position}
          items={contextMenuItems}
          onClose={handlers.closeContextMenu}
        />

        {linkSourceNode && sourceNodePosition && handlers.reactFlowInstance.current && (
          <LinkCreationLine
            sourcePosition={sourceNodePosition}
            reactFlowInstance={handlers.reactFlowInstance.current}
          />
        )}

        {linkSourceNode && <LinkCreationIndicator linkSourceNode={linkSourceNode} />}

        {isInAddMode && addModeMessage && <AnnotationModeIndicator message={addModeMessage} />}
      </div>
    );
  }
);

/** Annotation mode indicator component */
const AnnotationModeIndicator: React.FC<{ message: string }> = ({ message }) => (
  <div
    style={{
      position: "absolute",
      top: 10,
      left: "50%",
      transform: "translateX(-50%)",
      background: "var(--vscode-editor-background, #1e1e1e)",
      border: "1px solid var(--vscode-charts-green, #4ec9b0)",
      borderRadius: 4,
      padding: "6px 12px",
      fontSize: 12,
      color: "var(--vscode-editor-foreground, #cccccc)",
      zIndex: 1000,
      pointerEvents: "none"
    }}
  >
    {message}
  </div>
);

/** Link creation indicator component */
const LinkCreationIndicator: React.FC<{ linkSourceNode: string }> = ({ linkSourceNode }) => (
  <div
    style={{
      position: "absolute",
      top: 10,
      left: "50%",
      transform: "translateX(-50%)",
      background: "var(--vscode-editor-background, #1e1e1e)",
      border: "1px solid var(--vscode-focusBorder, #007acc)",
      borderRadius: 4,
      padding: "6px 12px",
      fontSize: 12,
      color: "var(--vscode-editor-foreground, #cccccc)",
      zIndex: 1000,
      pointerEvents: "none"
    }}
  >
    Creating link from <strong>{linkSourceNode}</strong> — Click on target node or press Escape to
    cancel
  </div>
);

/** Visual line component for link creation mode */
interface LinkCreationLineProps {
  sourcePosition: { x: number; y: number };
  reactFlowInstance: ReactFlowInstance;
}

const LINK_LINE_SVG_STYLE: React.CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  width: "100%",
  height: "100%",
  pointerEvents: "none",
  zIndex: 999
};

let cachedContainerBounds: DOMRect | null = null;
let boundsLastUpdated = 0;
const BOUNDS_CACHE_DURATION = 100;

function getContainerBounds(): DOMRect | null {
  const now = Date.now();
  if (cachedContainerBounds && now - boundsLastUpdated < BOUNDS_CACHE_DURATION) {
    return cachedContainerBounds;
  }
  const container = document.querySelector(".react-flow-canvas");
  if (!container) return null;
  cachedContainerBounds = container.getBoundingClientRect();
  boundsLastUpdated = now;
  return cachedContainerBounds;
}

const LinkCreationLine = React.memo<LinkCreationLineProps>(
  ({ sourcePosition, reactFlowInstance }) => {
    const [mousePosition, setMousePosition] = useState<{ x: number; y: number } | null>(null);

    useEffect(() => {
      const throttledSetPosition = rafThrottle((x: number, y: number) => {
        setMousePosition({ x, y });
      });

      const handleMouseMove = (e: MouseEvent) => {
        throttledSetPosition(e.clientX, e.clientY);
      };

      window.addEventListener("mousemove", handleMouseMove);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        throttledSetPosition.cancel();
      };
    }, []);

    if (!mousePosition) return null;

    const viewport = reactFlowInstance.getViewport();
    const screenSourceX = sourcePosition.x * viewport.zoom + viewport.x;
    const screenSourceY = sourcePosition.y * viewport.zoom + viewport.y;

    const bounds = getContainerBounds();
    if (!bounds) return null;
    const relativeMouseX = mousePosition.x - bounds.left;
    const relativeMouseY = mousePosition.y - bounds.top;

    return (
      <svg style={LINK_LINE_SVG_STYLE}>
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
  }
);

ReactFlowCanvasInner.displayName = "ReactFlowCanvasInner";

/**
 * Outer wrapper that provides ReactFlowProvider context.
 */
const ReactFlowCanvasComponent = forwardRef<ReactFlowCanvasRef, ReactFlowCanvasProps>(
  (props, ref) => (
    <ReactFlowProvider>
      <ReactFlowCanvasInner ref={ref} {...props} />
    </ReactFlowProvider>
  )
);

ReactFlowCanvasComponent.displayName = "ReactFlowCanvas";

export const ReactFlowCanvas = ReactFlowCanvasComponent;
