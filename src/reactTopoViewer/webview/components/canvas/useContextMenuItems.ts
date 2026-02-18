import { useMemo, type RefObject } from "react";
import type { Edge, Node } from "@xyflow/react";

import type { useCanvasHandlers } from "../../hooks/canvas";
import type { ContextMenuItem } from "../context-menu/ContextMenu";

import {
  buildEdgeContextMenu,
  buildNodeContextMenu,
  buildPaneContextMenu
} from "./contextMenuBuilders";
import type { AnnotationHandlers } from "./types";

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
  nodesRef: RefObject<Node[]>;
  edgesRef: RefObject<Edge[]>;
  linkSourceNode: string | null;
  startLinkCreation: (nodeId: string) => void;
  cancelLinkCreation: () => void;
  annotationHandlers?: AnnotationHandlers;
  onOpenNodePalette?: () => void;
  onAddDefaultNode?: (position: { x: number; y: number }) => void;
  onAddGroup?: () => void;
  onAddText?: () => void;
  onAddTextAtPosition?: (position: { x: number; y: number }) => void;
  onAddShapes?: (shapeType?: string) => void;
  onAddShapeAtPosition?: (position: { x: number; y: number }, shapeType?: string) => void;
  onAddTrafficRateAtPosition?: (position: { x: number; y: number }) => void;
}

interface ResolveContextMenuItemsParams extends ContextMenuItemsParams {
  type: "node" | "edge" | "pane" | null;
  targetId: string | null;
  menuPosition: { x: number; y: number };
  nodes: Node[];
  edges: Edge[];
  isEditMode: boolean;
  isLocked: boolean;
}

function buildNodeItems(
  params: ResolveContextMenuItemsParams & { targetId: string }
): ContextMenuItem[] {
  const targetNode = params.nodes.find((node) => node.id === params.targetId);
  const targetNodeType = targetNode?.type;

  return buildNodeContextMenu({
    targetId: params.targetId,
    targetNodeType,
    isEditMode: params.isEditMode,
    isLocked: params.isLocked,
    closeContextMenu: params.handlers.closeContextMenu,
    editNode: params.editNode,
    editNetwork: params.editNetwork,
    handleDeleteNode: params.handleDeleteNode,
    showNodeInfo: params.showNodeInfo,
    linkSourceNode: params.linkSourceNode,
    startLinkCreation: params.startLinkCreation,
    cancelLinkCreation: params.cancelLinkCreation,
    editFreeText: params.annotationHandlers?.onEditFreeText,
    editFreeShape: params.annotationHandlers?.onEditFreeShape,
    deleteFreeText: params.annotationHandlers?.onDeleteFreeText,
    deleteFreeShape: params.annotationHandlers?.onDeleteFreeShape,
    editGroup: params.annotationHandlers?.onEditGroup,
    deleteGroup: params.annotationHandlers?.onDeleteGroup,
    editTrafficRate: params.annotationHandlers?.onEditTrafficRate,
    deleteTrafficRate: params.annotationHandlers?.onDeleteTrafficRate
  });
}

function buildEdgeItems(
  params: ResolveContextMenuItemsParams & { targetId: string }
): ContextMenuItem[] {
  const targetEdge = params.edges.find((edge) => edge.id === params.targetId);
  const edgeData = targetEdge?.data as
    | { sourceEndpoint?: string; targetEndpoint?: string; extraData?: Record<string, unknown> }
    | undefined;

  return buildEdgeContextMenu({
    targetId: params.targetId,
    sourceNode: targetEdge?.source,
    targetNode: targetEdge?.target,
    sourceEndpoint: edgeData?.sourceEndpoint,
    targetEndpoint: edgeData?.targetEndpoint,
    extraData: edgeData?.extraData,
    isEditMode: params.isEditMode,
    isLocked: params.isLocked,
    closeContextMenu: params.handlers.closeContextMenu,
    editEdge: params.editEdge,
    handleDeleteEdge: params.handleDeleteEdge,
    showLinkInfo: params.showLinkInfo,
    showLinkImpairment: params.showLinkImpairment
  });
}

function buildPaneItems(params: ResolveContextMenuItemsParams): ContextMenuItem[] {
  return buildPaneContextMenu({
    isEditMode: params.isEditMode,
    isLocked: params.isLocked,
    closeContextMenu: params.handlers.closeContextMenu,
    reactFlowInstance: params.handlers.reactFlowInstance,
    onOpenNodePalette: params.onOpenNodePalette,
    onAddDefaultNode: params.onAddDefaultNode,
    menuPosition: params.menuPosition,
    onAddGroup: params.onAddGroup,
    onAddText: params.onAddText,
    onAddTextAtPosition: params.onAddTextAtPosition,
    onAddShapes: params.onAddShapes,
    onAddShapeAtPosition: params.onAddShapeAtPosition,
    onAddTrafficRateAtPosition: params.onAddTrafficRateAtPosition
  });
}

function resolveContextMenuItems(params: ResolveContextMenuItemsParams): ContextMenuItem[] {
  if (params.type === "node" && params.targetId) {
    return buildNodeItems({ ...params, targetId: params.targetId });
  }

  if (params.type === "edge" && params.targetId) {
    return buildEdgeItems({ ...params, targetId: params.targetId });
  }

  if (params.type === "pane") {
    return buildPaneItems(params);
  }

  return [];
}

/**
 * Hook for building context menu items.
 */
export function useContextMenuItems(params: ContextMenuItemsParams): ContextMenuItem[] {
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
    edgesRef,
    linkSourceNode,
    startLinkCreation,
    cancelLinkCreation,
    annotationHandlers,
    onOpenNodePalette,
    onAddDefaultNode,
    onAddGroup,
    onAddText,
    onAddTextAtPosition,
    onAddShapes,
    onAddShapeAtPosition,
    onAddTrafficRateAtPosition
  } = params;
  const { type, targetId, position: menuPosition } = handlers.contextMenu;

  return useMemo(() => {
    return resolveContextMenuItems({
      ...params,
      type,
      targetId,
      menuPosition,
      nodes: nodesRef.current ?? [],
      edges: edgesRef.current ?? [],
      isEditMode: state.mode === "edit",
      isLocked: state.isLocked
    });
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
    showLinkImpairment,
    nodesRef,
    edgesRef,
    linkSourceNode,
    startLinkCreation,
    cancelLinkCreation,
    annotationHandlers,
    onOpenNodePalette,
    onAddDefaultNode,
    onAddGroup,
    onAddText,
    onAddTextAtPosition,
    onAddShapes,
    onAddShapeAtPosition,
    onAddTrafficRateAtPosition
  ]);
}
