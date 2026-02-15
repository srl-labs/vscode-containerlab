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
    onAddShapeAtPosition
  } = params;
  const { type, targetId, position: menuPosition } = handlers.contextMenu;

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
      const targetEdge = edges.find((e) => e.id === targetId);
      const edgeData = targetEdge?.data as
        | { sourceEndpoint?: string; targetEndpoint?: string; extraData?: Record<string, unknown> }
        | undefined;
      return buildEdgeContextMenu({
        targetId,
        sourceNode: targetEdge?.source,
        targetNode: targetEdge?.target,
        sourceEndpoint: edgeData?.sourceEndpoint,
        targetEndpoint: edgeData?.targetEndpoint,
        extraData: edgeData?.extraData,
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
        menuPosition,
        onAddGroup,
        onAddText,
        onAddTextAtPosition,
        onAddShapes,
        onAddShapeAtPosition
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
    onAddShapeAtPosition
  ]);
}
