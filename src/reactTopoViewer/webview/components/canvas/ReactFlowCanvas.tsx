// Main React Flow canvas component.
import React, {
  useRef,
  useImperativeHandle,
  forwardRef,
  useCallback,
  useMemo,
  useEffect,
  useState
} from "react";
import { flushSync } from "react-dom";
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  useStore,
  type Edge,
  type Node,
  type ReactFlowInstance
} from "@xyflow/react";

import {
  FREE_SHAPE_NODE_TYPE,
  FREE_TEXT_NODE_TYPE,
  GROUP_NODE_TYPE,
  isAnnotationNodeType
} from "../../annotations/annotationNodeConverters";
import {
  useAnnotationCanvasHandlers,
  useCanvasHandlers,
  useCanvasRefMethods,
  useDeleteHandlers,
  useGeoMapLayout,
  useHelperLines,
  useLinkCreation,
  useSourceNodePosition
} from "../../hooks/canvas";
import { DEFAULT_GRID_LINE_WIDTH } from "../../hooks/ui";
import { useCanvasStore, useFitViewRequestId } from "../../stores/canvasStore";
import { useGraphActions } from "../../stores/graphStore";
import { useIsLocked, useMode, useTopoViewerActions } from "../../stores/topoViewerStore";
import { ContextMenu } from "../context-menu/ContextMenu";

import { AnnotationModeIndicator, HelperLines, LinkCreationIndicator } from "./CanvasOverlays";
import { useContextMenuItems } from "./useContextMenuItems";
import { edgeTypes, edgeTypesLite } from "./edges";
import { CustomConnectionLine, LinkCreationLine } from "./LinkPreview";
import { nodeTypes, nodeTypesLite } from "./nodes";
import type {
  AnnotationHandlers,
  CanvasDropData,
  CanvasDropHandlers,
  EdgeLabelMode,
  ReactFlowCanvasProps,
  ReactFlowCanvasRef
} from "./types";

const GRID_SIZE = 20;
const QUADRATIC_GRID_SIZE = 40;

/** Hook for wrapped node click handling */
function handleAltDelete(
  event: React.MouseEvent,
  node: { id: string; type?: string },
  mode: "view" | "edit",
  isLocked: boolean,
  handleDeleteNode: (nodeId: string) => void,
  annotationHandlers?: AnnotationHandlers
): boolean {
  if (!event.altKey || mode !== "edit" || isLocked) return false;
  event.stopPropagation();
  if (node.type === FREE_TEXT_NODE_TYPE && annotationHandlers?.onDeleteFreeText) {
    annotationHandlers.onDeleteFreeText(node.id);
    return true;
  }
  if (node.type === FREE_SHAPE_NODE_TYPE && annotationHandlers?.onDeleteFreeShape) {
    annotationHandlers.onDeleteFreeShape(node.id);
    return true;
  }
  if (node.type === GROUP_NODE_TYPE && annotationHandlers?.onDeleteGroup) {
    annotationHandlers.onDeleteGroup(node.id);
    return true;
  }
  handleDeleteNode(node.id);
  return true;
}

function handleLinkCreationClick(
  event: React.MouseEvent,
  node: { id: string; type?: string },
  linkSourceNode: string | null,
  completeLinkCreation: (nodeId: string) => void
): boolean {
  if (!linkSourceNode) return false;
  const isLoopLink = linkSourceNode === node.id;
  const isNetworkNode = node.type === "network-node";
  if (isLoopLink && isNetworkNode) {
    return true;
  }
  event.stopPropagation();
  completeLinkCreation(node.id);
  return true;
}

function handleAnnotationEditClick(
  event: React.MouseEvent,
  node: { id: string; type?: string },
  clearContextForAnnotationEdit: () => void,
  annotationHandlers?: AnnotationHandlers
): boolean {
  if (!annotationHandlers) return false;

  if (node.type === FREE_TEXT_NODE_TYPE && annotationHandlers.onEditFreeText) {
    event.stopPropagation();
    clearContextForAnnotationEdit();
    annotationHandlers.onEditFreeText(node.id);
    return true;
  }
  if (node.type === FREE_SHAPE_NODE_TYPE && annotationHandlers.onEditFreeShape) {
    event.stopPropagation();
    clearContextForAnnotationEdit();
    annotationHandlers.onEditFreeShape(node.id);
    return true;
  }
  if (node.type === GROUP_NODE_TYPE && annotationHandlers.onEditGroup) {
    event.stopPropagation();
    clearContextForAnnotationEdit();
    annotationHandlers.onEditGroup(node.id);
    return true;
  }

  return false;
}

function useWrappedNodeClick(
  linkSourceNode: string | null,
  completeLinkCreation: (nodeId: string) => void,
  onNodeClick: ReturnType<typeof useCanvasHandlers>["onNodeClick"],
  mode: "view" | "edit",
  isLocked: boolean,
  handleDeleteNode: (nodeId: string) => void,
  clearContextForAnnotationEdit: () => void,
  annotationHandlers?: AnnotationHandlers
) {
  return useCallback(
    (event: React.MouseEvent, node: { id: string; type?: string }) => {
      if (handleAltDelete(event, node, mode, isLocked, handleDeleteNode, annotationHandlers))
        return;
      if (handleLinkCreationClick(event, node, linkSourceNode, completeLinkCreation)) return;
      if (
        handleAnnotationEditClick(event, node, clearContextForAnnotationEdit, annotationHandlers)
      ) {
        // Still flow through to the base handler to ensure shared behavior
        // like closing context menus stays consistent for annotation nodes.
        onNodeClick(event, node as Parameters<typeof onNodeClick>[1]);
        return;
      }
      onNodeClick(event, node as Parameters<typeof onNodeClick>[1]);
    },
    [
      linkSourceNode,
      completeLinkCreation,
      onNodeClick,
      mode,
      isLocked,
      handleDeleteNode,
      clearContextForAnnotationEdit,
      annotationHandlers
    ]
  );
}

function useWrappedEdgeClick(
  onEdgeClick: ReturnType<typeof useCanvasHandlers>["onEdgeClick"],
  mode: "view" | "edit",
  isLocked: boolean,
  handleDeleteEdge: (edgeId: string) => void
) {
  return useCallback(
    (event: React.MouseEvent, edge: { id: string }) => {
      if (event.altKey && mode === "edit" && !isLocked) {
        event.stopPropagation();
        handleDeleteEdge(edge.id);
        return;
      }
      onEdgeClick(event, edge as Parameters<typeof onEdgeClick>[1]);
    },
    [onEdgeClick, mode, isLocked, handleDeleteEdge]
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

// Constants
const proOptions = { hideAttribution: true };
const defaultViewport = { x: 0, y: 0, zoom: 1 };
const fitViewOptions = { padding: 0.2 };
const LOW_DETAIL_ZOOM_THRESHOLD = 0.5;
const LARGE_GRAPH_NODE_THRESHOLD = 600;
const LARGE_GRAPH_EDGE_THRESHOLD = 900;

// ============================================================================
// Hooks extracted for complexity reduction
// ============================================================================

/** Hook for render configuration based on graph size and zoom level */
function useRenderConfig(
  nodeCount: number,
  edgeCount: number,
  linkLabelMode: EdgeLabelMode,
  disableZoomTracking = false
) {
  const isLargeGraph =
    nodeCount >= LARGE_GRAPH_NODE_THRESHOLD || edgeCount >= LARGE_GRAPH_EDGE_THRESHOLD;

  const isLowDetail = useStore(
    useCallback(
      (store) => {
        if (disableZoomTracking) return false;
        const zoom = store.transform[2];
        return isLargeGraph && zoom <= LOW_DETAIL_ZOOM_THRESHOLD;
      },
      [isLargeGraph, disableZoomTracking]
    ),
    (left, right) => left === right
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

  return { isLargeGraph, isLowDetail, edgeRenderConfig, nodeRenderConfig };
}

/** Hook for node drag handler wrappers with helper line support */
function useDragHandlers(
  onNodeDrag: (event: React.MouseEvent, node: Node) => void,
  wrappedOnNodeDragStart: (event: React.MouseEvent, node: Node) => void,
  wrappedOnNodeDragStop: (event: React.MouseEvent, node: Node) => void,
  helperLineHandlers?: {
    updateHelperLines: (node: Node, allNodes: Node[]) => void;
    clearHelperLines: () => void;
    allNodes: Node[];
    isGeoLayout: boolean;
  }
) {
  const handleNodeDragStart = useCallback(
    (event: React.MouseEvent, node: Node) => {
      wrappedOnNodeDragStart(event, node);
    },
    [wrappedOnNodeDragStart]
  );

  const handleNodeDrag = useCallback(
    (event: React.MouseEvent, node: Node) => {
      onNodeDrag(event, node);
      // Update helper lines during drag (skip in geo layout)
      if (helperLineHandlers && !helperLineHandlers.isGeoLayout) {
        helperLineHandlers.updateHelperLines(node, helperLineHandlers.allNodes);
      }
    },
    [onNodeDrag, helperLineHandlers]
  );

  const handleNodeDragStop = useCallback(
    (event: React.MouseEvent, node: Node) => {
      wrappedOnNodeDragStop(event, node);
      // Clear helper lines when drag ends
      if (helperLineHandlers) {
        helperLineHandlers.clearHelperLines();
      }
    },
    [wrappedOnNodeDragStop, helperLineHandlers]
  );

  return { handleNodeDragStart, handleNodeDrag, handleNodeDragStop };
}

/** Hook to wrap onInit with additional callback */
function useWrappedOnInit(
  handlersOnInit: (instance: ReactFlowInstance) => void,
  onInitProp?: (instance: ReactFlowInstance) => void
) {
  return useCallback(
    (instance: ReactFlowInstance) => {
      handlersOnInit(instance);
      onInitProp?.(instance);
    },
    [handlersOnInit, onInitProp]
  );
}

const CANVAS_DROP_MIME_TYPE = "application/reactflow-node";

function parseCanvasDropData(event: React.DragEvent): CanvasDropData | null {
  const dataStr = event.dataTransfer.getData(CANVAS_DROP_MIME_TYPE);
  if (!dataStr) return null;
  try {
    return JSON.parse(dataStr) as CanvasDropData;
  } catch {
    return null;
  }
}

function getSnappedDropPosition(
  reactFlowInstance: ReactFlowInstance,
  event: React.DragEvent
): { x: number; y: number } {
  const position = reactFlowInstance.screenToFlowPosition({
    x: event.clientX,
    y: event.clientY
  });
  return {
    x: Math.round(position.x / GRID_SIZE) * GRID_SIZE,
    y: Math.round(position.y / GRID_SIZE) * GRID_SIZE
  };
}

function handleNodeDrop(
  data: CanvasDropData,
  snappedPosition: { x: number; y: number },
  handlers: CanvasDropHandlers
) {
  if (!data.templateName || !handlers.onDropCreateNode) return;
  handlers.onDropCreateNode(snappedPosition, data.templateName);
}

function handleNetworkDrop(
  data: CanvasDropData,
  snappedPosition: { x: number; y: number },
  handlers: CanvasDropHandlers
) {
  if (!data.networkType || !handlers.onDropCreateNetwork) return;
  handlers.onDropCreateNetwork(snappedPosition, data.networkType);
}

function handleAnnotationDrop(
  data: CanvasDropData,
  snappedPosition: { x: number; y: number },
  handlers: CanvasDropHandlers
) {
  if (data.annotationType === "text") {
    handlers.onAddTextAtPosition?.(snappedPosition);
    return;
  }
  if (data.annotationType === "shape") {
    handlers.onAddShapeAtPosition?.(snappedPosition, data.shapeType);
    return;
  }
  if (data.annotationType === "group") {
    handlers.onAddGroupAtPosition?.(snappedPosition);
  }
}

function handleCanvasDrop(
  data: CanvasDropData,
  snappedPosition: { x: number; y: number },
  handlers: CanvasDropHandlers
) {
  if (data.type === "node") {
    handleNodeDrop(data, snappedPosition, handlers);
    return;
  }
  if (data.type === "network") {
    handleNetworkDrop(data, snappedPosition, handlers);
    return;
  }
  if (data.type === "annotation") {
    handleAnnotationDrop(data, snappedPosition, handlers);
  }
}

/** Hook for node and edge refs that update each render */
function useGraphRefs(nodes: Node[], edges: Edge[]) {
  const nodesRef = useRef<Node[]>(nodes);
  const edgesRef = useRef<Edge[]>(edges);
  nodesRef.current = nodes;
  edgesRef.current = edges;
  return { nodesRef, edgesRef };
}

function useLinkTargetHover(linkSourceNode: string | null) {
  const [linkTargetNodeId, setLinkTargetNodeId] = useState<string | null>(null);

  useEffect(() => {
    if (!linkSourceNode) {
      setLinkTargetNodeId(null);
    }
  }, [linkSourceNode]);

  const handleNodeMouseEnter = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (!linkSourceNode) return;
      setLinkTargetNodeId(node.id);
    },
    [linkSourceNode]
  );

  const handleNodeMouseLeave = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (!linkSourceNode) return;
      setLinkTargetNodeId((current) => (current === node.id ? null : current));
    },
    [linkSourceNode]
  );

  return { linkTargetNodeId, handleNodeMouseEnter, handleNodeMouseLeave };
}

function useGeoWheelZoom(
  geoLayout: ReturnType<typeof useGeoMapLayout>,
  isGeoLayout: boolean,
  isGeoEdit: boolean,
  canvasContainerRef: React.RefObject<HTMLDivElement | null>
) {
  useEffect(() => {
    if (!isGeoLayout || !isGeoEdit) return;
    const map = geoLayout.mapRef.current;
    const container = canvasContainerRef.current;
    if (!map || !container) return;

    const handleWheel = (event: WheelEvent) => {
      if (!isGeoLayout || !isGeoEdit) return;

      const mapCanvas = map.getCanvas();
      if (event.target instanceof Element && mapCanvas.contains(event.target)) {
        // Let native MapLibre scroll-zoom handle direct map-canvas wheel events.
        return;
      }

      event.preventDefault();
      mapCanvas.dispatchEvent(
        new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          deltaX: event.deltaX,
          deltaY: event.deltaY,
          deltaZ: event.deltaZ,
          deltaMode: event.deltaMode,
          clientX: event.clientX,
          clientY: event.clientY,
          ctrlKey: event.ctrlKey,
          shiftKey: event.shiftKey,
          altKey: event.altKey,
          metaKey: event.metaKey
        })
      );
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [geoLayout.mapRef, isGeoLayout, isGeoEdit, canvasContainerRef]);
}

function useSyncCanvasStore(params: {
  linkSourceNode: string | null;
  setLinkSourceNode: (id: string | null) => void;
  edgeRenderConfig: { labelMode: EdgeLabelMode; suppressLabels: boolean; suppressHitArea: boolean };
  setEdgeRenderConfig: (config: {
    labelMode: EdgeLabelMode;
    suppressLabels: boolean;
    suppressHitArea: boolean;
  }) => void;
  nodeRenderConfig: { suppressLabels: boolean };
  setNodeRenderConfig: (config: { suppressLabels: boolean }) => void;
  annotationHandlers?: AnnotationHandlers;
  setAnnotationHandlers: (handlers: AnnotationHandlers | null) => void;
}) {
  const {
    linkSourceNode,
    setLinkSourceNode,
    edgeRenderConfig,
    setEdgeRenderConfig,
    nodeRenderConfig,
    setNodeRenderConfig,
    annotationHandlers,
    setAnnotationHandlers
  } = params;

  useEffect(() => {
    setLinkSourceNode(linkSourceNode);
  }, [linkSourceNode, setLinkSourceNode]);

  useEffect(() => {
    setEdgeRenderConfig(edgeRenderConfig);
  }, [edgeRenderConfig, setEdgeRenderConfig]);

  useEffect(() => {
    setNodeRenderConfig(nodeRenderConfig);
  }, [nodeRenderConfig, setNodeRenderConfig]);

  useEffect(() => {
    setAnnotationHandlers(annotationHandlers ?? null);
  }, [annotationHandlers, setAnnotationHandlers]);
}

function getCanvasInteractionConfig(params: {
  mode: "view" | "edit";
  isLocked: boolean;
  isGeoLayout: boolean;
  isGeoEdit: boolean;
  isInAddMode: boolean;
}): {
  allowPanOnDrag: boolean;
  allowSelectionOnDrag: boolean;
  nodesDraggable: boolean;
  nodesConnectable: boolean;
  reactFlowStyle: React.CSSProperties | undefined;
} {
  const { mode, isLocked, isGeoLayout, isGeoEdit, isInAddMode } = params;
  const allowPanOnDrag = !isInAddMode && !isGeoLayout;
  const allowSelectionOnDrag = !isInAddMode && !isGeoLayout;
  const nodesDraggable = !isLocked && (!isGeoLayout || isGeoEdit);
  const nodesConnectable = mode === "edit" && !isLocked;
  const reactFlowStyle: React.CSSProperties | undefined = isGeoLayout
    ? {
        background: "transparent",
        // Let MapLibre receive pane drags in geo layout; node/edge elements stay interactive.
        pointerEvents: "none",
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        zIndex: 1
      }
    : undefined;
  return { allowPanOnDrag, allowSelectionOnDrag, nodesDraggable, nodesConnectable, reactFlowStyle };
}

function renderGeoMapLayer(
  geoContainerRef: React.RefObject<HTMLDivElement | null>
): React.ReactElement {
  return (
    <div
      id="react-topoviewer-geo-map"
      ref={geoContainerRef}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        zIndex: 0
      }}
    />
  );
}

function renderBackgroundLayer(params: {
  gridLineWidth: number;
  gridStyle: "dotted" | "quadratic";
}): React.ReactElement {
  const { gridLineWidth, gridStyle } = params;
  const isQuadraticGrid = gridStyle === "quadratic";
  return (
    <Background
      variant={isQuadraticGrid ? BackgroundVariant.Lines : BackgroundVariant.Dots}
      gap={isQuadraticGrid ? QUADRATIC_GRID_SIZE : GRID_SIZE}
      size={isQuadraticGrid ? undefined : gridLineWidth}
      lineWidth={isQuadraticGrid ? gridLineWidth : undefined}
      color="var(--topoviewer-grid-color)"
    />
  );
}

function renderLinkCreationLine(params: {
  linkSourceNode: string;
  linkTargetNodeId: string | null;
  nodes: Node[];
  edges: Edge[];
  sourcePosition: { x: number; y: number } | null;
  linkCreationSeed: number | null | undefined;
}): React.ReactElement {
  const { linkSourceNode, linkTargetNodeId, nodes, edges, sourcePosition, linkCreationSeed } =
    params;
  return (
    <LinkCreationLine
      linkSourceNodeId={linkSourceNode}
      linkTargetNodeId={linkTargetNodeId}
      nodes={nodes}
      edges={edges}
      sourcePosition={sourcePosition}
      linkCreationSeed={linkCreationSeed}
    />
  );
}

function renderLinkIndicator(linkSourceNode: string): React.ReactElement {
  return <LinkCreationIndicator linkSourceNode={linkSourceNode} />;
}

function renderAnnotationIndicator(message: string): React.ReactElement {
  return <AnnotationModeIndicator message={message} />;
}

function buildCanvasOverlays(params: {
  isGeoLayout: boolean;
  isLowDetail: boolean;
  geoContainerRef: React.RefObject<HTMLDivElement | null>;
  linkSourceNode: string | null;
  linkTargetNodeId: string | null;
  nodes: Node[];
  edges: Edge[];
  sourcePosition: { x: number; y: number } | null;
  linkCreationSeed: number | null | undefined;
  isInAddMode: boolean;
  addModeMessage?: string | null;
  gridLineWidth: number;
  gridStyle: "dotted" | "quadratic";
}): {
  geoMapLayer: React.ReactNode;
  backgroundLayer: React.ReactNode;
  linkCreationLine: React.ReactNode;
  linkIndicator: React.ReactNode;
  annotationIndicator: React.ReactNode;
} {
  const {
    isGeoLayout,
    isLowDetail,
    geoContainerRef,
    linkSourceNode,
    linkTargetNodeId,
    nodes,
    edges,
    sourcePosition,
    linkCreationSeed,
    isInAddMode,
    addModeMessage,
    gridLineWidth,
    gridStyle
  } = params;

  const canShowGeoMap = isGeoLayout;
  const canShowBackground = !isLowDetail && !isGeoLayout;
  const canShowLinkCreation = Boolean(linkSourceNode);
  const canShowLinkIndicator = Boolean(linkSourceNode);
  const canShowAnnotationIndicator = isInAddMode && Boolean(addModeMessage);

  const geoMapLayer = canShowGeoMap ? renderGeoMapLayer(geoContainerRef) : null;
  const backgroundLayer = canShowBackground
    ? renderBackgroundLayer({ gridLineWidth, gridStyle })
    : null;
  const linkCreationLine = canShowLinkCreation
    ? renderLinkCreationLine({
        linkSourceNode: linkSourceNode as string,
        linkTargetNodeId,
        nodes,
        edges,
        sourcePosition,
        linkCreationSeed
      })
    : null;
  const linkIndicator = canShowLinkIndicator ? renderLinkIndicator(linkSourceNode as string) : null;
  const annotationIndicator = canShowAnnotationIndicator
    ? renderAnnotationIndicator(addModeMessage as string)
    : null;

  return { geoMapLayer, backgroundLayer, linkCreationLine, linkIndicator, annotationIndicator };
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * Inner component that uses useStore (requires ReactFlowProvider ancestor)
 * Now fully controlled - nodes/edges come from the graph store (unified source of truth).
 * All nodes (topology + annotation) are in the same array.
 */
const ReactFlowCanvasInner = forwardRef<ReactFlowCanvasRef, ReactFlowCanvasProps>(
  (
    {
      nodes: propNodes,
      edges: propEdges,
      isContextPanelOpen = false,
      layout = "preset",
      isGeoLayout = false,
      gridLineWidth = DEFAULT_GRID_LINE_WIDTH,
      gridStyle = "dotted",
      annotationMode,
      annotationHandlers,
      onNodeDelete,
      onEdgeDelete,
      onPaneClick,
      linkLabelMode = "show-all",
      onInit: onInitProp,
      onEdgeCreated,
      onShiftClickCreate,
      onOpenNodePalette,
      onAddGroup,
      onAddText,
      onAddShapes,
      onAddTextAtPosition,
      onAddGroupAtPosition,
      onAddShapeAtPosition,
      onDropCreateNode,
      onDropCreateNetwork,
      onLockedAction
    },
    ref
  ) => {
    const mode = useMode();
    const isLocked = useIsLocked();
    const {
      selectNode,
      selectEdge,
      editNode,
      editNetwork,
      editEdge,
      editImpairment,
      editCustomTemplate
    } = useTopoViewerActions();

    // Get setters from graph store - these update the single source of truth
    const { setNodes, setEdges, onNodesChange, onEdgesChange } = useGraphActions();
    const reactFlowInstanceRef = useRef<ReactFlowInstance | null>(null);
    const canvasContainerRef = useRef<HTMLDivElement | null>(null);
    const fitViewRequestId = useFitViewRequestId();
    const lastFitViewRequestRef = useRef(0);
    const [isReactFlowReady, setIsReactFlowReady] = useState(false);
    const suppressSelectionSyncUntilRef = useRef(0);

    const topoState = useMemo(() => ({ mode, isLocked }), [mode, isLocked]);

    // Import canvas store actions
    const { setEdgeRenderConfig, setNodeRenderConfig, setAnnotationHandlers, setLinkSourceNode } =
      useCanvasStore();

    // All nodes (topology + annotation) are now unified in propNodes
    const allNodes = useMemo(() => (propNodes as Node[]) ?? [], [propNodes]);
    const allEdges = useMemo(() => (propEdges as Edge[]) ?? [], [propEdges]);

    const handleEdgeCreatedWithContextPanel = useCallback(
      (
        sourceId: string,
        targetId: string,
        edgeData: {
          id: string;
          source: string;
          target: string;
          sourceEndpoint: string;
          targetEndpoint: string;
        }
      ) => {
        // React Flow may transiently select the target node/edge during connect.
        // Suppress syncing that selection into the app store to avoid auto-opening the panel.
        suppressSelectionSyncUntilRef.current = Date.now() + 250;

        onEdgeCreated?.(sourceId, targetId, edgeData);

        // If the panel is already open, switch directly to the link editor for the newly created link.
        if (mode === "edit" && isContextPanelOpen) {
          editEdge(edgeData.id);
        }
      },
      [editEdge, isContextPanelOpen, mode, onEdgeCreated]
    );

    const {
      linkSourceNode,
      startLinkCreation,
      completeLinkCreation,
      cancelLinkCreation,
      linkCreationSeed
    } = useLinkCreation(handleEdgeCreatedWithContextPanel);
    const linkSourceNodeRef = useRef<string | null>(null);
    linkSourceNodeRef.current = linkSourceNode;
    const shouldSuppressSelectionSync = useCallback(
      () =>
        Boolean(linkSourceNodeRef.current) || Date.now() < suppressSelectionSyncUntilRef.current,
      []
    );

    const isGeoEditable = isGeoLayout && !isLocked;

    const geoLayout = useGeoMapLayout({
      isGeoLayout,
      isEditable: isGeoEditable,
      nodes: allNodes,
      setNodes,
      reactFlowInstanceRef,
      canvasContainerRef,
      restoreOnExit: layout === "preset"
    });
    const isGeoEdit = isGeoEditable;
    useGeoWheelZoom(geoLayout, isGeoLayout, isGeoEdit, canvasContainerRef);

    useEffect(() => {
      if (fitViewRequestId <= lastFitViewRequestRef.current) return;
      if (!isReactFlowReady || !reactFlowInstanceRef.current || allNodes.length === 0) return;
      if (isGeoLayout) return;
      lastFitViewRequestRef.current = fitViewRequestId;
      setTimeout(() => {
        reactFlowInstanceRef.current?.fitView({ padding: 0.2, duration: 200 }).catch(() => {
          /* ignore */
        });
      }, 50);
    }, [fitViewRequestId, allNodes.length, isGeoLayout, isReactFlowReady]);

    // Refs for context menu (to avoid re-renders)
    const { nodesRef } = useGraphRefs(allNodes, allEdges);

    const handlers = useCanvasHandlers({
      selectNode,
      selectEdge,
      editNode,
      editNetwork,
      editEdge,
      mode,
      isLocked,
      onNodesChangeBase: onNodesChange,
      onLockedAction,
      onPaneClickExtra: onPaneClick,
      shouldSuppressSelectionSync,
      nodes: allNodes,
      setNodes,
      onEdgeCreated: handleEdgeCreatedWithContextPanel,
      groupMemberHandlers: {
        getGroupMembers: annotationHandlers?.getGroupMembers,
        onNodeDropped: annotationHandlers?.onNodeDropped
      },
      reactFlowInstanceRef,
      geoLayout: {
        isGeoLayout,
        isEditable: isGeoEditable,
        getGeoUpdateForNode: geoLayout.getGeoUpdateForNode
      }
    });

    const { handleDeleteNode, handleDeleteEdge } = useDeleteHandlers(
      selectNode,
      selectEdge,
      handlers.closeContextMenu,
      onNodeDelete,
      onEdgeDelete
    );
    const sourceNodePosition = useSourceNodePosition(linkSourceNode, allNodes);
    const { linkTargetNodeId, handleNodeMouseEnter, handleNodeMouseLeave } =
      useLinkTargetHover(linkSourceNode);

    // Helper lines for node alignment during drag
    const { helperLines, updateHelperLines, clearHelperLines } = useHelperLines();

    // Use extracted hooks for render config and drag handlers
    const { isLowDetail, edgeRenderConfig, nodeRenderConfig } = useRenderConfig(
      allNodes.length,
      allEdges.length,
      linkLabelMode,
      isGeoLayout
    );
    const isGeoInteracting = isGeoLayout && geoLayout.isInteracting;
    const effectiveEdgeRenderConfig = useMemo(
      () => ({
        ...edgeRenderConfig,
        suppressLabels: edgeRenderConfig.suppressLabels || isGeoLayout,
        suppressHitArea: edgeRenderConfig.suppressHitArea || isGeoLayout
      }),
      [edgeRenderConfig, isGeoLayout]
    );
    const activeNodeTypes = useMemo(
      () => (isLowDetail && !isGeoLayout ? nodeTypesLite : nodeTypes),
      [isLowDetail, isGeoLayout]
    );
    const activeEdgeTypes = useMemo(
      () => (isGeoLayout || isLowDetail ? edgeTypesLite : edgeTypes),
      [isGeoLayout, isLowDetail]
    );
    useSyncCanvasStore({
      linkSourceNode,
      setLinkSourceNode,
      edgeRenderConfig: effectiveEdgeRenderConfig,
      setEdgeRenderConfig,
      nodeRenderConfig,
      setNodeRenderConfig,
      annotationHandlers,
      setAnnotationHandlers
    });

    // Note: Keyboard delete handling is done by useAppKeyboardShortcuts in App.tsx
    // which uses handleDeleteNode for proper undo/redo support.
    // Do NOT add useKeyboardDeleteHandlers here as it bypasses the undo system.

    const refMethods = useCanvasRefMethods(
      handlers.reactFlowInstance,
      allNodes,
      allEdges,
      setNodes,
      setEdges
    );
    const fitCanvas = useCallback(() => {
      if (isGeoLayout) {
        geoLayout.fitToViewport();
        return;
      }
      Promise.resolve(refMethods.fit()).catch(() => {
        /* ignore */
      });
    }, [isGeoLayout, geoLayout, refMethods]);
    const refHandle = useMemo(
      () => ({
        ...refMethods,
        fit: fitCanvas
      }),
      [refMethods, fitCanvas]
    );
    useImperativeHandle(ref, () => refHandle, [refHandle]);

    const wrappedOnNodeClick = useWrappedNodeClick(
      linkSourceNode,
      completeLinkCreation,
      handlers.onNodeClick,
      mode,
      isLocked,
      handleDeleteNode,
      () => {
        // Switch the context panel from node/link editors to annotation editors.
        // This is intentionally destructive to any in-progress node/link edits.
        editNode(null);
        editNetwork(null);
        editEdge(null);
        editImpairment(null);
        editCustomTemplate(null);
        selectNode(null);
        selectEdge(null);
      },
      annotationHandlers
    );
    const wrappedOnEdgeClick = useWrappedEdgeClick(
      handlers.onEdgeClick,
      mode,
      isLocked,
      handleDeleteEdge
    );
    const contextMenuItems = useContextMenuItems({
      handlers,
      state: topoState,
      editNode,
      editNetwork,
      editEdge,
      handleDeleteNode,
      handleDeleteEdge,
      showNodeInfo: selectNode,
      showLinkInfo: selectEdge,
      showLinkImpairment: editImpairment,
      nodesRef,
      linkSourceNode,
      startLinkCreation,
      cancelLinkCreation,
      annotationHandlers,
      onOpenNodePalette,
      onAddDefaultNode: onShiftClickCreate,
      onAddGroup,
      onAddText,
      onAddTextAtPosition,
      onAddShapes,
      onAddShapeAtPosition
    });

    const {
      wrappedOnPaneClick,
      wrappedOnNodeDoubleClick,
      wrappedOnNodeDragStart,
      wrappedOnNodeDragStop,
      isInAddMode,
      addModeMessage
    } = useAnnotationCanvasHandlers({
      mode,
      isLocked,
      annotationMode,
      annotationHandlers,
      reactFlowInstanceRef: handlers.reactFlowInstance,
      baseOnPaneClick: handlers.onPaneClick,
      baseOnNodeDoubleClick: handlers.onNodeDoubleClick,
      baseOnNodeDragStart: handlers.onNodeDragStart,
      baseOnNodeDragStop: handlers.onNodeDragStop,
      onShiftClickCreate
    });

    const { reactFlowInstance: handlersReactFlowInstance } = handlers;

    const { handleNodeDragStart, handleNodeDrag, handleNodeDragStop } = useDragHandlers(
      handlers.onNodeDrag,
      wrappedOnNodeDragStart,
      wrappedOnNodeDragStop,
      {
        updateHelperLines,
        clearHelperLines,
        allNodes,
        isGeoLayout
      }
    );

    const { onInit: handleOnInit } = handlers;

    const handleCanvasInit = useCallback(
      (instance: ReactFlowInstance) => {
        handleOnInit(instance);
        setIsReactFlowReady(true);
      },
      [handleOnInit]
    );

    const wrappedOnInit = useWrappedOnInit(handleCanvasInit, onInitProp);

    // Drag-drop handlers for node palette
    const handleDragOver = useCallback((event: React.DragEvent) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    }, []);

    const handleDrop = useCallback(
      (event: React.DragEvent) => {
        event.preventDefault();

        if (mode !== "edit" || isLocked) return;

        const data = parseCanvasDropData(event);
        if (!data) return;

        const rfInstance = handlersReactFlowInstance.current;
        if (!rfInstance) return;

        const snappedPosition = getSnappedDropPosition(rfInstance, event);
        handleCanvasDrop(data, snappedPosition, {
          onDropCreateNode,
          onDropCreateNetwork,
          onAddTextAtPosition,
          onAddShapeAtPosition,
          onAddGroupAtPosition
        });
      },
      [
        mode,
        isLocked,
        handlersReactFlowInstance,
        onDropCreateNode,
        onDropCreateNetwork,
        onAddTextAtPosition,
        onAddShapeAtPosition,
        onAddGroupAtPosition
      ]
    );

    const interactionConfig = getCanvasInteractionConfig({
      mode,
      isLocked,
      isGeoLayout,
      isGeoEdit,
      isInAddMode
    });
    const {
      allowPanOnDrag,
      allowSelectionOnDrag,
      nodesDraggable,
      nodesConnectable,
      reactFlowStyle
    } = interactionConfig;
    const renderNodes = useMemo(() => {
      if (nodesDraggable) return allNodes;
      let changed = false;
      const nextNodes = allNodes.map((node) => {
        if (!isAnnotationNodeType(node.type)) return node;
        if (node.draggable === false) return node;
        changed = true;
        return { ...node, draggable: false };
      });
      return changed ? nextNodes : allNodes;
    }, [allNodes, nodesDraggable]);
    const overlays = buildCanvasOverlays({
      isGeoLayout,
      isLowDetail,
      geoContainerRef: geoLayout.containerRef,
      linkSourceNode,
      linkTargetNodeId,
      nodes: allNodes,
      edges: allEdges,
      sourcePosition: sourceNodePosition,
      linkCreationSeed: linkCreationSeed ?? null,
      isInAddMode,
      addModeMessage,
      gridLineWidth,
      gridStyle
    });
    const contextMenuVisible = handlers.contextMenu.type !== null;

    const handleBackdropContextMenu = useCallback(
      (event: React.MouseEvent) => {
        const { clientX, clientY } = event;
        flushSync(() => {
          handlers.closeContextMenu();
        });
        const target = document.elementFromPoint(clientX, clientY);
        if (target) {
          target.dispatchEvent(
            new MouseEvent("contextmenu", {
              bubbles: true,
              cancelable: true,
              clientX,
              clientY,
              button: 2,
              buttons: 2
            })
          );
        }
      },
      [handlers.closeContextMenu]
    );

    return (
      <div
        ref={canvasContainerRef}
        style={canvasStyle}
        className={`react-flow-canvas canvas-container${isGeoLayout ? " maplibre-active" : ""}${isGeoInteracting ? " maplibre-moving" : ""}`}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onContextMenu={(e) => e.preventDefault()}
      >
        {overlays.geoMapLayer}
        <ReactFlow
          nodes={renderNodes}
          edges={allEdges}
          nodeTypes={activeNodeTypes}
          edgeTypes={activeEdgeTypes}
          onNodesChange={handlers.handleNodesChange}
          onEdgesChange={onEdgesChange}
          onInit={wrappedOnInit}
          onNodeClick={wrappedOnNodeClick}
          onNodeDoubleClick={wrappedOnNodeDoubleClick}
          onNodeMouseEnter={handleNodeMouseEnter}
          onNodeMouseLeave={handleNodeMouseLeave}
          onNodeDragStart={handleNodeDragStart}
          onNodeDrag={handleNodeDrag}
          onNodeDragStop={handleNodeDragStop}
          onNodeContextMenu={handlers.onNodeContextMenu}
          onEdgeClick={wrappedOnEdgeClick}
          onEdgeDoubleClick={handlers.onEdgeDoubleClick}
          onEdgeContextMenu={handlers.onEdgeContextMenu}
          onPaneClick={wrappedOnPaneClick}
          onPaneContextMenu={handlers.onPaneContextMenu}
          onConnect={handlers.onConnect}
          onSelectionChange={handlers.onSelectionChange}
          connectionLineComponent={CustomConnectionLine}
          fitView={!isGeoLayout}
          fitViewOptions={fitViewOptions}
          defaultViewport={defaultViewport}
          minZoom={0.1}
          maxZoom={Infinity}
          onlyRenderVisibleElements={!isLowDetail && !isGeoLayout}
          selectionMode={SelectionMode.Partial}
          selectNodesOnDrag={false}
          panOnDrag={allowPanOnDrag}
          selectionOnDrag={allowSelectionOnDrag}
          selectionKeyCode="Shift"
          connectionMode={ConnectionMode.Loose}
          proOptions={proOptions}
          deleteKeyCode={null}
          multiSelectionKeyCode="Shift"
          nodesDraggable={nodesDraggable}
          nodesConnectable={nodesConnectable}
          elementsSelectable
          zoomOnScroll={!isGeoLayout}
          zoomOnPinch={!isGeoLayout}
          zoomOnDoubleClick={!isGeoLayout}
          panOnScroll={false}
          style={reactFlowStyle}
        >
          {overlays.backgroundLayer}
        </ReactFlow>

        <ContextMenu
          isVisible={contextMenuVisible}
          position={handlers.contextMenu.position}
          items={contextMenuItems}
          onClose={handlers.closeContextMenu}
          onBackdropContextMenu={handleBackdropContextMenu}
        />

        {/* Helper lines for node alignment during drag */}
        <HelperLines lines={helperLines} />

        {overlays.linkCreationLine}

        {overlays.linkIndicator}

        {overlays.annotationIndicator}
      </div>
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
