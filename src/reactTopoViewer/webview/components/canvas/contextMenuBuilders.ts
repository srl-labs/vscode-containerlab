// Context menu item builders for ReactFlowCanvas.
import React from "react";
import type { ReactFlowInstance } from "@xyflow/react";
import {
  Add as AddIcon,
  Article as ArticleIcon,
  Category as CategoryIcon,
  CircleOutlined as CircleOutlinedIcon,
  Close as CloseIcon,
  CropSquare as CropSquareIcon,
  Dashboard as DashboardIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Info as InfoIcon,
  Lan as LanIcon,
  Layers as LayersIcon,
  Link as LinkIcon,
  Remove as RemoveIcon,
  Speed as SpeedIcon,
  Terminal as TerminalIcon,
  TextFields as TextFieldsIcon,
  Tune as TuneIcon,
} from "@mui/icons-material";

import type { ContextMenuItem } from "../context-menu/ContextMenu";
import { WiresharkIcon } from "../context-menu/WiresharkIcon";
import { getViewportCenter } from "../../utils/viewportUtils";
import { sendCommandToExtension } from "../../messaging/extensionMessaging";
import {
  FREE_TEXT_NODE_TYPE,
  FREE_SHAPE_NODE_TYPE,
  TRAFFIC_RATE_NODE_TYPE,
  GROUP_NODE_TYPE,
} from "../../annotations/annotationNodeConverters";

import type { ReactFlowCanvasProps } from "./types";

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
  /** Edit traffic-rate annotation */
  editTrafficRate?: (id: string) => void;
  /** Delete traffic-rate annotation */
  deleteTrafficRate?: (id: string) => void;
}

interface EdgeMenuBuilderContext {
  targetId: string;
  sourceNode?: string;
  targetNode?: string;
  sourceEndpoint?: string;
  targetEndpoint?: string;
  extraData?: Record<string, unknown>;
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
  | "onAddTrafficRateAtPosition"
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

function isNonEmptyString(value: string | undefined | null): value is string {
  return typeof value === "string" && value.length > 0;
}

function getExtraDataString(
  extraData: Record<string, unknown> | undefined,
  key: string
): string | undefined {
  if (extraData === undefined) return undefined;
  const value = extraData[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Build context menu for free text annotations
 */
function buildFreeTextContextMenu(ctx: MenuBuilderContext): ContextMenuItem[] {
  const { targetId, isLocked, closeContextMenu, editFreeText, deleteFreeText } = ctx;

  const items: ContextMenuItem[] = [
    {
      id: "edit-text",
      label: "Edit Text",
      icon: React.createElement(EditIcon, { fontSize: "small" }),
      disabled: isLocked,
      onClick: () => {
        editFreeText?.(targetId);
        closeContextMenu();
      },
    },
  ];
  if (!isLocked) {
    items.push(
      { id: DIVIDER_ID, label: "", divider: true },
      {
        id: "delete-text",
        label: "Delete Text",
        icon: React.createElement(DeleteIcon, { fontSize: "small" }),
        disabled: isLocked,
        danger: true,
        onClick: () => {
          deleteFreeText?.(targetId);
          closeContextMenu();
        },
      }
    );
  }
  return items;
}

/**
 * Build context menu for free shape annotations
 */
function buildFreeShapeContextMenu(ctx: MenuBuilderContext): ContextMenuItem[] {
  const { targetId, isLocked, closeContextMenu, editFreeShape, deleteFreeShape } = ctx;

  const items: ContextMenuItem[] = [
    {
      id: "edit-shape",
      label: "Edit Shape",
      icon: React.createElement(EditIcon, { fontSize: "small" }),
      disabled: isLocked,
      onClick: () => {
        editFreeShape?.(targetId);
        closeContextMenu();
      },
    },
  ];
  if (!isLocked) {
    items.push(
      { id: DIVIDER_ID, label: "", divider: true },
      {
        id: "delete-shape",
        label: "Delete Shape",
        icon: React.createElement(DeleteIcon, { fontSize: "small" }),
        disabled: isLocked,
        danger: true,
        onClick: () => {
          deleteFreeShape?.(targetId);
          closeContextMenu();
        },
      }
    );
  }
  return items;
}

/**
 * Build context menu for group annotations
 */
function buildGroupContextMenu(ctx: MenuBuilderContext): ContextMenuItem[] {
  const { targetId, isLocked, closeContextMenu, editGroup, deleteGroup } = ctx;

  const items: ContextMenuItem[] = [
    {
      id: "edit-group",
      label: "Edit Group",
      icon: React.createElement(EditIcon, { fontSize: "small" }),
      disabled: isLocked,
      onClick: () => {
        editGroup?.(targetId);
        closeContextMenu();
      },
    },
  ];
  if (!isLocked) {
    items.push(
      { id: DIVIDER_ID, label: "", divider: true },
      {
        id: "delete-group",
        label: "Delete Group",
        icon: React.createElement(DeleteIcon, { fontSize: "small" }),
        disabled: isLocked,
        danger: true,
        onClick: () => {
          deleteGroup?.(targetId);
          closeContextMenu();
        },
      }
    );
  }
  return items;
}

/**
 * Build context menu for traffic-rate annotations
 */
function buildTrafficRateContextMenu(ctx: MenuBuilderContext): ContextMenuItem[] {
  const { targetId, isLocked, closeContextMenu, editTrafficRate, deleteTrafficRate } = ctx;

  const items: ContextMenuItem[] = [
    {
      id: "edit-traffic-rate",
      label: "Edit Traffic Rate",
      icon: React.createElement(EditIcon, { fontSize: "small" }),
      disabled: isLocked,
      onClick: () => {
        editTrafficRate?.(targetId);
        closeContextMenu();
      },
    },
  ];

  if (!isLocked) {
    items.push(
      { id: DIVIDER_ID, label: "", divider: true },
      {
        id: "delete-traffic-rate",
        label: "Delete Traffic Rate",
        icon: React.createElement(DeleteIcon, { fontSize: "small" }),
        disabled: isLocked,
        danger: true,
        onClick: () => {
          deleteTrafficRate?.(targetId);
          closeContextMenu();
        },
      }
    );
  }

  return items;
}

function buildNodeViewContextMenu(ctx: MenuBuilderContext): ContextMenuItem[] {
  const { targetId, closeContextMenu, showNodeInfo } = ctx;
  return [
    {
      id: "ssh-node",
      label: "SSH",
      icon: React.createElement(TerminalIcon, { fontSize: "small" }),
      onClick: () => {
        sendCommandToExtension("clab-node-connect-ssh", { nodeName: targetId });
        closeContextMenu();
      },
    },
    {
      id: "shell-node",
      label: "Shell",
      icon: React.createElement(TerminalIcon, { fontSize: "small" }),
      onClick: () => {
        sendCommandToExtension("clab-node-attach-shell", { nodeName: targetId });
        closeContextMenu();
      },
    },
    {
      id: "logs-node",
      label: "Logs",
      icon: React.createElement(ArticleIcon, { fontSize: "small" }),
      onClick: () => {
        sendCommandToExtension("clab-node-view-logs", { nodeName: targetId });
        closeContextMenu();
      },
    },
    { id: DIVIDER_ID, label: "", divider: true },
    {
      id: "info-node",
      label: "Info",
      icon: React.createElement(InfoIcon, { fontSize: "small" }),
      onClick: () => {
        showNodeInfo?.(targetId);
        closeContextMenu();
      },
    },
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
    cancelLinkCreation,
  } = ctx;

  // Handle annotation nodes with specific menus
  if (targetNodeType === FREE_TEXT_NODE_TYPE) {
    return buildFreeTextContextMenu(ctx);
  }
  if (targetNodeType === FREE_SHAPE_NODE_TYPE) {
    return buildFreeShapeContextMenu(ctx);
  }
  if (targetNodeType === TRAFFIC_RATE_NODE_TYPE) {
    return buildTrafficRateContextMenu(ctx);
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
  if (isNonEmptyString(linkSourceNode)) {
    items.push({
      id: "cancel-link",
      label: "Cancel Link Creation",
      icon: React.createElement(CloseIcon, { fontSize: "small" }),
      onClick: () => {
        cancelLinkCreation?.();
        closeContextMenu();
      },
    });
    items.push({ id: "divider-link", label: "", divider: true });
  }

  // Show "Create Link" if not already in link creation mode
  if (!isNonEmptyString(linkSourceNode)) {
    items.push({
      id: "create-link",
      label: "Create Link",
      icon: React.createElement(LinkIcon, { fontSize: "small" }),
      disabled: isLocked,
      onClick: () => {
        startLinkCreation?.(targetId);
        closeContextMenu();
      },
    });
  }

  items.push({ id: "divider-edit", label: "", divider: true });
  items.push({
    id: "edit-node",
    label: isNetworkNode ? "Edit Network" : "Edit Node",
    icon: isNetworkNode
      ? React.createElement(LanIcon, { fontSize: "small" })
      : React.createElement(EditIcon, { fontSize: "small" }),
    disabled: isLocked,
    onClick: () => {
      if (isNetworkNode) {
        editNetwork?.(targetId);
        closeContextMenu();
        return;
      }
      editNode(targetId);
      closeContextMenu();
    },
  });

  items.push({ id: DIVIDER_ID, label: "", divider: true });
  items.push({
    id: "delete-node",
    label: "Delete Node",
    icon: React.createElement(DeleteIcon, { fontSize: "small" }),
    disabled: isLocked,
    danger: true,
    onClick: () => handleDeleteNode(targetId),
  });

  return items;
}

/**
 * Build edge context menu items
 */
export function buildEdgeContextMenu(ctx: EdgeMenuBuilderContext): ContextMenuItem[] {
  const {
    targetId,
    sourceNode,
    targetNode,
    sourceEndpoint,
    targetEndpoint,
    extraData,
    isEditMode,
    isLocked,
    closeContextMenu,
    editEdge,
    handleDeleteEdge,
    showLinkInfo,
    showLinkImpairment,
  } = ctx;

  // Build capture items for each endpoint
  const captureItems: ContextMenuItem[] = [];
  const srcName = getExtraDataString(extraData, "clabSourceLongName") ?? sourceNode;
  const dstName = getExtraDataString(extraData, "clabTargetLongName") ?? targetNode;
  if (isNonEmptyString(srcName) && isNonEmptyString(sourceEndpoint)) {
    captureItems.push({
      id: "capture-source",
      label: `${srcName} - ${sourceEndpoint}`,
      icon: React.createElement(WiresharkIcon, { fontSize: "small" }),
      onClick: () => {
        sendCommandToExtension("clab-interface-capture", {
          nodeName: srcName,
          interfaceName: sourceEndpoint,
        });
        closeContextMenu();
      },
    });
  }
  if (isNonEmptyString(dstName) && isNonEmptyString(targetEndpoint)) {
    captureItems.push({
      id: "capture-target",
      label: `${dstName} - ${targetEndpoint}`,
      icon: React.createElement(WiresharkIcon, { fontSize: "small" }),
      onClick: () => {
        sendCommandToExtension("clab-interface-capture", {
          nodeName: dstName,
          interfaceName: targetEndpoint,
        });
        closeContextMenu();
      },
    });
  }

  const impairmentItem: ContextMenuItem = {
    id: "impair-edge",
    label: "Link Impairments",
    icon: React.createElement(TuneIcon, { fontSize: "small" }),
    onClick: () => {
      showLinkImpairment?.(targetId);
      closeContextMenu();
    },
  };
  const linkInfoItem: ContextMenuItem = {
    id: "info-edge",
    label: "Info",
    icon: React.createElement(InfoIcon, { fontSize: "small" }),
    onClick: () => {
      showLinkInfo?.(targetId);
      closeContextMenu();
    },
  };
  if (!isEditMode) {
    return [
      ...captureItems,
      ...(captureItems.length > 0 ? [{ id: "divider-capture", label: "", divider: true }] : []),
      impairmentItem,
      { id: "divider-info", label: "", divider: true },
      linkInfoItem,
    ];
  }
  return [
    {
      id: "edit-edge",
      label: "Edit Link",
      icon: React.createElement(EditIcon, { fontSize: "small" }),
      disabled: isLocked,
      onClick: () => {
        editEdge(targetId);
        closeContextMenu();
      },
    },
    { id: DIVIDER_ID, label: "", divider: true },
    {
      id: "delete-edge",
      label: "Delete Link",
      icon: React.createElement(DeleteIcon, { fontSize: "small" }),
      disabled: isLocked,
      danger: true,
      onClick: () => handleDeleteEdge(targetId),
    },
  ];
}

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
    onAddTrafficRateAtPosition,
    menuPosition,
  } = ctx;
  const items: ContextMenuItem[] = [];

  // Add Node is only available in edit mode (not when deployed)
  if (isEditMode) {
    items.push(
      {
        id: "add-node",
        label: "Add Node",
        icon: React.createElement(AddIcon, { fontSize: "small" }),
        disabled: isLocked,
        onClick: () => {
          if (onAddDefaultNode && menuPosition && reactFlowInstance.current) {
            const flowPosition = reactFlowInstance.current.screenToFlowPosition(menuPosition);
            onAddDefaultNode(flowPosition);
          }
          closeContextMenu();
        },
      },
      { id: "divider-additions", label: "", divider: true }
    );
  }

  const editorItems: ContextMenuItem[] = [];

  const getFlowPosition = () => {
    const instance = reactFlowInstance.current;
    if (!instance) return null;
    if (menuPosition) {
      return instance.screenToFlowPosition(menuPosition);
    }
    return getViewportCenter(instance);
  };

  if (onAddGroup) {
    editorItems.push({
      id: "add-group",
      label: "Add Group",
      icon: React.createElement(LayersIcon, { fontSize: "small" }),
      disabled: isLocked,
      onClick: () => {
        onAddGroup();
        closeContextMenu();
      },
    });
  }
  if (onAddText || onAddTextAtPosition) {
    editorItems.push({
      id: "add-text",
      label: "Add Text",
      icon: React.createElement(TextFieldsIcon, { fontSize: "small" }),
      disabled: isLocked,
      onClick: () => {
        const flowPosition = getFlowPosition();
        if (onAddTextAtPosition && flowPosition) {
          onAddTextAtPosition(flowPosition);
        } else {
          onAddText?.();
        }
        closeContextMenu();
      },
    });
  }

  if (onAddShapes || onAddShapeAtPosition) {
    editorItems.push({
      id: "add-shape",
      label: "Add Shape",
      icon: React.createElement(CategoryIcon, { fontSize: "small" }),
      disabled: isLocked,
      children: [
        {
          id: "add-shape-rectangle",
          label: "Rectangle",
          icon: React.createElement(CropSquareIcon, { fontSize: "small" }),
          disabled: isLocked,
          onClick: () => {
            const flowPosition = getFlowPosition();
            if (onAddShapeAtPosition && flowPosition) {
              onAddShapeAtPosition(flowPosition, "rectangle");
            } else {
              onAddShapes?.("rectangle");
            }
            closeContextMenu();
          },
        },
        {
          id: "add-shape-circle",
          label: "Circle",
          icon: React.createElement(CircleOutlinedIcon, { fontSize: "small" }),
          disabled: isLocked,
          onClick: () => {
            const flowPosition = getFlowPosition();
            if (onAddShapeAtPosition && flowPosition) {
              onAddShapeAtPosition(flowPosition, "circle");
            } else {
              onAddShapes?.("circle");
            }
            closeContextMenu();
          },
        },
        {
          id: "add-shape-line",
          label: "Line",
          icon: React.createElement(RemoveIcon, { fontSize: "small" }),
          disabled: isLocked,
          onClick: () => {
            const flowPosition = getFlowPosition();
            if (onAddShapeAtPosition && flowPosition) {
              onAddShapeAtPosition(flowPosition, "line");
            } else {
              onAddShapes?.("line");
            }
            closeContextMenu();
          },
        },
      ],
    });
  }
  if (onAddTrafficRateAtPosition) {
    editorItems.push({
      id: "add-traffic-rate",
      label: "Add Traffic Rate",
      icon: React.createElement(SpeedIcon, { fontSize: "small" }),
      disabled: isLocked,
      onClick: () => {
        const flowPosition = getFlowPosition();
        if (flowPosition) {
          onAddTrafficRateAtPosition(flowPosition);
        }
        closeContextMenu();
      },
    });
  }
  if (editorItems.length > 0) {
    items.push(...editorItems);
  }

  const paletteItem: ContextMenuItem = {
    id: "open-node-palette",
    label: "Open Palette",
    icon: React.createElement(DashboardIcon, { fontSize: "small" }),
    onClick: () => {
      onOpenNodePalette?.();
      closeContextMenu();
    },
  };
  if (items.length > 0) {
    items.push({ id: "divider-palette", label: "", divider: true });
  }
  items.push(paletteItem);

  return items;
}
