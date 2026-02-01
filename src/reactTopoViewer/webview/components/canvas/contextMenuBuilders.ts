/**
 * Context menu item builders for ReactFlowCanvas
 */
import type React from "react";
import type { ReactFlowInstance } from "@xyflow/react";

import {
  FREE_TEXT_NODE_TYPE,
  FREE_SHAPE_NODE_TYPE,
  GROUP_NODE_TYPE
} from "../../annotations/annotationNodeConverters";
import { sendCommandToExtension } from "../../messaging/extensionMessaging";
import { getViewportCenter } from "../../utils/viewportUtils";
import type { ContextMenuItem } from "../context-menu/ContextMenu";

import type { ReactFlowCanvasProps } from "./types";

const ICON_PEN = "fas fa-pen";
const ICON_TRASH = "fas fa-trash";
const DIVIDER_ID = "divider-1";

interface MenuBuilderContext {
  targetId: string;
  targetNodeType?: string;
  isEditMode: boolean;
  isLocked: boolean;
  closeContextMenu: () => void;
  editNode: (id: string) => void;
  editNetwork?: (id: string) => void;
  handleDeleteNode: (id: string) => void;
  showNodeInfo?: (id: string) => void;
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
  /** Edit group annotation */
  editGroup?: (id: string) => void;
  /** Delete group annotation */
  deleteGroup?: (id: string) => void;
}

interface EdgeMenuBuilderContext {
  targetId: string;
  isEditMode: boolean;
  isLocked: boolean;
  closeContextMenu: () => void;
  editEdge: (id: string) => void;
  handleDeleteEdge: (id: string) => void;
  showLinkInfo?: (id: string) => void;
  showLinkImpairment?: (id: string) => void;
}

type PaneMenuActions = Pick<
  ReactFlowCanvasProps,
  | "onOpenNodePalette"
  | "onAddGroup"
  | "onAddText"
  | "onAddTextAtPosition"
  | "onAddShapes"
  | "onAddShapeAtPosition"
  | "onShowBulkLink"
>;

interface PaneMenuBuilderContext extends PaneMenuActions {
  isEditMode: boolean;
  isLocked: boolean;
  closeContextMenu: () => void;
  reactFlowInstance: React.RefObject<ReactFlowInstance | null>;
  /** Callback to add a default node at a position */
  onAddDefaultNode?: (position: { x: number; y: number }) => void;
  /** Context menu screen position for coordinate conversion */
  menuPosition?: { x: number; y: number };
}

/**
 * Build context menu for free text annotations
 */
function buildFreeTextContextMenu(ctx: MenuBuilderContext): ContextMenuItem[] {
  const { targetId, isLocked, closeContextMenu, editFreeText, deleteFreeText } = ctx;

  return [
    {
      id: "edit-text",
      label: "Edit Text",
      icon: ICON_PEN,
      disabled: isLocked,
      onClick: () => {
        editFreeText?.(targetId);
        closeContextMenu();
      }
    },
    { id: DIVIDER_ID, label: "", divider: true },
    {
      id: "delete-text",
      label: "Delete Text",
      icon: ICON_TRASH,
      disabled: isLocked,
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
  const { targetId, isLocked, closeContextMenu, editFreeShape, deleteFreeShape } = ctx;

  return [
    {
      id: "edit-shape",
      label: "Edit Shape",
      icon: ICON_PEN,
      disabled: isLocked,
      onClick: () => {
        editFreeShape?.(targetId);
        closeContextMenu();
      }
    },
    { id: DIVIDER_ID, label: "", divider: true },
    {
      id: "delete-shape",
      label: "Delete Shape",
      icon: ICON_TRASH,
      disabled: isLocked,
      onClick: () => {
        deleteFreeShape?.(targetId);
        closeContextMenu();
      }
    }
  ];
}

/**
 * Build context menu for group annotations
 */
function buildGroupContextMenu(ctx: MenuBuilderContext): ContextMenuItem[] {
  const { targetId, isLocked, closeContextMenu, editGroup, deleteGroup } = ctx;

  return [
    {
      id: "edit-group",
      label: "Edit Group",
      icon: ICON_PEN,
      disabled: isLocked,
      onClick: () => {
        editGroup?.(targetId);
        closeContextMenu();
      }
    },
    { id: DIVIDER_ID, label: "", divider: true },
    {
      id: "delete-group",
      label: "Delete Group",
      icon: ICON_TRASH,
      disabled: isLocked,
      onClick: () => {
        deleteGroup?.(targetId);
        closeContextMenu();
      }
    }
  ];
}

function buildNodeViewContextMenu(ctx: MenuBuilderContext): ContextMenuItem[] {
  const { targetId, closeContextMenu, showNodeInfo } = ctx;
  return [
    {
      id: "ssh-node",
      label: "SSH",
      icon: "fas fa-terminal",
      onClick: () => {
        sendCommandToExtension("clab-node-connect-ssh", { nodeName: targetId });
        closeContextMenu();
      }
    },
    {
      id: "shell-node",
      label: "Shell",
      icon: "fas fa-terminal",
      onClick: () => {
        sendCommandToExtension("clab-node-attach-shell", { nodeName: targetId });
        closeContextMenu();
      }
    },
    {
      id: "logs-node",
      label: "Logs",
      icon: "fas fa-clipboard-list",
      onClick: () => {
        sendCommandToExtension("clab-node-view-logs", { nodeName: targetId });
        closeContextMenu();
      }
    },
    { id: DIVIDER_ID, label: "", divider: true },
    {
      id: "info-node",
      label: "Info",
      icon: "fas fa-circle-info",
      onClick: () => {
        showNodeInfo?.(targetId);
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
    editNetwork,
    handleDeleteNode,
    linkSourceNode,
    startLinkCreation,
    cancelLinkCreation
  } = ctx;

  if (isEditMode && isLocked) {
    return [];
  }

  // Handle annotation nodes with specific menus
  if (targetNodeType === FREE_TEXT_NODE_TYPE) {
    return buildFreeTextContextMenu(ctx);
  }
  if (targetNodeType === FREE_SHAPE_NODE_TYPE) {
    return buildFreeShapeContextMenu(ctx);
  }
  if (targetNodeType === GROUP_NODE_TYPE) {
    return buildGroupContextMenu(ctx);
  }

  if (!isEditMode) {
    return buildNodeViewContextMenu(ctx);
  }

  const items: ContextMenuItem[] = [];
  const isNetworkNode = targetNodeType === "network-node";

  // If in link creation mode, show cancel option
  if (linkSourceNode) {
    items.push({
      id: "cancel-link",
      label: "Cancel Link Creation",
      icon: "fas fa-xmark",
      onClick: () => {
        cancelLinkCreation?.();
        closeContextMenu();
      }
    });
    items.push({ id: "divider-link", label: "", divider: true });
  }

  items.push({
    id: "edit-node",
    label: isNetworkNode ? "Edit NetworkNode" : "Edit Node",
    icon: isNetworkNode ? "fas fa-network-wired" : ICON_PEN,
    disabled: !isEditMode || isLocked,
    onClick: () => {
      if (isNetworkNode) {
        editNetwork?.(targetId);
        closeContextMenu();
        return;
      }
      editNode(targetId);
      closeContextMenu();
    }
  });

  // Show "Create Link" if not already in link creation mode
  if (!linkSourceNode) {
    items.push({
      id: "create-link",
      label: "Create Link",
      icon: "fas fa-link",
      disabled: !isEditMode || isLocked,
      onClick: () => {
        startLinkCreation?.(targetId);
        closeContextMenu();
      }
    });
  }

  items.push({ id: DIVIDER_ID, label: "", divider: true });
  items.push({
    id: "delete-node",
    label: "Delete Node",
    icon: ICON_TRASH,
    disabled: !isEditMode || isLocked,
    onClick: () => handleDeleteNode(targetId)
  });

  return items;
}

/**
 * Build edge context menu items
 */
export function buildEdgeContextMenu(ctx: EdgeMenuBuilderContext): ContextMenuItem[] {
  const {
    targetId,
    isEditMode,
    isLocked,
    closeContextMenu,
    editEdge,
    handleDeleteEdge,
    showLinkInfo,
    showLinkImpairment
  } = ctx;
  const impairmentItem: ContextMenuItem = {
    id: "impair-edge",
    label: "Link impairments",
    icon: "fas fa-sliders",
    onClick: () => {
      showLinkImpairment?.(targetId);
      closeContextMenu();
    }
  };
  if (!isEditMode) {
    return [
      impairmentItem,
      {
        id: "info-edge",
        label: "Link Info",
        icon: "fas fa-circle-info",
        onClick: () => {
          showLinkInfo?.(targetId);
          closeContextMenu();
        }
      }
    ];
  }
  if (isLocked) {
    return [impairmentItem];
  }
  return [
    {
      id: "edit-edge",
      label: "Edit Link",
      icon: ICON_PEN,
      disabled: !isEditMode || isLocked,
      onClick: () => {
        editEdge(targetId);
        closeContextMenu();
      }
    },
    impairmentItem,
    { id: DIVIDER_ID, label: "", divider: true },
    {
      id: "delete-edge",
      label: "Delete Link",
      icon: ICON_TRASH,
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
  const {
    isEditMode,
    isLocked,
    closeContextMenu,
    reactFlowInstance,
    onOpenNodePalette,
    onAddDefaultNode,
    onAddGroup,
    onAddText,
    onAddTextAtPosition,
    onAddShapes,
    onAddShapeAtPosition,
    onShowBulkLink,
    menuPosition
  } = ctx;
  const items: ContextMenuItem[] = [
    {
      id: "add-node",
      label: "Add Node",
      icon: "fas fa-plus",
      disabled: !isEditMode || isLocked,
      onClick: () => {
        if (onAddDefaultNode && menuPosition && reactFlowInstance.current) {
          const flowPosition = reactFlowInstance.current.screenToFlowPosition(menuPosition);
          onAddDefaultNode(flowPosition);
        }
        closeContextMenu();
      }
    },
    {
      id: "open-node-palette",
      label: "Open Palette",
      icon: "fas fa-th",
      disabled: !isEditMode || isLocked,
      onClick: () => {
        onOpenNodePalette?.();
        closeContextMenu();
      }
    }
  ];

  const editorItems: ContextMenuItem[] = [];
  const isDisabled = !isEditMode || isLocked;

  if (onAddGroup) {
    editorItems.push({
      id: "add-group",
      label: "Add Group",
      icon: "fas fa-layer-group",
      disabled: isDisabled,
      onClick: () => {
        onAddGroup();
        closeContextMenu();
      }
    });
  }
  if (onAddText || onAddTextAtPosition) {
    editorItems.push({
      id: "add-text",
      label: "Add Text",
      icon: "fas fa-font",
      disabled: isDisabled,
      onClick: () => {
        const flowPosition = getFlowPosition();
        if (onAddTextAtPosition && flowPosition) {
          onAddTextAtPosition(flowPosition);
        } else {
          onAddText?.();
        }
        closeContextMenu();
      }
    });
  }
  const getFlowPosition = () => {
    const instance = reactFlowInstance.current;
    if (!instance) return null;
    if (menuPosition) {
      return instance.screenToFlowPosition(menuPosition);
    }
    return getViewportCenter(instance);
  };

  if (onAddShapes || onAddShapeAtPosition) {
    editorItems.push({
      id: "add-shape",
      label: "Add Shape",
      icon: "fas fa-shapes",
      disabled: isDisabled,
      children: [
        {
          id: "add-shape-rectangle",
          label: "Rectangle",
          icon: "fas fa-square",
          disabled: isDisabled,
          onClick: () => {
            const flowPosition = getFlowPosition();
            if (onAddShapeAtPosition && flowPosition) {
              onAddShapeAtPosition(flowPosition, "rectangle");
            } else {
              onAddShapes?.("rectangle");
            }
            closeContextMenu();
          }
        },
        {
          id: "add-shape-circle",
          label: "Circle",
          icon: "fas fa-circle",
          disabled: isDisabled,
          onClick: () => {
            const flowPosition = getFlowPosition();
            if (onAddShapeAtPosition && flowPosition) {
              onAddShapeAtPosition(flowPosition, "circle");
            } else {
              onAddShapes?.("circle");
            }
            closeContextMenu();
          }
        },
        {
          id: "add-shape-line",
          label: "Line",
          icon: "fas fa-minus",
          disabled: isDisabled,
          onClick: () => {
            const flowPosition = getFlowPosition();
            if (onAddShapeAtPosition && flowPosition) {
              onAddShapeAtPosition(flowPosition, "line");
            } else {
              onAddShapes?.("line");
            }
            closeContextMenu();
          }
        }
      ]
    });
  }
  if (onShowBulkLink) {
    editorItems.push({
      id: "bulk-link",
      label: "Bulk Link Devices",
      icon: "fas fa-link",
      disabled: isDisabled,
      onClick: () => {
        onShowBulkLink();
        closeContextMenu();
      }
    });
  }

  if (editorItems.length > 0) {
    items.push({ id: "divider-additions", label: "", divider: true }, ...editorItems);
  }

  items.push(
    { id: DIVIDER_ID, label: "", divider: true },
    {
      id: "fit-view",
      label: "Fit View",
      icon: "fas fa-expand",
      onClick: () => {
        reactFlowInstance.current?.fitView(FIT_VIEW_OPTIONS).catch(() => {
          /* ignore */
        });
        closeContextMenu();
      }
    }
  );

  return items;
}
