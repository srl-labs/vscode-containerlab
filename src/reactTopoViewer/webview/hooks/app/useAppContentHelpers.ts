/**
 * AppContent helpers.
 */
import React from "react";

import type { TopoEdge, TopoNode } from "../../../shared/types/graph";
import { convertToEditorData, convertToNetworkEditorData } from "../../../shared/utilities";
import type { AnnotationHandlers } from "../../components/canvas/types";
import {
  findEdgeAnnotationInLookup,
  type EdgeAnnotationLookup
} from "../../annotations/edgeAnnotations";
import { convertToLinkEditorData } from "../../utils/linkEditorConversions";
import { parseEndpointLabelOffset } from "../../annotations/endpointLabelOffset";
import type { AnnotationContextValue } from "../canvas";

interface SelectionStateSlice {
  selectedNode: string | null;
  selectedEdge: string | null;
  editingImpairment: string | null;
  editingNode: string | null;
  editingEdge: string | null;
  editingNetwork: string | null;
  endpointLabelOffset: number;
}

type EdgeRawData = { id: string; source: string; target: string } & Record<string, unknown>;

/** Extract edge raw data by ID */
function getEdgeRawData(edgeId: string | null, edges: TopoEdge[]): EdgeRawData | null {
  if (!edgeId) return null;
  const edge = edges.find((e) => e.id === edgeId);
  if (!edge) return null;
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    ...(edge.data as Record<string, unknown>)
  };
}

export function useCustomNodeErrorToast(
  customNodeError: unknown,
  addToast: (message: string, type?: "success" | "error" | "info", duration?: number) => void,
  clearCustomNodeError: () => void
): void {
  React.useEffect(() => {
    if (!customNodeError) return;
    const errorMsg = typeof customNodeError === "string" ? customNodeError : "Unknown error";
    addToast(`Failed to save custom node: ${errorMsg}`, "error", 5000);
    clearCustomNodeError();
  }, [customNodeError, addToast, clearCustomNodeError]);
}

export function useFilteredGraphElements(
  nodes: TopoNode[],
  edges: TopoEdge[],
  showDummyLinks: boolean
): { filteredNodes: TopoNode[]; filteredEdges: TopoEdge[] } {
  const filteredNodes = React.useMemo(() => {
    if (showDummyLinks) return nodes;
    return nodes.filter((node) => !node.id.startsWith("dummy"));
  }, [nodes, showDummyLinks]);

  const filteredEdges = React.useMemo(() => {
    if (showDummyLinks) return edges;
    const dummyNodeIds = new Set(
      nodes.filter((node) => node.id.startsWith("dummy")).map((node) => node.id)
    );
    return edges.filter((edge) => !dummyNodeIds.has(edge.source) && !dummyNodeIds.has(edge.target));
  }, [nodes, edges, showDummyLinks]);

  return { filteredNodes, filteredEdges };
}

export function useSelectionData(
  state: SelectionStateSlice,
  nodes: TopoNode[],
  edges: TopoEdge[],
  edgeAnnotationLookup: EdgeAnnotationLookup
) {
  const selectedNodeData = React.useMemo(() => {
    if (!state.selectedNode) return null;
    const node = nodes.find((n) => n.id === state.selectedNode);
    if (!node) return null;
    return { id: node.id, ...(node.data as Record<string, unknown>) };
  }, [state.selectedNode, nodes]);

  const selectedLinkData = React.useMemo(
    () => getEdgeRawData(state.selectedEdge, edges),
    [state.selectedEdge, edges]
  );

  const selectedLinkImpairmentData = React.useMemo(
    () => getEdgeRawData(state.editingImpairment, edges),
    [state.editingImpairment, edges]
  );

  const editingNodeRawData = React.useMemo(() => {
    if (!state.editingNode) return null;
    const node = nodes.find((n) => n.id === state.editingNode);
    if (!node) return null;
    return { id: node.id, ...(node.data as Record<string, unknown>) };
  }, [state.editingNode, nodes]);

  const editingNetworkRawData = React.useMemo(() => {
    if (!state.editingNetwork) return null;
    const node = nodes.find((n) => n.id === state.editingNetwork);
    if (!node) return null;
    return { id: node.id, ...(node.data as Record<string, unknown>) };
  }, [state.editingNetwork, nodes]);

  const editingLinkRawData = React.useMemo(
    () => getEdgeRawData(state.editingEdge, edges),
    [state.editingEdge, edges]
  );

  const editingNodeData = React.useMemo(
    () => convertToEditorData(editingNodeRawData),
    [editingNodeRawData]
  );
  const editingNodeInheritedProps = React.useMemo(() => {
    const extra = (editingNodeRawData as Record<string, unknown> | null)?.extraData as
      | Record<string, unknown>
      | undefined;
    const inherited = extra?.inherited;
    return Array.isArray(inherited)
      ? inherited.filter((p): p is string => typeof p === "string")
      : [];
  }, [editingNodeRawData]);
  const editingNetworkData = React.useMemo(
    () => convertToNetworkEditorData(editingNetworkRawData),
    [editingNetworkRawData]
  );
  const editingLinkData = React.useMemo(() => {
    const base = convertToLinkEditorData(editingLinkRawData);
    if (!base) return null;
    const annotation = findEdgeAnnotationInLookup(edgeAnnotationLookup, {
      id: base.id,
      source: base.source,
      target: base.target,
      sourceEndpoint: base.sourceEndpoint,
      targetEndpoint: base.targetEndpoint
    });
    const offset =
      parseEndpointLabelOffset(annotation?.endpointLabelOffset) ?? state.endpointLabelOffset;
    const enabled =
      annotation?.endpointLabelOffsetEnabled ??
      (annotation?.endpointLabelOffset !== undefined ? true : false);
    return {
      ...base,
      endpointLabelOffsetEnabled: enabled,
      endpointLabelOffset: offset
    };
  }, [editingLinkRawData, edgeAnnotationLookup, state.endpointLabelOffset]);

  return {
    selectedNodeData,
    selectedLinkData,
    selectedLinkImpairmentData,
    editingNodeData,
    editingNetworkData,
    editingLinkData,
    editingNodeInheritedProps
  };
}

export function useAnnotationCanvasHandlers(annotations: AnnotationContextValue): {
  annotationMode: {
    isAddTextMode: boolean;
    isAddShapeMode: boolean;
    pendingShapeType?: "rectangle" | "circle" | "line";
  };
  canvasAnnotationHandlers: AnnotationHandlers;
} {
  const annotationMode = React.useMemo(
    () => ({
      isAddTextMode: annotations.isAddTextMode,
      isAddShapeMode: annotations.isAddShapeMode,
      pendingShapeType: annotations.isAddShapeMode ? annotations.pendingShapeType : undefined
    }),
    [annotations.isAddTextMode, annotations.isAddShapeMode, annotations.pendingShapeType]
  );

  // Keep a stable handlers object for ReactFlow/canvas store subscribers.
  const latestAnnotationsRef = React.useRef({
    handleTextCanvasClick: annotations.handleTextCanvasClick,
    handleShapeCanvasClick: annotations.handleShapeCanvasClick,
    disableAddTextMode: annotations.disableAddTextMode,
    disableAddShapeMode: annotations.disableAddShapeMode,
    editTextAnnotation: annotations.editTextAnnotation,
    editShapeAnnotation: annotations.editShapeAnnotation,
    deleteTextAnnotation: annotations.deleteTextAnnotation,
    deleteShapeAnnotation: annotations.deleteShapeAnnotation,
    updateTextSize: annotations.updateTextSize,
    updateShapeSize: annotations.updateShapeSize,
    updateTextRotation: annotations.updateTextRotation,
    updateShapeRotation: annotations.updateShapeRotation,
    onTextRotationStart: annotations.onTextRotationStart,
    onTextRotationEnd: annotations.onTextRotationEnd,
    onShapeRotationStart: annotations.onShapeRotationStart,
    onShapeRotationEnd: annotations.onShapeRotationEnd,
    updateShapeStartPosition: annotations.updateShapeStartPosition,
    updateShapeEndPosition: annotations.updateShapeEndPosition,
    persistAnnotations: annotations.persistAnnotations,
    onNodeDropped: annotations.onNodeDropped,
    updateGroupSize: annotations.updateGroupSize,
    editGroup: annotations.editGroup,
    deleteGroup: annotations.deleteGroup,
    getGroupMembers: annotations.getGroupMembers
  });
  latestAnnotationsRef.current = {
    handleTextCanvasClick: annotations.handleTextCanvasClick,
    handleShapeCanvasClick: annotations.handleShapeCanvasClick,
    disableAddTextMode: annotations.disableAddTextMode,
    disableAddShapeMode: annotations.disableAddShapeMode,
    editTextAnnotation: annotations.editTextAnnotation,
    editShapeAnnotation: annotations.editShapeAnnotation,
    deleteTextAnnotation: annotations.deleteTextAnnotation,
    deleteShapeAnnotation: annotations.deleteShapeAnnotation,
    updateTextSize: annotations.updateTextSize,
    updateShapeSize: annotations.updateShapeSize,
    updateTextRotation: annotations.updateTextRotation,
    updateShapeRotation: annotations.updateShapeRotation,
    onTextRotationStart: annotations.onTextRotationStart,
    onTextRotationEnd: annotations.onTextRotationEnd,
    onShapeRotationStart: annotations.onShapeRotationStart,
    onShapeRotationEnd: annotations.onShapeRotationEnd,
    updateShapeStartPosition: annotations.updateShapeStartPosition,
    updateShapeEndPosition: annotations.updateShapeEndPosition,
    persistAnnotations: annotations.persistAnnotations,
    onNodeDropped: annotations.onNodeDropped,
    updateGroupSize: annotations.updateGroupSize,
    editGroup: annotations.editGroup,
    deleteGroup: annotations.deleteGroup,
    getGroupMembers: annotations.getGroupMembers
  };

  const onAddTextClick = React.useCallback((position: { x: number; y: number }) => {
    latestAnnotationsRef.current.handleTextCanvasClick(position);
  }, []);
  const onAddShapeClick = React.useCallback((position: { x: number; y: number }) => {
    latestAnnotationsRef.current.handleShapeCanvasClick(position);
  }, []);
  const disableAddTextMode = React.useCallback(() => {
    latestAnnotationsRef.current.disableAddTextMode();
  }, []);
  const disableAddShapeMode = React.useCallback(() => {
    latestAnnotationsRef.current.disableAddShapeMode();
  }, []);
  const onEditFreeText = React.useCallback((id: string) => {
    latestAnnotationsRef.current.editTextAnnotation(id);
  }, []);
  const onEditFreeShape = React.useCallback((id: string) => {
    latestAnnotationsRef.current.editShapeAnnotation(id);
  }, []);
  const onDeleteFreeText = React.useCallback((id: string) => {
    latestAnnotationsRef.current.deleteTextAnnotation(id);
  }, []);
  const onDeleteFreeShape = React.useCallback((id: string) => {
    latestAnnotationsRef.current.deleteShapeAnnotation(id);
  }, []);
  const onUpdateFreeTextSize = React.useCallback((id: string, width: number, height: number) => {
    latestAnnotationsRef.current.updateTextSize(id, width, height);
  }, []);
  const onUpdateFreeShapeSize = React.useCallback((id: string, width: number, height: number) => {
    latestAnnotationsRef.current.updateShapeSize(id, width, height);
  }, []);
  const onUpdateFreeTextRotation = React.useCallback((id: string, rotation: number) => {
    latestAnnotationsRef.current.updateTextRotation(id, rotation);
  }, []);
  const onUpdateFreeShapeRotation = React.useCallback((id: string, rotation: number) => {
    latestAnnotationsRef.current.updateShapeRotation(id, rotation);
  }, []);
  const onFreeTextRotationStart = React.useCallback((id: string) => {
    latestAnnotationsRef.current.onTextRotationStart(id);
  }, []);
  const onFreeTextRotationEnd = React.useCallback((id: string) => {
    latestAnnotationsRef.current.onTextRotationEnd(id);
  }, []);
  const onFreeShapeRotationStart = React.useCallback((id: string) => {
    latestAnnotationsRef.current.onShapeRotationStart(id);
  }, []);
  const onFreeShapeRotationEnd = React.useCallback((id: string) => {
    latestAnnotationsRef.current.onShapeRotationEnd(id);
  }, []);
  const onUpdateFreeShapeStartPosition = React.useCallback(
    (id: string, startPosition: { x: number; y: number }) => {
      latestAnnotationsRef.current.updateShapeStartPosition(id, startPosition);
    },
    []
  );
  const onUpdateFreeShapeEndPosition = React.useCallback(
    (id: string, endPosition: { x: number; y: number }) => {
      latestAnnotationsRef.current.updateShapeEndPosition(id, endPosition);
    },
    []
  );
  const onPersistAnnotations = React.useCallback(() => {
    latestAnnotationsRef.current.persistAnnotations();
  }, []);
  const onNodeDropped = React.useCallback((nodeId: string, position: { x: number; y: number }) => {
    latestAnnotationsRef.current.onNodeDropped(nodeId, position);
  }, []);
  const onUpdateGroupSize = React.useCallback((id: string, width: number, height: number) => {
    latestAnnotationsRef.current.updateGroupSize(id, width, height);
  }, []);
  const onEditGroup = React.useCallback((id: string) => {
    latestAnnotationsRef.current.editGroup(id);
  }, []);
  const onDeleteGroup = React.useCallback((id: string) => {
    latestAnnotationsRef.current.deleteGroup(id);
  }, []);
  const getGroupMembers = React.useCallback(
    (groupId: string, options?: { includeNested?: boolean }) =>
      latestAnnotationsRef.current.getGroupMembers(groupId, options),
    []
  );

  const canvasAnnotationHandlers: AnnotationHandlers = React.useMemo(
    () => ({
      // Add mode handlers
      onAddTextClick,
      onAddShapeClick,
      disableAddTextMode,
      disableAddShapeMode,
      // Edit handlers
      onEditFreeText,
      onEditFreeShape,
      // Delete handlers
      onDeleteFreeText,
      onDeleteFreeShape,
      // Size update handlers (for resize)
      onUpdateFreeTextSize,
      onUpdateFreeShapeSize,
      // Rotation handlers (live updates during drag)
      onUpdateFreeTextRotation,
      onUpdateFreeShapeRotation,
      // Rotation start/end handlers (for undo/redo)
      onFreeTextRotationStart,
      onFreeTextRotationEnd,
      onFreeShapeRotationStart,
      onFreeShapeRotationEnd,
      // Line-specific handlers
      onUpdateFreeShapeStartPosition,
      onUpdateFreeShapeEndPosition,
      // Persist annotations (call on drag end)
      onPersistAnnotations,
      // Node dropped handler (for group membership)
      onNodeDropped,
      // Group handlers
      onUpdateGroupSize,
      onEditGroup,
      onDeleteGroup,
      // Get group members (for group dragging)
      getGroupMembers
    }),
    [
      onAddTextClick,
      onAddShapeClick,
      disableAddTextMode,
      disableAddShapeMode,
      onEditFreeText,
      onEditFreeShape,
      onDeleteFreeText,
      onDeleteFreeShape,
      onUpdateFreeTextSize,
      onUpdateFreeShapeSize,
      onUpdateFreeTextRotation,
      onUpdateFreeShapeRotation,
      onFreeTextRotationStart,
      onFreeTextRotationEnd,
      onFreeShapeRotationStart,
      onFreeShapeRotationEnd,
      onUpdateFreeShapeStartPosition,
      onUpdateFreeShapeEndPosition,
      onPersistAnnotations,
      onNodeDropped,
      onUpdateGroupSize,
      onEditGroup,
      onDeleteGroup,
      getGroupMembers
    ]
  );

  return { annotationMode, canvasAnnotationHandlers };
}
