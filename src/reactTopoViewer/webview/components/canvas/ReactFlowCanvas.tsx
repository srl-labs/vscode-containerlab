/**
 * ReactFlowCanvas - Main React Flow canvas component for topology visualization
 *
 * This is now a fully controlled component - nodes/edges come from the graph store.
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

import { useIsLocked, useMode, useTopoViewerActions } from "../../stores/topoViewerStore";
import { useGraphActions, useEdges } from "../../stores/graphStore";
import { useCanvasStore } from "../../stores/canvasStore";
import { ContextMenu, type ContextMenuItem } from "../context-menu/ContextMenu";
import {
  useDeleteHandlers,
  useLinkCreation,
  useSourceNodePosition,
  useCanvasRefMethods,
  useCanvasHandlers,
  useAnnotationCanvasHandlers,
  useGeoMapLayout,
  useHelperLines,
  GRID_SIZE
} from "../../hooks/canvas";
import { HelperLines } from "./HelperLines";

import {
  buildNodeContextMenu,
  buildEdgeContextMenu,
  buildPaneContextMenu
} from "./contextMenuBuilders";
import { edgeTypes } from "./edges";
import { nodeTypes } from "./nodes";
import type {
  AnnotationHandlers,
  EdgeLabelMode,
  ReactFlowCanvasProps,
  ReactFlowCanvasRef
} from "./types";
import {
  FREE_SHAPE_NODE_TYPE,
  FREE_TEXT_NODE_TYPE,
  GROUP_NODE_TYPE
} from "../../annotations/annotationNodeConverters";
import type { TopoNode, TopoEdge } from "../../../shared/types/graph";
import { allocateEndpointsForLink } from "../../utils/endpointAllocator";
import { buildEdgeId } from "../../utils/edgeId";

type RafThrottled<Args extends unknown[]> = ((...args: Args) => void) & { cancel: () => void };

function rafThrottle<Args extends unknown[]>(func: (...args: Args) => void): RafThrottled<Args> {
  let rafId: number | null = null;
  let lastArgs: Args | null = null;

  const throttled = (...args: Args) => {
    lastArgs = args;
    if (rafId === null) {
      rafId = window.requestAnimationFrame(() => {
        if (lastArgs) {
          func(...lastArgs);
          lastArgs = null;
        }
        rafId = null;
      });
    }
  };

  throttled.cancel = () => {
    if (rafId !== null) {
      window.cancelAnimationFrame(rafId);
      rafId = null;
    }
  };

  return throttled as RafThrottled<Args>;
}

/** Parameters for useContextMenuItems hook */
interface ContextMenuItemsParams {
  handlers: ReturnType<typeof useCanvasHandlers>;
  state: { mode: "view" | "edit"; isLocked: boolean };
  editNode: (id: string | null) => void;
  editEdge: (id: string | null) => void;
  handleDeleteNode: (nodeId: string) => void;
  handleDeleteEdge: (edgeId: string) => void;
  nodesRef: React.RefObject<Node[]>;
  edgesRef: React.RefObject<Edge[]>;
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  linkSourceNode: string | null;
  startLinkCreation: (nodeId: string) => void;
  cancelLinkCreation: () => void;
  annotationHandlers?: AnnotationHandlers;
}

/**
 * Hook for building context menu items.
 */
function useContextMenuItems(params: ContextMenuItemsParams): ContextMenuItem[] {
  const {
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
  } = params;
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
  onNodeClick: ReturnType<typeof useCanvasHandlers>["onNodeClick"],
  mode: "view" | "edit",
  isLocked: boolean,
  handleDeleteNode: (nodeId: string) => void,
  annotationHandlers?: AnnotationHandlers
) {
  return useCallback(
    (event: React.MouseEvent, node: { id: string; type?: string }) => {
      if (event.altKey && mode === "edit" && !isLocked) {
        event.stopPropagation();
        if (node.type === FREE_TEXT_NODE_TYPE && annotationHandlers?.onDeleteFreeText) {
          annotationHandlers.onDeleteFreeText(node.id);
          return;
        }
        if (node.type === FREE_SHAPE_NODE_TYPE && annotationHandlers?.onDeleteFreeShape) {
          annotationHandlers.onDeleteFreeShape(node.id);
          return;
        }
        if (node.type === GROUP_NODE_TYPE && annotationHandlers?.onDeleteGroup) {
          annotationHandlers.onDeleteGroup(node.id);
          return;
        }
        handleDeleteNode(node.id);
        return;
      }
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
    [
      linkSourceNode,
      completeLinkCreation,
      onNodeClick,
      mode,
      isLocked,
      handleDeleteNode,
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

// Link preview style (match TopologyEdge defaults)
const LINK_PREVIEW_COLOR = "#969799";
const LINK_PREVIEW_WIDTH = 2.5;
const LINK_PREVIEW_OPACITY = 0.5;
const LINK_PREVIEW_ICON_SIZE = 40;
const LINK_PREVIEW_CONTROL_POINT_STEP_SIZE = 40;
const LINK_PREVIEW_LOOP_EDGE_SIZE = 50;
const LINK_PREVIEW_LOOP_EDGE_OFFSET = 10;
const LINK_LABEL_OFFSET = 30;
const LINK_LABEL_FONT_SIZE = 10;
const LINK_LABEL_BG_COLOR = "rgba(202, 203, 204, 0.5)";
const LINK_LABEL_TEXT_COLOR = "rgba(0, 0, 0, 0.7)";
const LINK_LABEL_OUTLINE_COLOR = "rgba(255, 255, 255, 0.7)";
const LINK_LABEL_PADDING_X = 2;
const LINK_LABEL_PADDING_Y = 0;
const LINK_LABEL_BORDER_RADIUS = 4;
const LINK_LABEL_SHADOW_SMALL = 2;
const LINK_LABEL_SHADOW_LARGE = 3;

function buildLinkLabelStyle(zoom: number): React.CSSProperties {
  const scaledFont = Math.max(1, LINK_LABEL_FONT_SIZE * zoom);
  const padX = LINK_LABEL_PADDING_X * zoom;
  const padY = LINK_LABEL_PADDING_Y * zoom;
  const radius = LINK_LABEL_BORDER_RADIUS * zoom;
  const shadowSmall = LINK_LABEL_SHADOW_SMALL * zoom;
  const shadowLarge = LINK_LABEL_SHADOW_LARGE * zoom;

  return {
    position: "absolute",
    top: 0,
    left: 0,
    fontSize: `${scaledFont}px`,
    fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    color: LINK_LABEL_TEXT_COLOR,
    backgroundColor: LINK_LABEL_BG_COLOR,
    padding: `${padY}px ${padX}px`,
    borderRadius: radius,
    pointerEvents: "none",
    whiteSpace: "nowrap",
    textShadow: `0 0 ${shadowSmall}px ${LINK_LABEL_OUTLINE_COLOR}, 0 0 ${shadowSmall}px ${LINK_LABEL_OUTLINE_COLOR}, 0 0 ${shadowLarge}px ${LINK_LABEL_OUTLINE_COLOR}`,
    lineHeight: 1.2,
    zIndex: 1
  };
}

interface PreviewNodeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function getNodeIntersection(
  nodeX: number,
  nodeY: number,
  nodeWidth: number,
  nodeHeight: number,
  targetX: number,
  targetY: number
): { x: number; y: number } {
  const w = nodeWidth / 2;
  const h = nodeHeight / 2;
  const dx = targetX - nodeX;
  const dy = targetY - nodeY;

  if (dx === 0 && dy === 0) {
    return { x: nodeX, y: nodeY };
  }

  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  if (absDx * h > absDy * w) {
    const sign = dx > 0 ? 1 : -1;
    return {
      x: nodeX + sign * w,
      y: nodeY + (dy * w) / absDx
    };
  }

  const sign = dy > 0 ? 1 : -1;
  return {
    x: nodeX + (dx * h) / absDy,
    y: nodeY + sign * h
  };
}

function getNodePosition(node: Node): { x: number; y: number } {
  const internal = (node as Node & { internals?: { positionAbsolute: { x: number; y: number } } })
    .internals;
  return internal?.positionAbsolute ?? node.position;
}

function getEdgePoints(sourceNode: PreviewNodeRect, targetNode: PreviewNodeRect) {
  const sourceCenter = {
    x: sourceNode.x + sourceNode.width / 2,
    y: sourceNode.y + sourceNode.height / 2
  };
  const targetCenter = {
    x: targetNode.x + targetNode.width / 2,
    y: targetNode.y + targetNode.height / 2
  };

  const sourcePoint = getNodeIntersection(
    sourceCenter.x,
    sourceCenter.y,
    sourceNode.width,
    sourceNode.height,
    targetCenter.x,
    targetCenter.y
  );

  const targetPoint = getNodeIntersection(
    targetCenter.x,
    targetCenter.y,
    targetNode.width,
    targetNode.height,
    sourceCenter.x,
    sourceCenter.y
  );

  return {
    sx: sourcePoint.x,
    sy: sourcePoint.y,
    tx: targetPoint.x,
    ty: targetPoint.y
  };
}

function calculateControlPoint(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  edgeIndex: number,
  totalEdges: number,
  isCanonicalDirection: boolean,
  stepSize: number
): { x: number; y: number } | null {
  if (totalEdges <= 1) return null;

  const midX = (sx + tx) / 2;
  const midY = (sy + ty) / 2;

  const dx = tx - sx;
  const dy = ty - sy;
  const length = Math.sqrt(dx * dx + dy * dy);

  if (length === 0) return null;

  const normalX = -dy / length;
  const normalY = dx / length;

  let offset = (edgeIndex - (totalEdges - 1) / 2) * stepSize;
  if (!isCanonicalDirection) {
    offset = -offset;
  }

  return {
    x: midX + normalX * offset,
    y: midY + normalY * offset
  };
}

function getLabelPosition(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  offset: number,
  controlPoint?: { x: number; y: number }
): { x: number; y: number } {
  const dx = endX - startX;
  const dy = endY - startY;
  const length = Math.sqrt(dx * dx + dy * dy);

  if (length === 0) return { x: startX, y: startY };

  const baseRatio = Math.min(offset / length, 0.4);
  const ratio = controlPoint ? Math.max(baseRatio, 0.15) : baseRatio;

  if (controlPoint) {
    const t = ratio;
    const oneMinusT = 1 - t;
    return {
      x: oneMinusT * oneMinusT * startX + 2 * oneMinusT * t * controlPoint.x + t * t * endX,
      y: oneMinusT * oneMinusT * startY + 2 * oneMinusT * t * controlPoint.y + t * t * endY
    };
  }

  return {
    x: startX + dx * ratio,
    y: startY + dy * ratio
  };
}

function buildPath(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  controlPoint: { x: number; y: number } | null
): string {
  if (!controlPoint) {
    return `M ${sx} ${sy} L ${tx} ${ty}`;
  }
  return `M ${sx} ${sy} Q ${controlPoint.x} ${controlPoint.y} ${tx} ${ty}`;
}

function isSameEdgePair(edge: Edge, sourceId: string, targetId: string): boolean {
  return (
    (edge.source === sourceId && edge.target === targetId) ||
    (edge.source === targetId && edge.target === sourceId)
  );
}

function getPreviewParallelInfo(
  edges: Edge[],
  sourceId: string,
  targetId: string,
  previewId?: string | null
): { index: number; total: number; isCanonicalDirection: boolean } {
  const existingIds = edges
    .filter((edge) => edge.source !== edge.target && isSameEdgePair(edge, sourceId, targetId))
    .map((edge) => edge.id);

  if (previewId) {
    const ids = [...existingIds, previewId].sort((a, b) => a.localeCompare(b));
    const index = Math.max(0, ids.indexOf(previewId));
    return {
      index,
      total: ids.length,
      isCanonicalDirection: sourceId.localeCompare(targetId) <= 0
    };
  }

  return {
    index: existingIds.length,
    total: existingIds.length + 1,
    isCanonicalDirection: sourceId.localeCompare(targetId) <= 0
  };
}

interface LoopPreviewGeometry {
  path: string;
  sourceLabelPos: { x: number; y: number };
  targetLabelPos: { x: number; y: number };
}

function calculateLoopEdgeGeometry(
  nodeX: number,
  nodeY: number,
  nodeSize: number,
  loopIndex: number,
  scale: number
): LoopPreviewGeometry {
  const centerX = nodeX + nodeSize / 2;
  const centerY = nodeY + nodeSize / 2;
  const size = (LINK_PREVIEW_LOOP_EDGE_SIZE + loopIndex * LINK_PREVIEW_LOOP_EDGE_OFFSET) * scale;

  const startX = centerX + nodeSize / 2;
  const startY = centerY - nodeSize / 4;
  const endX = centerX + nodeSize / 2;
  const endY = centerY + nodeSize / 4;

  const cp1X = startX + size;
  const cp1Y = startY - size * 0.5;
  const cp2X = endX + size;
  const cp2Y = endY + size * 0.5;

  const path = `M ${startX} ${startY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${endX} ${endY}`;
  const labelX = centerX + nodeSize / 2 + size * 0.8;
  const labelY = centerY;
  const labelOffset = 10 * scale;

  return {
    path,
    sourceLabelPos: { x: labelX, y: labelY - labelOffset },
    targetLabelPos: { x: labelX, y: labelY + labelOffset }
  };
}

/**
 * Custom connection line component
 */
const CustomConnectionLine: React.FC<ConnectionLineComponentProps> = ({
  fromX,
  fromY,
  toX,
  toY,
  fromNode,
  toNode
}) => {
  const edges = useEdges();

  let path = buildPath(fromX, fromY, toX, toY, null);

  if (toNode) {
    const sourceId = fromNode.id;
    const targetId = toNode.id;
    const iconSize = LINK_PREVIEW_ICON_SIZE;

    if (sourceId === targetId) {
      const nodeWidth = fromNode.measured?.width ?? iconSize;
      const nodePos = getNodePosition(fromNode);
      const nodeX = nodePos.x + (nodeWidth - iconSize) / 2;
      const nodeY = nodePos.y;
      const loopIndex = edges.filter(
        (edge) => edge.source === sourceId && edge.target === sourceId
      ).length;
      path = calculateLoopEdgeGeometry(nodeX, nodeY, iconSize, loopIndex, 1).path;
    } else {
      const sourceWidth = fromNode.measured?.width ?? iconSize;
      const targetWidth = toNode.measured?.width ?? iconSize;
      const sourcePos = getNodePosition(fromNode);
      const targetPos = getNodePosition(toNode);

      const points = getEdgePoints(
        {
          x: sourcePos.x + (sourceWidth - iconSize) / 2,
          y: sourcePos.y,
          width: iconSize,
          height: iconSize
        },
        {
          x: targetPos.x + (targetWidth - iconSize) / 2,
          y: targetPos.y,
          width: iconSize,
          height: iconSize
        }
      );

      const parallelInfo = getPreviewParallelInfo(edges, sourceId, targetId);
      const controlPoint = calculateControlPoint(
        points.sx,
        points.sy,
        points.tx,
        points.ty,
        parallelInfo.index,
        parallelInfo.total,
        parallelInfo.isCanonicalDirection,
        LINK_PREVIEW_CONTROL_POINT_STEP_SIZE
      );
      path = buildPath(points.sx, points.sy, points.tx, points.ty, controlPoint);
    }
  }

  return (
    <path
      d={path}
      fill="none"
      className="react-flow__edge-path"
      style={{
        stroke: LINK_PREVIEW_COLOR,
        strokeWidth: LINK_PREVIEW_WIDTH,
        opacity: LINK_PREVIEW_OPACITY
      }}
    />
  );
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
function useRenderConfig(nodeCount: number, edgeCount: number, linkLabelMode: EdgeLabelMode) {
  const isLargeGraph =
    nodeCount >= LARGE_GRAPH_NODE_THRESHOLD || edgeCount >= LARGE_GRAPH_EDGE_THRESHOLD;

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

/** Hook for link and delete handlers combined */
function useLinkAndDeleteHandlers(
  selectNode: (id: string | null) => void,
  selectEdge: (id: string | null) => void,
  closeContextMenu: () => void,
  onNodeDelete?: (nodeId: string) => void,
  onEdgeDelete?: (edgeId: string) => void,
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
  const {
    linkSourceNode,
    startLinkCreation,
    completeLinkCreation,
    cancelLinkCreation,
    linkCreationSeed
  } = useLinkCreation(onEdgeCreated);
  const { handleDeleteNode, handleDeleteEdge } = useDeleteHandlers(
    selectNode,
    selectEdge,
    closeContextMenu,
    onNodeDelete,
    onEdgeDelete
  );
  return {
    linkSourceNode,
    startLinkCreation,
    completeLinkCreation,
    cancelLinkCreation,
    linkCreationSeed,
    handleDeleteNode,
    handleDeleteEdge
  };
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

/** Hook for node and edge refs that update each render */
function useGraphRefs(nodes: Node[], edges: Edge[]) {
  const nodesRef = useRef<Node[]>(nodes);
  const edgesRef = useRef<Edge[]>(edges);
  nodesRef.current = nodes;
  edgesRef.current = edges;
  return { nodesRef, edgesRef };
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
      layout = "preset",
      isGeoLayout = false,
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
    const mode = useMode();
    const isLocked = useIsLocked();
    const { selectNode, selectEdge, editNode, editEdge } = useTopoViewerActions();

    // Get setters from graph store - these update the single source of truth
    const { setNodes, setEdges, onNodesChange, onEdgesChange } = useGraphActions();
    const reactFlowInstanceRef = useRef<ReactFlowInstance | null>(null);
    const canvasContainerRef = useRef<HTMLDivElement | null>(null);

    const topoState = useMemo(() => ({ mode, isLocked }), [mode, isLocked]);

    // Import canvas store actions
    const { setEdgeRenderConfig, setNodeRenderConfig, setAnnotationHandlers, setLinkSourceNode } =
      useCanvasStore();

    const floatingPanelRef = useRef<{ triggerShake: () => void } | null>(null);

    // All nodes (topology + annotation) are now unified in propNodes
    const allNodes = (propNodes as Node[]) ?? [];
    const allEdges = (propEdges as Edge[]) ?? [];

    const isGeoEditable = isGeoLayout && mode === "edit" && !isLocked;

    const geoLayout = useGeoMapLayout({
      isGeoLayout,
      isEditable: isGeoEditable,
      nodes: allNodes,
      setNodes,
      reactFlowInstanceRef,
      restoreOnExit: layout === "preset"
    });

    // Refs for context menu (to avoid re-renders)
    const { nodesRef, edgesRef } = useGraphRefs(allNodes, allEdges);

    const handlers = useCanvasHandlers({
      selectNode,
      selectEdge,
      editNode,
      editEdge,
      mode,
      isLocked,
      onNodesChangeBase: onNodesChange,
      onLockedAction: () => floatingPanelRef.current?.triggerShake(),
      nodes: allNodes,
      setNodes,
      onEdgeCreated,
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

    const {
      linkSourceNode,
      startLinkCreation,
      completeLinkCreation,
      cancelLinkCreation,
      linkCreationSeed,
      handleDeleteNode,
      handleDeleteEdge
    } = useLinkAndDeleteHandlers(
      selectNode,
      selectEdge,
      handlers.closeContextMenu,
      onNodeDelete,
      onEdgeDelete,
      onEdgeCreated
    );
    const sourceNodePosition = useSourceNodePosition(linkSourceNode, allNodes);
    const [linkTargetNodeId, setLinkTargetNodeId] = useState<string | null>(null);

    useEffect(() => {
      if (!linkSourceNode) setLinkTargetNodeId(null);
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

    // Helper lines for node alignment during drag
    const { helperLines, updateHelperLines, clearHelperLines } = useHelperLines();

    // Sync linkSourceNode to canvas store
    useEffect(() => {
      setLinkSourceNode(linkSourceNode);
    }, [linkSourceNode, setLinkSourceNode]);

    // Use extracted hooks for render config and drag handlers
    const { isLowDetail, edgeRenderConfig, nodeRenderConfig } = useRenderConfig(
      allNodes.length,
      allEdges.length,
      linkLabelMode
    );

    // Sync render config to canvas store
    useEffect(() => {
      setEdgeRenderConfig(edgeRenderConfig);
    }, [edgeRenderConfig, setEdgeRenderConfig]);

    useEffect(() => {
      setNodeRenderConfig(nodeRenderConfig);
    }, [nodeRenderConfig, setNodeRenderConfig]);

    // Sync annotation handlers to canvas store
    useEffect(() => {
      setAnnotationHandlers(annotationHandlers ?? null);
    }, [annotationHandlers, setAnnotationHandlers]);

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
    useImperativeHandle(ref, () => refMethods, [refMethods]);

    const wrappedOnNodeClick = useWrappedNodeClick(
      linkSourceNode,
      completeLinkCreation,
      handlers.onNodeClick,
      mode,
      isLocked,
      handleDeleteNode,
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

    const wrappedOnInit = useWrappedOnInit(handlers.onInit, onInitProp);

    const isGeoEdit = isGeoEditable;
    const allowPanOnDrag = !isInAddMode && !isGeoLayout;
    const allowSelectionOnDrag = !isInAddMode && (!isGeoLayout || isGeoEdit);
    const nodesDraggable = mode === "edit" && !isLocked && (!isGeoLayout || isGeoEdit);
    const reactFlowStyle: React.CSSProperties | undefined = isGeoLayout
      ? {
          background: "transparent",
          pointerEvents: isGeoEdit ? "auto" : "none",
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          zIndex: 1
        }
      : undefined;

    useEffect(() => {
      if (!isGeoLayout || !isGeoEdit) return;
      const map = geoLayout.mapRef.current;
      const container = canvasContainerRef.current;
      if (!map || !container) return;

      const handleWheel = (event: WheelEvent) => {
        if (!isGeoLayout || !isGeoEdit) return;
        event.preventDefault();

        const rect = container.getBoundingClientRect();
        const point: [number, number] = [event.clientX - rect.left, event.clientY - rect.top];

        const around = map.unproject(point);
        const zoomDelta = -event.deltaY * 0.002;
        const nextZoom = map.getZoom() + zoomDelta;
        map.zoomTo(nextZoom, { duration: 0, around });
      };

      container.addEventListener("wheel", handleWheel, { passive: false });
      return () => container.removeEventListener("wheel", handleWheel);
    }, [geoLayout.mapRef, isGeoLayout, isGeoEdit]);

    return (
      <div
        ref={canvasContainerRef}
        style={canvasStyle}
        className={`react-flow-canvas canvas-container${isGeoLayout ? " maplibre-active" : ""}`}
      >
        {isGeoLayout && (
          <div
            id="react-topoviewer-geo-map"
            ref={geoLayout.containerRef}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              zIndex: 0
            }}
          />
        )}
        <ReactFlow
          nodes={allNodes}
          edges={allEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
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
          onlyRenderVisibleElements={!isLowDetail}
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
          nodesConnectable={mode === "edit" && !isLocked}
          elementsSelectable
          zoomOnScroll={!isGeoLayout}
          zoomOnPinch={!isGeoLayout}
          zoomOnDoubleClick={!isGeoLayout}
          panOnScroll={false}
          style={reactFlowStyle}
        >
          {!isLowDetail && !isGeoLayout && (
            <Background variant={BackgroundVariant.Dots} gap={GRID_SIZE} size={1} color="#555" />
          )}
        </ReactFlow>

        <ContextMenu
          isVisible={handlers.contextMenu.type !== null}
          position={handlers.contextMenu.position}
          items={contextMenuItems}
          onClose={handlers.closeContextMenu}
        />

        {/* Helper lines for node alignment during drag */}
        <HelperLines lines={helperLines} />

        {linkSourceNode && handlers.reactFlowInstance.current && (
          <LinkCreationLine
            linkSourceNodeId={linkSourceNode}
            linkTargetNodeId={linkTargetNodeId}
            nodes={allNodes}
            edges={allEdges}
            sourcePosition={sourceNodePosition}
            linkCreationSeed={linkCreationSeed}
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
  linkSourceNodeId: string;
  linkTargetNodeId: string | null;
  nodes: Node[];
  edges: Edge[];
  sourcePosition: { x: number; y: number } | null;
  linkCreationSeed?: number | null;
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
  ({
    linkSourceNodeId,
    linkTargetNodeId,
    nodes,
    edges,
    sourcePosition,
    linkCreationSeed,
    reactFlowInstance
  }) => {
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

    const sourceNode = useMemo(
      () => nodes.find((node) => node.id === linkSourceNodeId) ?? null,
      [nodes, linkSourceNodeId]
    );
    const targetNode = useMemo(
      () =>
        linkTargetNodeId ? (nodes.find((node) => node.id === linkTargetNodeId) ?? null) : null,
      [nodes, linkTargetNodeId]
    );
    const viewport = reactFlowInstance.getViewport();
    const bounds = getContainerBounds();
    const relativeMouseX = bounds && mousePosition ? mousePosition.x - bounds.left : null;
    const relativeMouseY = bounds && mousePosition ? mousePosition.y - bounds.top : null;
    const labelStyle = useMemo(() => buildLinkLabelStyle(viewport.zoom), [viewport.zoom]);

    const previewLinkInfo = useMemo(() => {
      if (!sourceNode || !targetNode) return null;

      const { sourceEndpoint, targetEndpoint } = allocateEndpointsForLink(
        nodes as TopoNode[],
        edges as TopoEdge[],
        linkSourceNodeId,
        targetNode.id
      );
      const previewId = linkCreationSeed
        ? buildEdgeId(
            linkSourceNodeId,
            targetNode.id,
            sourceEndpoint,
            targetEndpoint,
            linkCreationSeed
          )
        : null;

      const parallelInfo = getPreviewParallelInfo(
        edges,
        linkSourceNodeId,
        targetNode.id,
        previewId
      );
      const loopIndex = edges.filter(
        (edge) => edge.source === sourceNode.id && edge.target === sourceNode.id
      ).length;

      return { previewId, parallelInfo, loopIndex, sourceEndpoint, targetEndpoint };
    }, [sourceNode, targetNode, edges, nodes, linkSourceNodeId, linkCreationSeed]);

    const previewGeometry = useMemo(() => {
      if (!sourceNode || !mousePosition || !bounds) return null;

      const zoom = viewport.zoom;
      const iconSize = LINK_PREVIEW_ICON_SIZE * zoom;
      const stepSize = LINK_PREVIEW_CONTROL_POINT_STEP_SIZE * zoom;
      const labelOffset = LINK_LABEL_OFFSET * zoom;

      if (targetNode) {
        const sourcePos = getNodePosition(sourceNode);
        const targetPos = getNodePosition(targetNode);
        const sourceLabel = previewLinkInfo?.sourceEndpoint ?? "";
        const targetLabel = previewLinkInfo?.targetEndpoint ?? "";

        if (sourceNode.id === targetNode.id) {
          const nodeWidth = (sourceNode.measured?.width ?? LINK_PREVIEW_ICON_SIZE) * zoom;
          const nodeX = sourcePos.x * zoom + viewport.x + (nodeWidth - iconSize) / 2;
          const nodeY = sourcePos.y * zoom + viewport.y;
          const loopIndex = previewLinkInfo?.loopIndex ?? 0;
          const loopGeometry = calculateLoopEdgeGeometry(nodeX, nodeY, iconSize, loopIndex, zoom);
          return {
            path: loopGeometry.path,
            sourceLabelPos: sourceLabel ? loopGeometry.sourceLabelPos : null,
            targetLabelPos: targetLabel ? loopGeometry.targetLabelPos : null,
            sourceLabel,
            targetLabel
          };
        }

        const sourceWidth = (sourceNode.measured?.width ?? LINK_PREVIEW_ICON_SIZE) * zoom;
        const targetWidth = (targetNode.measured?.width ?? LINK_PREVIEW_ICON_SIZE) * zoom;
        const sourceRect = {
          x: sourcePos.x * zoom + viewport.x + (sourceWidth - iconSize) / 2,
          y: sourcePos.y * zoom + viewport.y,
          width: iconSize,
          height: iconSize
        };
        const targetRect = {
          x: targetPos.x * zoom + viewport.x + (targetWidth - iconSize) / 2,
          y: targetPos.y * zoom + viewport.y,
          width: iconSize,
          height: iconSize
        };

        const points = getEdgePoints(sourceRect, targetRect);
        const parallelInfo =
          previewLinkInfo?.parallelInfo ??
          getPreviewParallelInfo(edges, linkSourceNodeId, targetNode.id);
        const controlPoint = calculateControlPoint(
          points.sx,
          points.sy,
          points.tx,
          points.ty,
          parallelInfo.index,
          parallelInfo.total,
          parallelInfo.isCanonicalDirection,
          stepSize
        );

        return {
          path: buildPath(points.sx, points.sy, points.tx, points.ty, controlPoint),
          sourceLabelPos: sourceLabel
            ? getLabelPosition(
                points.sx,
                points.sy,
                points.tx,
                points.ty,
                labelOffset,
                controlPoint ?? undefined
              )
            : null,
          targetLabelPos: targetLabel
            ? getLabelPosition(
                points.tx,
                points.ty,
                points.sx,
                points.sy,
                labelOffset,
                controlPoint ?? undefined
              )
            : null,
          sourceLabel,
          targetLabel
        };
      }

      if (!sourcePosition || relativeMouseX === null || relativeMouseY === null) return null;
      const screenSourceX = sourcePosition.x * zoom + viewport.x;
      const screenSourceY = sourcePosition.y * zoom + viewport.y;
      return {
        path: `M ${screenSourceX} ${screenSourceY} L ${relativeMouseX} ${relativeMouseY}`,
        sourceLabelPos: null,
        targetLabelPos: null,
        sourceLabel: "",
        targetLabel: ""
      };
    }, [
      sourceNode,
      targetNode,
      previewLinkInfo,
      edges,
      linkSourceNodeId,
      sourcePosition,
      viewport.x,
      viewport.y,
      viewport.zoom,
      relativeMouseX,
      relativeMouseY,
      mousePosition,
      bounds
    ]);

    if (!previewGeometry) return null;

    const strokeWidth = LINK_PREVIEW_WIDTH * viewport.zoom;

    return (
      <div style={LINK_LINE_SVG_STYLE}>
        <svg style={{ width: "100%", height: "100%" }}>
          <path
            d={previewGeometry.path}
            fill="none"
            style={{
              stroke: LINK_PREVIEW_COLOR,
              strokeWidth,
              opacity: LINK_PREVIEW_OPACITY
            }}
          />
        </svg>
        {previewGeometry.sourceLabel && previewGeometry.sourceLabelPos && (
          <div
            style={{
              ...labelStyle,
              transform: `translate(-50%, -50%) translate(${previewGeometry.sourceLabelPos.x}px, ${previewGeometry.sourceLabelPos.y}px)`
            }}
          >
            {previewGeometry.sourceLabel}
          </div>
        )}
        {previewGeometry.targetLabel && previewGeometry.targetLabelPos && (
          <div
            style={{
              ...labelStyle,
              transform: `translate(-50%, -50%) translate(${previewGeometry.targetLabelPos.x}px, ${previewGeometry.targetLabelPos.y}px)`
            }}
          >
            {previewGeometry.targetLabel}
          </div>
        )}
      </div>
    );
  }
);

LinkCreationLine.displayName = "LinkCreationLine";
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
