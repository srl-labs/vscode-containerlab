/**
 * Context Menu Hook for Cytoscape Elements
 * Manages context menu state for nodes and edges using React-based menu
 */
import { useEffect, useCallback, useState } from 'react';
import { Core } from 'cytoscape';
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

/**
 * Hook to manage context menus for Cytoscape elements
 * Returns state and handlers for rendering a React-based context menu
 */
export function useContextMenu(
  cy: Core | null,
  options: ContextMenuOptions
): UseContextMenuReturn {
  const [menuState, setMenuState] = useState<ContextMenuState>(INITIAL_STATE);
  const [nodeData, setNodeData] = useState<Record<string, unknown>>({});

  const closeMenu = useCallback(() => {
    setMenuState(INITIAL_STATE);
    // Clear scratch key when menu closes
    if (cy) {
      cy.scratch(CONTEXT_MENU_SCRATCH_KEY, false);
    }
  }, [cy]);

  // Set up event listeners for context menu triggers
  useEffect(() => {
    if (!cy) return;

    log.info(`[ContextMenu] Setting up context menu listeners (mode: ${options.mode}, locked: ${options.isLocked})`);

    // Handle right-click on nodes (excluding annotations)
    const handleNodeContextMenu = (evt: cytoscape.EventObject) => {
      const node = evt.target;
      const role = node.data('topoViewerRole');

      // Skip annotation nodes (text and shapes)
      if (role === 'freeText' || role === 'freeShape') {
        return;
      }

      evt.originalEvent?.preventDefault();

      const nodeId = node.id();
      const data = node.data();

      setNodeData(data);
      setMenuState({
        isVisible: true,
        position: { x: evt.originalEvent?.clientX ?? 0, y: evt.originalEvent?.clientY ?? 0 },
        elementId: nodeId,
        elementType: 'node'
      });

      // Set scratch key to prevent selection while menu is open
      cy.scratch(CONTEXT_MENU_SCRATCH_KEY, true);

      log.info(`[ContextMenu] Node context menu opened for: ${nodeId}`);
    };

    // Handle right-click on edges
    const handleEdgeContextMenu = (evt: cytoscape.EventObject) => {
      evt.originalEvent?.preventDefault();

      const edge = evt.target;
      const edgeId = edge.id();

      setMenuState({
        isVisible: true,
        position: { x: evt.originalEvent?.clientX ?? 0, y: evt.originalEvent?.clientY ?? 0 },
        elementId: edgeId,
        elementType: 'edge'
      });

      // Set scratch key to prevent selection while menu is open
      cy.scratch(CONTEXT_MENU_SCRATCH_KEY, true);

      log.info(`[ContextMenu] Edge context menu opened for: ${edgeId}`);
    };

    // Register event handlers
    cy.on('cxttap', 'node', handleNodeContextMenu);
    cy.on('cxttap', 'edge', handleEdgeContextMenu);

    return () => {
      cy.off('cxttap', 'node', handleNodeContextMenu);
      cy.off('cxttap', 'edge', handleEdgeContextMenu);
      cy.scratch(CONTEXT_MENU_SCRATCH_KEY, false);
      log.info('[ContextMenu] Context menu listeners cleaned up');
    };
  }, [cy, options.mode, options.isLocked]);

  // Build menu items based on current state
  const menuItems = useCallback((): ContextMenuItem[] => {
    if (!menuState.isVisible || !menuState.elementId) {
      return [];
    }

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
  }, [menuState, nodeData, options])();

  return {
    menuState,
    menuItems,
    closeMenu
  };
}
