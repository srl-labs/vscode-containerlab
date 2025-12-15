/**
 * Context Menu Hook for Cytoscape Elements
 * Manages context menu state for nodes and edges using React-based menu
 */
import { useEffect, useCallback, useState } from 'react';
import type { Core, EventObject } from 'cytoscape';
import React from 'react';
import { log } from '../../utils/logger';
import { ContextMenuItem } from '../../components/context-menu/ContextMenu';
import { WiresharkIcon } from '../../components/context-menu/WiresharkIcon';

/**
 * VS Code API interface
 */
declare const vscode: {
  postMessage: (msg: unknown) => void;
};

/**
 * Context menu options
 */
export interface ContextMenuOptions {
  mode: 'edit' | 'view';
  isLocked: boolean;
  onEditNode?: (nodeId: string) => void;
  onEditNetwork?: (nodeId: string) => void;
  onDeleteNode?: (nodeId: string) => void;
  onCreateLinkFromNode?: (nodeId: string) => void;
  onEditLink?: (edgeId: string) => void;
  onDeleteLink?: (edgeId: string) => void;
  onShowNodeProperties?: (nodeId: string) => void;
  onShowLinkProperties?: (edgeId: string) => void;
}

/** Context menu state */
export interface ContextMenuState {
  isVisible: boolean;
  position: { x: number; y: number };
  elementId: string | null;
  elementType: 'node' | 'edge' | null;
}

/** Initial context menu state */
const INITIAL_STATE: ContextMenuState = {
  isVisible: false,
  position: { x: 0, y: 0 },
  elementId: null,
  elementType: null
};

// Scratch key for context menu state (must match events.ts)
const CONTEXT_MENU_SCRATCH_KEY = '_isContextMenuActive';

// Icon constants for context menu items
const ICON_EDIT = 'fas fa-pen';
const ICON_DELETE = 'fas fa-trash';
const ICON_LINK = 'fas fa-link';

/**
 * Extract capture endpoints from edge data (similar to legacy ContextMenuManager)
 */
function computeEdgeCaptureEndpoints(edgeData: Record<string, unknown>): {
  srcNode: string;
  srcIf: string;
  dstNode: string;
  dstIf: string;
} {
  const extraData = (edgeData.extraData || {}) as Record<string, unknown>;
  const srcNode = (extraData.clabSourceLongName as string) || (edgeData.source as string) || '';
  const dstNode = (extraData.clabTargetLongName as string) || (edgeData.target as string) || '';
  const srcIf = (edgeData.sourceEndpoint as string) || '';
  const dstIf = (edgeData.targetEndpoint as string) || '';
  return { srcNode, srcIf, dstNode, dstIf };
}

/**
 * Send message to VS Code extension
 */
function sendToExtension(command: string, data: Record<string, unknown>): void {
  if (typeof vscode !== 'undefined') {
    vscode.postMessage({ command, ...data });
    log.info(`[ContextMenu] Sent command: ${command}`);
  }
}

/**
 * Check if a node is a network node (cloud/special endpoint or bridge)
 * - 'cloud': special endpoints created via UI or loaded from YAML (host, mgmt-net, vxlan, etc.)
 * - 'bridge': bridge nodes loaded from YAML via AliasNodeHandler
 */
function isNetworkNode(nodeData: Record<string, unknown>): boolean {
  const role = nodeData.topoViewerRole;
  return role === 'cloud' || role === 'bridge';
}

/**
 * Build menu items for node in edit mode
 */
function buildNodeEditMenuItems(
  nodeId: string,
  nodeData: Record<string, unknown>,
  options: ContextMenuOptions
): ContextMenuItem[] {
  if (options.isLocked) return [];

  // Network nodes get a different menu with "Edit Network" instead of "Edit"
  if (isNetworkNode(nodeData)) {
    return [
      {
        id: 'edit-network',
        label: 'Edit Network',
        icon: ICON_EDIT,
        onClick: () => {
          log.info(`[ContextMenu] Edit network: ${nodeId}`);
          options.onEditNetwork?.(nodeId);
        }
      },
      {
        id: 'delete-node',
        label: 'Delete',
        icon: ICON_DELETE,
        onClick: () => {
          log.info(`[ContextMenu] Delete network node: ${nodeId}`);
          options.onDeleteNode?.(nodeId);
        }
      },
      {
        id: 'link-node',
        label: 'Create Link',
        icon: ICON_LINK,
        onClick: () => {
          log.info(`[ContextMenu] Add link from network: ${nodeId}`);
          options.onCreateLinkFromNode?.(nodeId);
        }
      }
    ];
  }

  // Regular nodes get the standard menu
  return [
    {
      id: 'edit-node',
      label: 'Edit',
      icon: ICON_EDIT,
      onClick: () => {
        log.info(`[ContextMenu] Edit node: ${nodeId}`);
        options.onEditNode?.(nodeId);
      }
    },
    {
      id: 'delete-node',
      label: 'Delete',
      icon: ICON_DELETE,
      onClick: () => {
        log.info(`[ContextMenu] Delete node: ${nodeId}`);
        options.onDeleteNode?.(nodeId);
      }
    },
    {
      id: 'link-node',
      label: 'Create Link',
      icon: ICON_LINK,
      onClick: () => {
        log.info(`[ContextMenu] Add link from: ${nodeId}`);
        options.onCreateLinkFromNode?.(nodeId);
      }
    }
  ];
}

/**
 * Get the node name for container operations.
 * Uses longname (full container name) for running labs, falls back to short name.
 * This matches the legacy TopoViewer behavior.
 */
function getNodeName(nodeData: Record<string, unknown>, nodeId: string): string {
  const extraData = nodeData.extraData as Record<string, unknown> | undefined;
  return (extraData?.longname as string) || (nodeData.name as string) || nodeId;
}

/**
 * Build menu items for node in view mode
 */
function buildNodeViewMenuItems(
  nodeId: string,
  nodeData: Record<string, unknown>,
  options: ContextMenuOptions
): ContextMenuItem[] {
  // Network nodes have no context menu in view mode
  if (isNetworkNode(nodeData)) {
    return [];
  }

  const nodeName = getNodeName(nodeData, nodeId);
  return [
    {
      id: 'ssh-node',
      label: 'SSH',
      icon: 'fas fa-terminal',
      onClick: () => {
        log.info(`[ContextMenu] SSH to node: ${nodeName}`);
        sendToExtension('clab-node-connect-ssh', {
          nodeName,
          labName: nodeData.labName
        });
      }
    },
    {
      id: 'shell-node',
      label: 'Shell',
      icon: 'fas fa-cube',
      onClick: () => {
        log.info(`[ContextMenu] Shell to node: ${nodeName}`);
        sendToExtension('clab-node-attach-shell', {
          nodeName,
          labName: nodeData.labName
        });
      }
    },
    {
      id: 'logs-node',
      label: 'Logs',
      icon: 'fas fa-file-alt',
      onClick: () => {
        log.info(`[ContextMenu] View logs for: ${nodeName}`);
        sendToExtension('clab-node-view-logs', {
          nodeName,
          labName: nodeData.labName
        });
      }
    },
    {
      id: 'info-node',
      label: 'Info',
      icon: 'fas fa-info-circle',
      onClick: () => {
        log.info(`[ContextMenu] Show properties for: ${nodeId}`);
        options.onShowNodeProperties?.(nodeId);
      }
    }
  ];
}

/**
 * Build menu items for edge in edit mode
 */
function buildEdgeEditMenuItems(
  edgeId: string,
  options: ContextMenuOptions
): ContextMenuItem[] {
  if (options.isLocked) return [];

  return [
    {
      id: 'edit-edge',
      label: 'Edit',
      icon: 'fas fa-pen',
      onClick: () => {
        log.info(`[ContextMenu] Edit link: ${edgeId}`);
        options.onEditLink?.(edgeId);
      }
    },
    {
      id: 'delete-edge',
      label: 'Delete',
      icon: 'fas fa-trash',
      onClick: () => {
        log.info(`[ContextMenu] Delete link: ${edgeId}`);
        options.onDeleteLink?.(edgeId);
      }
    }
  ];
}

/**
 * Build menu items for edge in view mode
 * Includes capture options for both endpoints and info option
 */
function buildEdgeViewMenuItems(
  edgeId: string,
  edgeData: Record<string, unknown>,
  options: ContextMenuOptions
): ContextMenuItem[] {
  const { srcNode, srcIf, dstNode, dstIf } = computeEdgeCaptureEndpoints(edgeData);
  const items: ContextMenuItem[] = [];

  // Add capture item for source endpoint
  if (srcNode && srcIf) {
    items.push({
      id: 'capture-source',
      label: `${srcNode} - ${srcIf}`,
      iconComponent: React.createElement(WiresharkIcon),
      onClick: () => {
        log.info(`[ContextMenu] Capture source: ${srcNode}/${srcIf}`);
        sendToExtension('clab-interface-capture', { nodeName: srcNode, interfaceName: srcIf });
      }
    });
  }

  // Add capture item for target endpoint
  if (dstNode && dstIf) {
    items.push({
      id: 'capture-target',
      label: `${dstNode} - ${dstIf}`,
      iconComponent: React.createElement(WiresharkIcon),
      onClick: () => {
        log.info(`[ContextMenu] Capture target: ${dstNode}/${dstIf}`);
        sendToExtension('clab-interface-capture', { nodeName: dstNode, interfaceName: dstIf });
      }
    });
  }

  // Add info item
  items.push({
    id: 'info-edge',
    label: 'Info',
    icon: 'fas fa-info-circle',
    onClick: () => {
      log.info(`[ContextMenu] Show link properties: ${edgeId}`);
      options.onShowLinkProperties?.(edgeId);
    }
  });

  return items;
}

/** Return type for the hook */
export interface UseContextMenuReturn {
  menuState: ContextMenuState;
  menuItems: ContextMenuItem[];
  closeMenu: () => void;
}

/** Extract position from event */
function getEventPosition(evt: EventObject): { x: number; y: number } {
  return { x: evt.originalEvent?.clientX ?? 0, y: evt.originalEvent?.clientY ?? 0 };
}

/** Hook for managing menu state */
function useMenuState(cy: Core | null) {
  const [menuState, setMenuState] = useState<ContextMenuState>(INITIAL_STATE);
  const [nodeData, setNodeData] = useState<Record<string, unknown>>({});
  const [edgeData, setEdgeData] = useState<Record<string, unknown>>({});

  const closeMenu = useCallback(() => {
    setMenuState(INITIAL_STATE);
    if (cy) cy.scratch(CONTEXT_MENU_SCRATCH_KEY, false);
  }, [cy]);

  const openNodeMenu = useCallback((nodeId: string, data: Record<string, unknown>, position: { x: number; y: number }) => {
    setNodeData(data);
    setMenuState({ isVisible: true, position, elementId: nodeId, elementType: 'node' });
  }, []);

  const openEdgeMenu = useCallback((edgeId: string, data: Record<string, unknown>, position: { x: number; y: number }) => {
    setEdgeData(data);
    setMenuState({ isVisible: true, position, elementId: edgeId, elementType: 'edge' });
  }, []);

  return { menuState, nodeData, edgeData, closeMenu, openNodeMenu, openEdgeMenu };
}

/** Hook for setting up context menu events */
function useMenuEvents(
  cy: Core | null,
  options: ContextMenuOptions,
  openNodeMenu: (nodeId: string, data: Record<string, unknown>, position: { x: number; y: number }) => void,
  openEdgeMenu: (edgeId: string, data: Record<string, unknown>, position: { x: number; y: number }) => void
) {
  useEffect(() => {
    if (!cy) return;

    log.info(`[ContextMenu] Setting up context menu listeners (mode: ${options.mode}, locked: ${options.isLocked})`);

    const handleNodeContextMenu = (evt: EventObject) => {
      const node = evt.target;
      const role = node.data('topoViewerRole');
      if (role === 'freeText' || role === 'freeShape') return;

      // Network nodes have no context menu in view mode
      if (role === 'cloud' && options.mode === 'view') {
        return;
      }

      evt.originalEvent?.preventDefault();
      openNodeMenu(node.id(), node.data(), getEventPosition(evt));
      cy.scratch(CONTEXT_MENU_SCRATCH_KEY, true);
      log.info(`[ContextMenu] Node context menu opened for: ${node.id()}`);
    };

    const handleEdgeContextMenu = (evt: EventObject) => {
      evt.originalEvent?.preventDefault();
      const edge = evt.target;
      const edgeId = edge.id();
      openEdgeMenu(edgeId, edge.data(), getEventPosition(evt));
      cy.scratch(CONTEXT_MENU_SCRATCH_KEY, true);
      log.info(`[ContextMenu] Edge context menu opened for: ${edgeId}`);
    };

    cy.on('cxttap', 'node', handleNodeContextMenu);
    cy.on('cxttap', 'edge', handleEdgeContextMenu);

    return () => {
      cy.off('cxttap', 'node', handleNodeContextMenu);
      cy.off('cxttap', 'edge', handleEdgeContextMenu);
      cy.scratch(CONTEXT_MENU_SCRATCH_KEY, false);
      log.info('[ContextMenu] Context menu listeners cleaned up');
    };
  }, [cy, options.mode, options.isLocked, openNodeMenu, openEdgeMenu]);
}

/** Build menu items based on state */
function buildMenuItems(
  menuState: ContextMenuState,
  nodeData: Record<string, unknown>,
  edgeData: Record<string, unknown>,
  options: ContextMenuOptions
): ContextMenuItem[] {
  if (!menuState.isVisible || !menuState.elementId) return [];

  if (menuState.elementType === 'node') {
    return options.mode === 'edit'
      ? buildNodeEditMenuItems(menuState.elementId, nodeData, options)
      : buildNodeViewMenuItems(menuState.elementId, nodeData, options);
  }

  if (menuState.elementType === 'edge') {
    return options.mode === 'edit'
      ? buildEdgeEditMenuItems(menuState.elementId, options)
      : buildEdgeViewMenuItems(menuState.elementId, edgeData, options);
  }

  return [];
}

/**
 * Hook to manage context menus for Cytoscape elements
 * Returns state and handlers for rendering a React-based context menu
 */
export function useContextMenu(
  cy: Core | null,
  options: ContextMenuOptions
): UseContextMenuReturn {
  const { menuState, nodeData, edgeData, closeMenu, openNodeMenu, openEdgeMenu } = useMenuState(cy);
  useMenuEvents(cy, options, openNodeMenu, openEdgeMenu);
  const menuItems = buildMenuItems(menuState, nodeData, edgeData, options);

  return { menuState, menuItems, closeMenu };
}
