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

import "@xyflow/react/dist/style.css";

import {
  FREE_SHAPE_NODE_TYPE,
  FREE_TEXT_NODE_TYPE,
  GROUP_NODE_TYPE
} from "../../annotations/annotationNodeConverters";
import {
  useAnnotationCanvasHandlers,
  useCanvasHandlers,
  useCanvasRefMethods,
  useDeleteHandlers,
  useGeoMapLayout,
  useHelperLines,
  useLinkCreation,
  useSourceNodePosition,
  GRID_SIZE
} from "../../hooks/canvas";
import { useCanvasStore, useFitViewRequestId } from "../../stores/canvasStore";
import { useGraphActions } from "../../stores/graphStore";
import { useIsLocked, useMode, useTopoViewerActions } from "../../stores/topoViewerStore";
import { ContextMenu, type ContextMenuItem } from "../context-menu/ContextMenu";

import { HelperLines } from "./HelperLines";
import {
  buildEdgeContextMenu,
  buildNodeContextMenu,
  buildPaneContextMenu
} from "./contextMenuBuilders";
import { edgeTypes, edgeTypesLite } from "./edges";
import { CustomConnectionLine, LinkCreationLine } from "./LinkPreview";
import { nodeTypes, nodeTypesLite } from "./nodes";
import type {
  AnnotationHandlers,
  EdgeLabelMode,
  ReactFlowCanvasProps,
  ReactFlowCanvasRef
} from "./types";

/** Parameters for useContextMenuItems hook */
interface ContextMenuItemsParams {
  handlers: ReturnType<typeof useCanvasHandlers>;
  state: { mode: "view" | "edit"; isLocked: boolean };
  editNode: (id: string | null) => void;
  editNetwork: (id: string | null) => void;
  editEdge: (id: string | null) => void;
  handleDeleteNode: (nodeId: string) => void;
  handleDeleteEdge: (edgeId: string) => void;
  showNodeInfo: (nodeId: string) => void;
  showLinkInfo: (edgeId: string) => void;
  showLinkImpairment: (edgeId: string) => void;
  nodesRef: React.RefObject<Node[]>;
  linkSourceNode: string | null;
  startLinkCreation: (nodeId: string) => void;
  cancelLinkCreation: () => void;
  annotationHandlers?: AnnotationHandlers;
  onOpenNodePalette?: () => void;
  onAddDefaultNode?: (position: { x: number; y: number }) => void;
}

/**
 * Hook for building context menu items.
 */
function useContextMenuItems(params: ContextMenuItemsParams): ContextMenuItem[] {
  const {
    handlers,
    state,
    editNode,
    editNetwork,
    editEdge,
    handleDeleteNode,
    handleDeleteEdge,
    showNodeInfo,
    showLinkInfo,
    showLinkImpairment,
    nodesRef,
    linkSourceNode,
    startLinkCreation,
    cancelLinkCreation,
    annotationHandlers,
    onOpenNodePalette,
    onAddDefaultNode
  } = params;
  const { type, targetId, position: menuPosition } = handlers.contextMenu;

  return useMemo(() => {
    const isEditMode = state.mode === "edit";
    const isLocked = state.isLocked;
    const nodes = nodesRef.current ?? [];

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
        editNetwork,
        handleDeleteNode,
        showNodeInfo,
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
        handleDeleteEdge,
        showLinkInfo,
        showLinkImpairment
      });
    }
    if (type === "pane") {
      return buildPaneContextMenu({
        isEditMode,
        isLocked,
        closeContextMenu: handlers.closeContextMenu,
        reactFlowInstance: handlers.reactFlowInstance,
        onOpenNodePalette,
        onAddDefaultNode,
        menuPosition
      });
    }
    return [];
  }, [
    type,
    targetId,
    menuPosition,
    state.mode,
    state.isLocked,
    handlers.closeContextMenu,
    handlers.reactFlowInstance,
    editNode,
    editNetwork,
    editEdge,
    handleDeleteNode,
    handleDeleteEdge,
    showNodeInfo,
    showLinkInfo,
    nodesRef,
    linkSourceNode,
    startLinkCreation,
    cancelLinkCreation,
    annotationHandlers,
    onOpenNodePalette,
    onAddDefaultNode
  ]);
}

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
      if (handleAltDelete(event, node, mode, isLocked, handleDeleteNode, annotationHandlers))
        return;
      if (handleLinkCreationClick(event, node, linkSourceNode, completeLinkCreation)) return;
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
  const allowSelectionOnDrag = !isInAddMode && (!isGeoLayout || isGeoEdit);
  const nodesDraggable = !isLocked && (!isGeoLayout || isGeoEdit);
  const nodesConnectable = mode === "edit" && !isLocked;
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
  return { allowPanOnDrag, allowSelectionOnDrag, nodesDraggable, nodesConnectable, reactFlowStyle };
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
  reactFlowInstance: ReactFlowInstance | null;
  isInAddMode: boolean;
  addModeMessage?: string | null;
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
    reactFlowInstance,
    isInAddMode,
    addModeMessage
  } = params;

  const geoMapLayer = isGeoLayout ? (
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
  ) : null;

  const backgroundLayer =
    !isLowDetail && !isGeoLayout ? (
      <Background variant={BackgroundVariant.Dots} gap={GRID_SIZE} size={1} color="#555" />
    ) : null;

  const linkCreationLine =
    linkSourceNode && reactFlowInstance ? (
      <LinkCreationLine
        linkSourceNodeId={linkSourceNode}
        linkTargetNodeId={linkTargetNodeId}
        nodes={nodes}
        edges={edges}
        sourcePosition={sourcePosition}
        linkCreationSeed={linkCreationSeed}
        reactFlowInstance={reactFlowInstance}
      />
    ) : null;

  const linkIndicator = linkSourceNode ? (
    <LinkCreationIndicator linkSourceNode={linkSourceNode} />
  ) : null;

  const annotationIndicator =
    isInAddMode && addModeMessage ? <AnnotationModeIndicator message={addModeMessage} /> : null;

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
      layout = "preset",
      isGeoLayout = false,
      annotationMode,
      annotationHandlers,
      onNodeDelete,
      onEdgeDelete,
      linkLabelMode = "show-all",
      onInit: onInitProp,
      onEdgeCreated,
      onShiftClickCreate,
      onOpenNodePalette,
      onDropCreateNode,
      onDropCreateNetwork
    },
    ref
  ) => {
    const mode = useMode();
    const isLocked = useIsLocked();
    const { selectNode, selectEdge, editNode, editNetwork, editEdge, editImpairment } =
      useTopoViewerActions();

    // Get setters from graph store - these update the single source of truth
    const { setNodes, setEdges, onNodesChange, onEdgesChange } = useGraphActions();
    const reactFlowInstanceRef = useRef<ReactFlowInstance | null>(null);
    const canvasContainerRef = useRef<HTMLDivElement | null>(null);
    const fitViewRequestId = useFitViewRequestId();
    const lastFitViewRequestRef = useRef(0);
    const [isReactFlowReady, setIsReactFlowReady] = useState(false);

    const topoState = useMemo(() => ({ mode, isLocked }), [mode, isLocked]);

    // Import canvas store actions
    const { setEdgeRenderConfig, setNodeRenderConfig, setAnnotationHandlers, setLinkSourceNode } =
      useCanvasStore();

    const floatingPanelRef = useRef<{ triggerShake: () => void } | null>(null);

    // All nodes (topology + annotation) are now unified in propNodes
    const allNodes = (propNodes as Node[]) ?? [];
    const allEdges = (propEdges as Edge[]) ?? [];

    const isGeoEditable = isGeoLayout && !isLocked;

    const geoLayout = useGeoMapLayout({
      isGeoLayout,
      isEditable: isGeoEditable,
      nodes: allNodes,
      setNodes,
      reactFlowInstanceRef,
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
        reactFlowInstanceRef.current
          ?.fitView({ padding: 0.2, duration: 200 })
          .catch(() => {
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
    const { linkTargetNodeId, handleNodeMouseEnter, handleNodeMouseLeave } =
      useLinkTargetHover(linkSourceNode);

    // Helper lines for node alignment during drag
    const { helperLines, updateHelperLines, clearHelperLines } = useHelperLines();

    // Use extracted hooks for render config and drag handlers
    const { isLowDetail, edgeRenderConfig, nodeRenderConfig } = useRenderConfig(
      allNodes.length,
      allEdges.length,
      linkLabelMode
    );
    const activeNodeTypes = useMemo(
      () => (isLowDetail ? nodeTypesLite : nodeTypes),
      [isLowDetail]
    );
    const activeEdgeTypes = useMemo(
      () => (isLowDetail ? edgeTypesLite : edgeTypes),
      [isLowDetail]
    );
    useSyncCanvasStore({
      linkSourceNode,
      setLinkSourceNode,
      edgeRenderConfig,
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
      onAddDefaultNode: onShiftClickCreate
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

        const dataStr = event.dataTransfer.getData("application/reactflow-node");
        if (!dataStr) return;

        try {
          const data = JSON.parse(dataStr) as { type: string; templateName?: string; networkType?: string };
          const rfInstance = handlersReactFlowInstance.current;
          if (!rfInstance) return;

          // Get the drop position in flow coordinates
          const position = rfInstance.screenToFlowPosition({
            x: event.clientX,
            y: event.clientY
          });

          // Snap to grid
          const snappedPosition = {
            x: Math.round(position.x / GRID_SIZE) * GRID_SIZE,
            y: Math.round(position.y / GRID_SIZE) * GRID_SIZE
          };

          if (data.type === "node" && data.templateName && onDropCreateNode) {
            onDropCreateNode(snappedPosition, data.templateName);
          } else if (data.type === "network" && data.networkType && onDropCreateNetwork) {
            onDropCreateNetwork(snappedPosition, data.networkType);
          }
        } catch {
          // Invalid drop data, ignore
        }
      },
      [
        mode,
        isLocked,
        handlersReactFlowInstance,
        onDropCreateNode,
        onDropCreateNetwork
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
      reactFlowInstance: handlers.reactFlowInstance.current,
      isInAddMode,
      addModeMessage
    });
    const contextMenuVisible = handlers.contextMenu.type !== null;

    return (
      <div
        ref={canvasContainerRef}
        style={canvasStyle}
        className={`react-flow-canvas canvas-container${isGeoLayout ? " maplibre-active" : ""}`}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {overlays.geoMapLayer}
        <ReactFlow
          nodes={allNodes}
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
