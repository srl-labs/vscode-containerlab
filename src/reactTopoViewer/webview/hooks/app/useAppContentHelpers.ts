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
  editingNode: string | null;
  editingEdge: string | null;
  editingNetwork: string | null;
  endpointLabelOffset: number;
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

  const selectedLinkData = React.useMemo(() => {
    if (!state.selectedEdge) return null;
    const edge = edges.find((e) => e.id === state.selectedEdge);
    if (!edge) return null;
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      ...(edge.data as Record<string, unknown>)
    };
  }, [state.selectedEdge, edges]);

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

  const editingLinkRawData = React.useMemo(() => {
    if (!state.editingEdge) return null;
    const edge = edges.find((e) => e.id === state.editingEdge);
    if (!edge) return null;
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      ...(edge.data as Record<string, unknown>)
    };
  }, [state.editingEdge, edges]);

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
  const {
    isAddTextMode,
    isAddShapeMode,
    pendingShapeType,
    handleTextCanvasClick,
    handleShapeCanvasClick,
    disableAddTextMode,
    disableAddShapeMode,
    editTextAnnotation,
    editShapeAnnotation,
    deleteTextAnnotation,
    deleteShapeAnnotation,
    updateTextSize,
    updateShapeSize,
    updateTextRotation,
    updateShapeRotation,
    onTextRotationStart,
    onTextRotationEnd,
    onShapeRotationStart,
    onShapeRotationEnd,
    updateShapeEndPosition,
    shapeAnnotations,
    updateShapeAnnotation,
    onNodeDropped,
    updateGroupSize,
    editGroup,
    deleteGroup,
    getGroupMembers
  } = annotations;

  const annotationMode = React.useMemo(
    () => ({
      isAddTextMode,
      isAddShapeMode,
      pendingShapeType: isAddShapeMode ? pendingShapeType : undefined
    }),
    [isAddTextMode, isAddShapeMode, pendingShapeType]
  );

  const canvasAnnotationHandlers: AnnotationHandlers = React.useMemo(
    () => ({
      // Add mode handlers
      onAddTextClick: handleTextCanvasClick,
      onAddShapeClick: handleShapeCanvasClick,
      disableAddTextMode,
      disableAddShapeMode,
      // Edit handlers
      onEditFreeText: editTextAnnotation,
      onEditFreeShape: editShapeAnnotation,
      // Delete handlers
      onDeleteFreeText: deleteTextAnnotation,
      onDeleteFreeShape: deleteShapeAnnotation,
      // Size update handlers (for resize)
      onUpdateFreeTextSize: updateTextSize,
      onUpdateFreeShapeSize: updateShapeSize,
      // Rotation handlers (live updates during drag)
      onUpdateFreeTextRotation: updateTextRotation,
      onUpdateFreeShapeRotation: updateShapeRotation,
      // Rotation start/end handlers (for undo/redo)
      onFreeTextRotationStart: onTextRotationStart,
      onFreeTextRotationEnd: onTextRotationEnd,
      onFreeShapeRotationStart: onShapeRotationStart,
      onFreeShapeRotationEnd: onShapeRotationEnd,
      // Line-specific handlers
      onUpdateFreeShapeEndPosition: updateShapeEndPosition,
      onUpdateFreeShapeStartPosition: (id: string, startPosition: { x: number; y: number }) => {
        // Update both position and recalculate end position
        const shape = shapeAnnotations.find((s) => s.id === id);
        if (shape && shape.endPosition) {
          const dx = startPosition.x - shape.position.x;
          const dy = startPosition.y - shape.position.y;
          updateShapeAnnotation(id, {
            position: startPosition,
            endPosition: { x: shape.endPosition.x + dx, y: shape.endPosition.y + dy }
          });
        }
      },
      // Node dropped handler (for group membership)
      onNodeDropped,
      // Group handlers
      onUpdateGroupSize: updateGroupSize,
      onEditGroup: editGroup,
      onDeleteGroup: deleteGroup,
      // Get group members (for group dragging)
      getGroupMembers
    }),
    [
      handleTextCanvasClick,
      handleShapeCanvasClick,
      disableAddTextMode,
      disableAddShapeMode,
      editTextAnnotation,
      editShapeAnnotation,
      deleteTextAnnotation,
      deleteShapeAnnotation,
      updateTextSize,
      updateShapeSize,
      updateTextRotation,
      updateShapeRotation,
      onTextRotationStart,
      onTextRotationEnd,
      onShapeRotationStart,
      onShapeRotationEnd,
      updateShapeEndPosition,
      shapeAnnotations,
      updateShapeAnnotation,
      onNodeDropped,
      updateGroupSize,
      editGroup,
      deleteGroup,
      getGroupMembers
    ]
  );

  return { annotationMode, canvasAnnotationHandlers };
}
