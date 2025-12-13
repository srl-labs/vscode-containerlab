/**
 * Context menu item builders for ReactFlowCanvas
 */
import type React from 'react';
import type { Node, Edge, ReactFlowInstance } from '@xyflow/react';
import type { ContextMenuItem } from '../context-menu/ContextMenu';
import { applyLayout } from './layout';

interface MenuBuilderContext {
  targetId: string;
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
 * Build node context menu items
 */
export function buildNodeContextMenu(ctx: MenuBuilderContext): ContextMenuItem[] {
  const {
    targetId, isEditMode, isLocked, closeContextMenu, editNode, handleDeleteNode,
    linkSourceNode, startLinkCreation, cancelLinkCreation
  } = ctx;

  const items: ContextMenuItem[] = [];

  // If in link creation mode, show cancel option
  if (linkSourceNode) {
    items.push({
      id: 'cancel-link',
      label: 'Cancel Link Creation',
      onClick: () => {
        cancelLinkCreation?.();
        closeContextMenu();
      }
    });
    items.push({ id: 'divider-link', label: '', divider: true });
  }

  items.push({
    id: 'edit-node',
    label: 'Edit Node',
    disabled: !isEditMode || isLocked,
    onClick: () => {
      editNode(targetId);
      closeContextMenu();
    }
  });

  // Show "Create Link" if not already in link creation mode
  if (!linkSourceNode) {
    items.push({
      id: 'create-link',
      label: 'Create Link',
      disabled: !isEditMode || isLocked,
      onClick: () => {
        startLinkCreation?.(targetId);
        closeContextMenu();
      }
    });
  }

  items.push({ id: 'divider-1', label: '', divider: true });
  items.push({
    id: 'delete-node',
    label: 'Delete Node',
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
      id: 'edit-edge',
      label: 'Edit Link',
      disabled: !isEditMode || isLocked,
      onClick: () => {
        editEdge(targetId);
        closeContextMenu();
      }
    },
    { id: 'divider-1', label: '', divider: true },
    {
      id: 'delete-edge',
      label: 'Delete Link',
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
      id: 'add-node',
      label: 'Add Node (Shift+Click)',
      disabled: !isEditMode || isLocked,
      onClick: () => closeContextMenu()
    },
    { id: 'divider-1', label: '', divider: true },
    {
      id: 'fit-view',
      label: 'Fit View',
      onClick: () => {
        reactFlowInstance.current?.fitView(FIT_VIEW_OPTIONS);
        closeContextMenu();
      }
    },
    {
      id: 'reset-layout',
      label: 'Reset Layout',
      onClick: () => {
        const newNodes = applyLayout('force', nodes, edges);
        setNodes(newNodes);
        setTimeout(() => {
          reactFlowInstance.current?.fitView(FIT_VIEW_OPTIONS);
        }, 100);
        closeContextMenu();
      }
    }
  ];
}
