/**
 * Context menu item builders for ReactFlowCanvas
 */
import type React from "react";
import type { Node, Edge, ReactFlowInstance } from "@xyflow/react";

import type { ContextMenuItem } from "../context-menu/ContextMenu";

import { applyLayout } from "./layout";

/** Annotation node type constants */
const FREE_TEXT_NODE_TYPE = "free-text-node";
const FREE_SHAPE_NODE_TYPE = "free-shape-node";

interface MenuBuilderContext {
  targetId: string;
  targetNodeType?: string;
  isEditMode: boolean;
  isLocked: boolean;
  closeContextMenu: () => void;
  editNode: (id: string) => void;
  handleDeleteNode: (id: string) => void;
  /** Node ID that link creation started from (if in link creation mode) */
  linkSourceNode?: string | null;
  /** Start link creation from this node */
  startLinkCreation?: (nodeId: string) => void;
  /** Cancel link creation mode */
  cancelLinkCreation?: () => void;
  /** Edit free text annotation */
  editFreeText?: (id: string) => void;
  /** Edit free shape annotation */
  editFreeShape?: (id: string) => void;
  /** Delete free text annotation */
  deleteFreeText?: (id: string) => void;
  /** Delete free shape annotation */
  deleteFreeShape?: (id: string) => void;
}

interface EdgeMenuBuilderContext {
  targetId: string;
  isEditMode: boolean;
  isLocked: boolean;
  closeContextMenu: () => void;
  editEdge: (id: string) => void;
  handleDeleteEdge: (id: string) => void;
}

interface PaneMenuBuilderContext {
  isEditMode: boolean;
  isLocked: boolean;
  closeContextMenu: () => void;
  reactFlowInstance: React.RefObject<ReactFlowInstance | null>;
  nodes: Node[];
  edges: Edge[];
  setNodes: (nodes: Node[]) => void;
}

/**
 * Build context menu for free text annotations
 */
function buildFreeTextContextMenu(ctx: MenuBuilderContext): ContextMenuItem[] {
  const { targetId, isEditMode, isLocked, closeContextMenu, editFreeText, deleteFreeText } = ctx;

  return [
    {
      id: "edit-text",
      label: "Edit Text",
      disabled: !isEditMode || isLocked,
      onClick: () => {
        editFreeText?.(targetId);
        closeContextMenu();
      }
    },
    { id: "divider-1", label: "", divider: true },
    {
      id: "delete-text",
      label: "Delete Text",
      disabled: !isEditMode || isLocked,
      onClick: () => {
        deleteFreeText?.(targetId);
        closeContextMenu();
      }
    }
  ];
}

/**
 * Build context menu for free shape annotations
 */
function buildFreeShapeContextMenu(ctx: MenuBuilderContext): ContextMenuItem[] {
  const { targetId, isEditMode, isLocked, closeContextMenu, editFreeShape, deleteFreeShape } = ctx;

  return [
    {
      id: "edit-shape",
      label: "Edit Shape",
      disabled: !isEditMode || isLocked,
      onClick: () => {
        editFreeShape?.(targetId);
        closeContextMenu();
      }
    },
    { id: "divider-1", label: "", divider: true },
    {
      id: "delete-shape",
      label: "Delete Shape",
      disabled: !isEditMode || isLocked,
      onClick: () => {
        deleteFreeShape?.(targetId);
        closeContextMenu();
      }
    }
  ];
}

/**
 * Build node context menu items
 */
export function buildNodeContextMenu(ctx: MenuBuilderContext): ContextMenuItem[] {
  const {
    targetId,
    targetNodeType,
    isEditMode,
    isLocked,
    closeContextMenu,
    editNode,
    handleDeleteNode,
    linkSourceNode,
    startLinkCreation,
    cancelLinkCreation
  } = ctx;

  // Handle annotation nodes with specific menus
  if (targetNodeType === FREE_TEXT_NODE_TYPE) {
    return buildFreeTextContextMenu(ctx);
  }
  if (targetNodeType === FREE_SHAPE_NODE_TYPE) {
    return buildFreeShapeContextMenu(ctx);
  }

  const items: ContextMenuItem[] = [];

  // If in link creation mode, show cancel option
  if (linkSourceNode) {
    items.push({
      id: "cancel-link",
      label: "Cancel Link Creation",
      onClick: () => {
        cancelLinkCreation?.();
        closeContextMenu();
      }
    });
    items.push({ id: "divider-link", label: "", divider: true });
  }

  items.push({
    id: "edit-node",
    label: "Edit Node",
    disabled: !isEditMode || isLocked,
    onClick: () => {
      editNode(targetId);
      closeContextMenu();
    }
  });

  // Show "Create Link" if not already in link creation mode
  if (!linkSourceNode) {
    items.push({
      id: "create-link",
      label: "Create Link",
      disabled: !isEditMode || isLocked,
      onClick: () => {
        startLinkCreation?.(targetId);
        closeContextMenu();
      }
    });
  }

  items.push({ id: "divider-1", label: "", divider: true });
  items.push({
    id: "delete-node",
    label: "Delete Node",
    disabled: !isEditMode || isLocked,
    onClick: () => handleDeleteNode(targetId)
  });

  return items;
}

/**
 * Build edge context menu items
 */
export function buildEdgeContextMenu(ctx: EdgeMenuBuilderContext): ContextMenuItem[] {
  const { targetId, isEditMode, isLocked, closeContextMenu, editEdge, handleDeleteEdge } = ctx;
  return [
    {
      id: "edit-edge",
      label: "Edit Link",
      disabled: !isEditMode || isLocked,
      onClick: () => {
        editEdge(targetId);
        closeContextMenu();
      }
    },
    { id: "divider-1", label: "", divider: true },
    {
      id: "delete-edge",
      label: "Delete Link",
      disabled: !isEditMode || isLocked,
      onClick: () => handleDeleteEdge(targetId)
    }
  ];
}

// Fit view options constant
const FIT_VIEW_OPTIONS = { padding: 0.2 };

/**
 * Build pane context menu items
 */
export function buildPaneContextMenu(ctx: PaneMenuBuilderContext): ContextMenuItem[] {
  const { isEditMode, isLocked, closeContextMenu, reactFlowInstance, nodes, edges, setNodes } = ctx;
  return [
    {
      id: "add-node",
      label: "Add Node (Shift+Click)",
      disabled: !isEditMode || isLocked,
      onClick: () => closeContextMenu()
    },
    { id: "divider-1", label: "", divider: true },
    {
      id: "fit-view",
      label: "Fit View",
      onClick: () => {
        void reactFlowInstance.current?.fitView(FIT_VIEW_OPTIONS);
        closeContextMenu();
      }
    },
    {
      id: "reset-layout",
      label: "Reset Layout",
      onClick: () => {
        const newNodes = applyLayout("force", nodes, edges);
        setNodes(newNodes);
        setTimeout(() => {
          void reactFlowInstance.current?.fitView(FIT_VIEW_OPTIONS);
        }, 100);
        closeContextMenu();
      }
    }
  ];
}
