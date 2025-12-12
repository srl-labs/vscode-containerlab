/**
 * Context Menu Hook for Cytoscape
 * Sets up radial context menus using cytoscape-cxtmenu
 */
import { useEffect, useCallback } from 'react';
import cytoscape, { Core } from 'cytoscape';
import cxtmenu from 'cytoscape-cxtmenu';
import { log } from '../../utils/logger';

// Register the extension once
let cxtmenuRegistered = false;
if (!cxtmenuRegistered && typeof cytoscape === 'function') {
  cytoscape.use(cxtmenu);
  cxtmenuRegistered = true;
}

/**
 * VS Code API interface
 */
declare const vscode: {
  postMessage: (msg: unknown) => void;
};

/**
 * Menu item configuration
 */
interface MenuItem {
  content: string;
  select: (ele: cytoscape.NodeSingular | cytoscape.EdgeSingular) => void;
  enabled?: boolean;
}

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
  // Group options
  onEditGroup?: (groupId: string) => void;
  onDeleteGroup?: (groupId: string) => void;
  onReleaseFromGroup?: (nodeId: string) => void;
}

/** Common menu item labels */
const MENU_LABELS = {
  EDIT: 'Edit',
  DELETE: 'Delete',
  LINK: 'Link',
  SSH: 'SSH',
  SHELL: 'Shell',
  LOGS: 'Logs',
  INFO: 'Info',
  UNGROUP: 'Ungroup'
} as const;

/** Common menu icons */
const MENU_ICONS = {
  EDIT: 'fa-pen-to-square',
  DELETE: 'fa-trash-alt',
  LINK: 'fa-link',
  SSH: 'fa-terminal',
  SHELL: 'fa-cube',
  LOGS: 'fa-file-alt',
  INFO: 'fa-info-circle',
  UNGROUP: 'fa-object-ungroup',
  EDIT_ALT: 'fa-pen'
} as const;

/**
 * Common menu styling
 */
const MENU_STYLE = {
  fillColor: 'rgba(31, 31, 31, 0.85)',
  activeFillColor: 'rgba(66, 88, 255, 1)',
  activePadding: 8,
  indicatorSize: 16,
  separatorWidth: 3,
  spotlightPadding: 6,
  adaptativeNodeSpotlightRadius: true,
  minSpotlightRadius: 16,
  maxSpotlightRadius: 32,
  itemTextShadowColor: 'transparent',
  zIndex: 9999,
  atMouse: false,
  openMenuEvents: 'cxttapstart cxttap',
  outsideMenuCancel: 10
};

/**
 * Create Font Awesome icon HTML
 */
function faIcon(iconClass: string, label?: string): string {
  const iconHtml = `<i class="fa-solid ${iconClass}" style="font-size: 14px; color: white;"></i>`;
  if (label) {
    return `<div style="display: flex; flex-direction: column; align-items: center;">
      ${iconHtml}
      <span style="font-size: 9px; color: white; margin-top: 2px;">${label}</span>
    </div>`;
  }
  return iconHtml;
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
 * Build node context menu items for edit mode
 */
function buildNodeEditMenuItems(options: ContextMenuOptions): MenuItem[] {
  if (options.isLocked) return [];

  return [
    {
      content: faIcon(MENU_ICONS.EDIT, MENU_LABELS.EDIT),
      select: (ele) => {
        const nodeId = ele.id();
        log.info(`[ContextMenu] Edit node: ${nodeId}`);
        options.onEditNode?.(nodeId);
      }
    },
    {
      content: faIcon(MENU_ICONS.DELETE, MENU_LABELS.DELETE),
      select: (ele) => {
        const nodeId = ele.id();
        log.info(`[ContextMenu] Delete node: ${nodeId}`);
        options.onDeleteNode?.(nodeId);
      }
    },
    {
      content: faIcon(MENU_ICONS.LINK, MENU_LABELS.LINK),
      select: (ele) => {
        log.info(`[ContextMenu] Add link from: ${ele.id()}`);
        options.onCreateLinkFromNode?.(ele.id());
      }
    }
  ];
}

/**
 * Build node context menu items for view mode
 */
function buildNodeViewMenuItems(options: ContextMenuOptions): MenuItem[] {
  return [
    {
      content: faIcon(MENU_ICONS.SSH, MENU_LABELS.SSH),
      select: (ele) => {
        const data = ele.data();
        log.info(`[ContextMenu] SSH to node: ${data.name || ele.id()}`);
        sendToExtension('clab-node-connect-ssh', {
          nodeName: data.name || ele.id(),
          labName: data.labName
        });
      }
    },
    {
      content: faIcon(MENU_ICONS.SHELL, MENU_LABELS.SHELL),
      select: (ele) => {
        const data = ele.data();
        log.info(`[ContextMenu] Shell to node: ${data.name || ele.id()}`);
        sendToExtension('clab-node-attach-shell', {
          nodeName: data.name || ele.id(),
          labName: data.labName
        });
      }
    },
    {
      content: faIcon(MENU_ICONS.LOGS, MENU_LABELS.LOGS),
      select: (ele) => {
        const data = ele.data();
        log.info(`[ContextMenu] View logs for: ${data.name || ele.id()}`);
        sendToExtension('clab-node-view-logs', {
          nodeName: data.name || ele.id(),
          labName: data.labName
        });
      }
    },
    {
      content: faIcon(MENU_ICONS.INFO, MENU_LABELS.INFO),
      select: (ele) => {
        const nodeId = ele.id();
        log.info(`[ContextMenu] Show properties for: ${nodeId}`);
        options.onShowNodeProperties?.(nodeId);
      }
    }
  ];
}

/**
 * Build edge context menu items for edit mode
 */
function buildEdgeEditMenuItems(options: ContextMenuOptions): MenuItem[] {
  if (options.isLocked) return [];

  return [
    {
      content: faIcon(MENU_ICONS.EDIT_ALT, MENU_LABELS.EDIT),
      select: (ele) => {
        const edgeId = ele.id();
        log.info(`[ContextMenu] Edit link: ${edgeId}`);
        options.onEditLink?.(edgeId);
      }
    },
    {
      content: faIcon(MENU_ICONS.DELETE, MENU_LABELS.DELETE),
      select: (ele) => {
        const edgeId = ele.id();
        log.info(`[ContextMenu] Delete link: ${edgeId}`);
        options.onDeleteLink?.(edgeId);
      }
    }
  ];
}

/**
 * Build edge context menu items for view mode
 */
function buildEdgeViewMenuItems(options: ContextMenuOptions): MenuItem[] {
  return [
    {
      content: faIcon(MENU_ICONS.INFO, MENU_LABELS.INFO),
      select: (ele) => {
        const edgeId = ele.id();
        log.info(`[ContextMenu] Show link properties: ${edgeId}`);
        options.onShowLinkProperties?.(edgeId);
      }
    }
  ];
}

/**
 * Build group context menu items for edit mode
 */
function buildGroupEditMenuItems(options: ContextMenuOptions): MenuItem[] {
  if (options.isLocked) return [];

  return [
    {
      content: faIcon(MENU_ICONS.EDIT, MENU_LABELS.EDIT),
      select: (ele) => {
        const groupId = ele.id();
        log.info(`[ContextMenu] Edit group: ${groupId}`);
        options.onEditGroup?.(groupId);
      }
    },
    {
      content: faIcon(MENU_ICONS.DELETE, MENU_LABELS.DELETE),
      select: (ele) => {
        const groupId = ele.id();
        log.info(`[ContextMenu] Delete group: ${groupId}`);
        options.onDeleteGroup?.(groupId);
      }
    }
  ];
}

/**
 * Build "release from group" menu items for nodes in groups
 */
function buildReleaseFromGroupMenuItems(options: ContextMenuOptions): MenuItem[] {
  if (options.isLocked) return [];

  return [
    {
      content: faIcon(MENU_ICONS.UNGROUP, MENU_LABELS.UNGROUP),
      select: (ele) => {
        const nodeId = ele.id();
        log.info(`[ContextMenu] Release from group: ${nodeId}`);
        options.onReleaseFromGroup?.(nodeId);
      }
    }
  ];
}

/** Cxtmenu instance type */
type CxtmenuInstance = { destroy: () => void };

/** Cytoscape with cxtmenu extension */
type CyWithCxtmenu = Core & { cxtmenu: (cfg: unknown) => CxtmenuInstance };

// Scratch key for tracking context menu state
export const CONTEXT_MENU_SCRATCH_KEY = '_isContextMenuActive';

/**
 * Register node context menu (for nodes NOT in a group)
 */
function registerNodeMenu(cy: CyWithCxtmenu, items: MenuItem[]): CxtmenuInstance | null {
  if (items.length === 0) return null;

  // Use :orphan to only match nodes that don't have a parent (not in a group)
  const nodeSelector = 'node:orphan[topoViewerRole != "group"][topoViewerRole != "freeText"][topoViewerRole != "freeShape"]';

  try {
    const menu = cy.cxtmenu({
      selector: nodeSelector,
      commands: items,
      menuRadius: (ele: cytoscape.NodeSingular) => Math.max(80, Math.min(120, ele.width() * 3)),
      ...MENU_STYLE
    });
    log.info('[ContextMenu] Node menu registered');
    return menu;
  } catch (err) {
    log.error(`[ContextMenu] Failed to create node menu: ${err}`);
    return null;
  }
}

/**
 * Register edge context menu
 */
function registerEdgeMenu(cy: CyWithCxtmenu, items: MenuItem[]): CxtmenuInstance | null {
  if (items.length === 0) return null;

  try {
    const menu = cy.cxtmenu({
      selector: 'edge',
      commands: items,
      menuRadius: () => 70,
      ...MENU_STYLE
    });
    log.info('[ContextMenu] Edge menu registered');
    return menu;
  } catch (err) {
    log.error(`[ContextMenu] Failed to create edge menu: ${err}`);
    return null;
  }
}

/**
 * Register group context menu
 */
function registerGroupMenu(cy: CyWithCxtmenu, items: MenuItem[]): CxtmenuInstance | null {
  if (items.length === 0) return null;

  const groupSelector = 'node[topoViewerRole = "group"]';

  try {
    const menu = cy.cxtmenu({
      selector: groupSelector,
      commands: items,
      menuRadius: () => 80,
      ...MENU_STYLE
    });
    log.info('[ContextMenu] Group menu registered');
    return menu;
  } catch (err) {
    log.error(`[ContextMenu] Failed to create group menu: ${err}`);
    return null;
  }
}

/**
 * Register node-in-group context menu (for releasing from group)
 */
function registerNodeInGroupMenu(cy: CyWithCxtmenu, editItems: MenuItem[], releaseItems: MenuItem[]): CxtmenuInstance | null {
  const combinedItems = [...editItems, ...releaseItems];
  if (combinedItems.length === 0) return null;

  // Selector for nodes that have a parent (are in a group) but are not groups/annotations themselves
  const nodeInGroupSelector = 'node:child[topoViewerRole != "group"][topoViewerRole != "freeText"][topoViewerRole != "freeShape"]';

  try {
    const menu = cy.cxtmenu({
      selector: nodeInGroupSelector,
      commands: combinedItems,
      menuRadius: (ele: cytoscape.NodeSingular) => Math.max(80, Math.min(120, ele.width() * 3)),
      ...MENU_STYLE
    });
    log.info('[ContextMenu] Node-in-group menu registered');
    return menu;
  } catch (err) {
    log.error(`[ContextMenu] Failed to create node-in-group menu: ${err}`);
    return null;
  }
}

/** Menu item getters */
interface MenuItemGetters {
  getNodeMenuItems: () => MenuItem[];
  getEdgeMenuItems: () => MenuItem[];
  getGroupMenuItems: () => MenuItem[];
  getReleaseFromGroupItems: () => MenuItem[];
}

/** Setup menus on Cytoscape instance */
function setupMenus(cy: Core, menus: CxtmenuInstance[], getters: MenuItemGetters): void {
  const cyExt = cy as CyWithCxtmenu;

  const nodeMenu = registerNodeMenu(cyExt, getters.getNodeMenuItems());
  if (nodeMenu) menus.push(nodeMenu);

  const edgeMenu = registerEdgeMenu(cyExt, getters.getEdgeMenuItems());
  if (edgeMenu) menus.push(edgeMenu);

  const groupMenu = registerGroupMenu(cyExt, getters.getGroupMenuItems());
  if (groupMenu) menus.push(groupMenu);

  const nodeInGroupMenu = registerNodeInGroupMenu(
    cyExt,
    getters.getNodeMenuItems(),
    getters.getReleaseFromGroupItems()
  );
  if (nodeInGroupMenu) menus.push(nodeInGroupMenu);
}

/** Cleanup menus */
function cleanupMenus(menus: CxtmenuInstance[]): void {
  menus.forEach(menu => {
    try {
      menu.destroy();
    } catch (err) {
      log.warn(`[ContextMenu] Error destroying menu: ${err}`);
    }
  });
  log.info('[ContextMenu] Menus cleaned up');
}

/**
 * Hook to set up context menus on a Cytoscape instance
 */
export function useContextMenu(cy: Core | null, options: ContextMenuOptions): void {
  const { mode, isLocked } = options;

  const getNodeMenuItems = useCallback(() => {
    return mode === 'edit' ? buildNodeEditMenuItems(options) : buildNodeViewMenuItems(options);
  }, [mode, isLocked, options]);

  const getEdgeMenuItems = useCallback(() => {
    return mode === 'edit' ? buildEdgeEditMenuItems(options) : buildEdgeViewMenuItems(options);
  }, [mode, isLocked, options]);

  const getGroupMenuItems = useCallback(() => {
    return mode === 'edit' ? buildGroupEditMenuItems(options) : [];
  }, [mode, isLocked, options]);

  const getReleaseFromGroupItems = useCallback(() => {
    return mode === 'edit' ? buildReleaseFromGroupMenuItems(options) : [];
  }, [mode, isLocked, options]);

  useEffect(() => {
    if (!cy) return;

    log.info(`[ContextMenu] Setting up context menus (mode: ${mode}, locked: ${isLocked})`);

    const menus: CxtmenuInstance[] = [];
    const getters: MenuItemGetters = {
      getNodeMenuItems,
      getEdgeMenuItems,
      getGroupMenuItems,
      getReleaseFromGroupItems
    };

    // Set up context menu state tracking
    const handleMenuOpen = () => cy.scratch(CONTEXT_MENU_SCRATCH_KEY, true);
    const handleMenuClose = () => {
      setTimeout(() => cy.scratch(CONTEXT_MENU_SCRATCH_KEY, false), 100);
    };

    cy.on('cxttapstart', handleMenuOpen);
    cy.on('cxttapend', handleMenuClose);

    setupMenus(cy, menus, getters);

    return () => {
      cy.off('cxttapstart', handleMenuOpen);
      cy.off('cxttapend', handleMenuClose);
      cy.scratch(CONTEXT_MENU_SCRATCH_KEY, false);
      cleanupMenus(menus);
    };
  }, [cy, mode, isLocked, getNodeMenuItems, getEdgeMenuItems, getGroupMenuItems, getReleaseFromGroupItems]);
}
