import { useMemo, type RefObject } from "react";
import type { Node } from "@xyflow/react";

import type { useCanvasHandlers } from "../../hooks/canvas";
import type { ContextMenuItem } from "../context-menu/ContextMenu";

import { buildEdgeContextMenu, buildNodeContextMenu, buildPaneContextMenu } from "./contextMenuBuilders";
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
  linkSourceNode: string | null;
  startLinkCreation: (nodeId: string) => void;
  cancelLinkCreation: () => void;
  annotationHandlers?: AnnotationHandlers;
  onOpenNodePalette?: () => void;
  onAddDefaultNode?: (position: { x: number; y: number }) => void;
  onAddGroup?: () => void;
  onAddText?: () => void;
  onAddShapes?: (shapeType?: string) => void;
  onAddShapeAtPosition?: (position: { x: number; y: number }, shapeType?: string) => void;
  onShowBulkLink?: () => void;
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
    linkSourceNode,
    startLinkCreation,
    cancelLinkCreation,
    annotationHandlers,
    onOpenNodePalette,
    onAddDefaultNode,
    onAddGroup,
    onAddText,
    onAddShapes,
    onAddShapeAtPosition,
    onShowBulkLink
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
        menuPosition,
        onAddGroup,
        onAddText,
        onAddShapes,
        onAddShapeAtPosition,
        onShowBulkLink
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
    linkSourceNode,
    startLinkCreation,
    cancelLinkCreation,
    annotationHandlers,
    onOpenNodePalette,
    onAddDefaultNode,
    onAddGroup,
    onAddText,
    onAddShapes,
    onAddShapeAtPosition,
    onShowBulkLink
  ]);
}
