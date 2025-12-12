/**
 * Context menu item builders for ReactFlowCanvas
 */
import type React from 'react';
import type { Node, Edge, ReactFlowInstance } from '@xyflow/react';
import type { ContextMenuItem } from '../context-menu/ContextMenu';
import { sendCommandToExtension } from '../../utils/extensionMessaging';
import { applyLayout } from './layout';

interface MenuBuilderContext {
  targetId: string;
  isEditMode: boolean;
  isLocked: boolean;
  closeContextMenu: () => void;
  editNode: (id: string) => void;
  handleDeleteNode: (id: string) => void;
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
  const { targetId, isEditMode, isLocked, closeContextMenu, editNode, handleDeleteNode } = ctx;
  return [
    {
      id: 'edit-node',
      label: 'Edit Node',
      disabled: !isEditMode || isLocked,
      onClick: () => {
        editNode(targetId);
        closeContextMenu();
      }
    },
    {
      id: 'show-properties',
      label: 'Properties',
      onClick: () => {
        sendCommandToExtension('panel-node-info', { nodeId: targetId });
        closeContextMenu();
      }
    },
    { id: 'divider-1', label: '', divider: true },
    {
      id: 'delete-node',
      label: 'Delete Node',
      disabled: !isEditMode || isLocked,
      onClick: () => handleDeleteNode(targetId)
    }
  ];
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
    {
      id: 'show-properties',
      label: 'Properties',
      onClick: () => {
        sendCommandToExtension('panel-link-info', { edgeId: targetId });
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
