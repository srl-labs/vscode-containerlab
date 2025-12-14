/**
 * Context Menu Hook for Cytoscape Elements
 * Manages context menu state for nodes and edges using React-based menu
 */
import { useEffect, useCallback, useState } from 'react';
import type { Core, EventObject } from 'cytoscape';
import { log } from '../../utils/logger';
import { ContextMenuItem } from '../../components/context-menu/ContextMenu';

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
 * Build menu items for node in edit mode
 */
function buildNodeEditMenuItems(
  nodeId: string,
  options: ContextMenuOptions
): ContextMenuItem[] {
  if (options.isLocked) return [];

  return [
    {
      id: 'edit-node',
      label: 'Edit',
      icon: 'fas fa-pen',
      onClick: () => {
        log.info(`[ContextMenu] Edit node: ${nodeId}`);
        options.onEditNode?.(nodeId);
      }
    },
    {
      id: 'delete-node',
      label: 'Delete',
      icon: 'fas fa-trash',
      onClick: () => {
        log.info(`[ContextMenu] Delete node: ${nodeId}`);
        options.onDeleteNode?.(nodeId);
      }
    },
    {
      id: 'link-node',
      label: 'Create Link',
      icon: 'fas fa-link',
      onClick: () => {
        log.info(`[ContextMenu] Add link from: ${nodeId}`);
        options.onCreateLinkFromNode?.(nodeId);
      }
    }
  ];
}

/**
 * Build menu items for node in view mode
 */
function buildNodeViewMenuItems(
  nodeId: string,
  nodeData: Record<string, unknown>,
  options: ContextMenuOptions
): ContextMenuItem[] {
  return [
    {
      id: 'ssh-node',
      label: 'SSH',
      icon: 'fas fa-terminal',
      onClick: () => {
        log.info(`[ContextMenu] SSH to node: ${nodeData.name || nodeId}`);
        sendToExtension('clab-node-connect-ssh', {
          nodeName: nodeData.name || nodeId,
          labName: nodeData.labName
        });
      }
    },
    {
      id: 'shell-node',
      label: 'Shell',
      icon: 'fas fa-cube',
      onClick: () => {
        log.info(`[ContextMenu] Shell to node: ${nodeData.name || nodeId}`);
        sendToExtension('clab-node-attach-shell', {
          nodeName: nodeData.name || nodeId,
          labName: nodeData.labName
        });
      }
    },
    {
      id: 'logs-node',
      label: 'Logs',
      icon: 'fas fa-file-alt',
      onClick: () => {
        log.info(`[ContextMenu] View logs for: ${nodeData.name || nodeId}`);
        sendToExtension('clab-node-view-logs', {
          nodeName: nodeData.name || nodeId,
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
 */
function buildEdgeViewMenuItems(
  edgeId: string,
  options: ContextMenuOptions
): ContextMenuItem[] {
  return [
    {
      id: 'info-edge',
      label: 'Info',
      icon: 'fas fa-info-circle',
      onClick: () => {
        log.info(`[ContextMenu] Show link properties: ${edgeId}`);
        options.onShowLinkProperties?.(edgeId);
      }
    }
  ];
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

  const closeMenu = useCallback(() => {
    setMenuState(INITIAL_STATE);
    if (cy) cy.scratch(CONTEXT_MENU_SCRATCH_KEY, false);
  }, [cy]);

  const openNodeMenu = useCallback((nodeId: string, data: Record<string, unknown>, position: { x: number; y: number }) => {
    setNodeData(data);
    setMenuState({ isVisible: true, position, elementId: nodeId, elementType: 'node' });
  }, []);

  const openEdgeMenu = useCallback((edgeId: string, position: { x: number; y: number }) => {
    setMenuState({ isVisible: true, position, elementId: edgeId, elementType: 'edge' });
  }, []);

  return { menuState, nodeData, closeMenu, openNodeMenu, openEdgeMenu };
}

/** Hook for setting up context menu events */
function useMenuEvents(
  cy: Core | null,
  options: ContextMenuOptions,
  openNodeMenu: (nodeId: string, data: Record<string, unknown>, position: { x: number; y: number }) => void,
  openEdgeMenu: (edgeId: string, position: { x: number; y: number }) => void
) {
  useEffect(() => {
    if (!cy) return;

    log.info(`[ContextMenu] Setting up context menu listeners (mode: ${options.mode}, locked: ${options.isLocked})`);

    const handleNodeContextMenu = (evt: EventObject) => {
      const node = evt.target;
      const role = node.data('topoViewerRole');
      if (role === 'freeText' || role === 'freeShape') return;

      evt.originalEvent?.preventDefault();
      openNodeMenu(node.id(), node.data(), getEventPosition(evt));
      cy.scratch(CONTEXT_MENU_SCRATCH_KEY, true);
      log.info(`[ContextMenu] Node context menu opened for: ${node.id()}`);
    };

    const handleEdgeContextMenu = (evt: EventObject) => {
      evt.originalEvent?.preventDefault();
      const edgeId = evt.target.id();
      openEdgeMenu(edgeId, getEventPosition(evt));
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
  options: ContextMenuOptions
): ContextMenuItem[] {
  if (!menuState.isVisible || !menuState.elementId) return [];

  if (menuState.elementType === 'node') {
    return options.mode === 'edit'
      ? buildNodeEditMenuItems(menuState.elementId, options)
      : buildNodeViewMenuItems(menuState.elementId, nodeData, options);
  }

  if (menuState.elementType === 'edge') {
    return options.mode === 'edit'
      ? buildEdgeEditMenuItems(menuState.elementId, options)
      : buildEdgeViewMenuItems(menuState.elementId, options);
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
  const { menuState, nodeData, closeMenu, openNodeMenu, openEdgeMenu } = useMenuState(cy);
  useMenuEvents(cy, options, openNodeMenu, openEdgeMenu);
  const menuItems = buildMenuItems(menuState, nodeData, options);

  return { menuState, menuItems, closeMenu };
}
