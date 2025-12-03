/**
 * Context Menu Hook for Cytoscape
 * Sets up radial context menus using cytoscape-cxtmenu
 */
import { useEffect, useCallback } from 'react';
import cytoscape, { Core } from 'cytoscape';
import cxtmenu from 'cytoscape-cxtmenu';
import { log } from '../utils/logger';

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
  // eslint-disable-next-line no-unused-vars
  postMessage: (msg: unknown) => void;
};

/**
 * Menu item configuration
 */
interface MenuItem {
  content: string;
  /* eslint-disable-next-line no-unused-vars */
  select: (ele: cytoscape.NodeSingular | cytoscape.EdgeSingular) => void;
  enabled?: boolean;
}

/**
 * Context menu options
 */
export interface ContextMenuOptions {
  mode: 'edit' | 'view';
  isLocked: boolean;
  /* eslint-disable no-unused-vars */
  onEditNode?: (nodeId: string) => void;
  onDeleteNode?: (nodeId: string) => void;
  onEditLink?: (edgeId: string) => void;
  onDeleteLink?: (edgeId: string) => void;
  onShowNodeProperties?: (nodeId: string) => void;
  onShowLinkProperties?: (edgeId: string) => void;
  /* eslint-enable no-unused-vars */
}

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
  atMouse: false
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
      content: faIcon('fa-pen-to-square', 'Edit'),
      select: (ele) => {
        const nodeId = ele.id();
        log.info(`[ContextMenu] Edit node: ${nodeId}`);
        options.onEditNode?.(nodeId);
      }
    },
    {
      content: faIcon('fa-trash-alt', 'Delete'),
      select: (ele) => {
        const nodeId = ele.id();
        log.info(`[ContextMenu] Delete node: ${nodeId}`);
        options.onDeleteNode?.(nodeId);
      }
    },
    {
      content: faIcon('fa-link', 'Link'),
      select: (ele) => {
        log.info(`[ContextMenu] Add link from: ${ele.id()}`);
        // Edge creation will be implemented in Phase 6
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
      content: faIcon('fa-terminal', 'SSH'),
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
      content: faIcon('fa-cube', 'Shell'),
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
      content: faIcon('fa-file-alt', 'Logs'),
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
      content: faIcon('fa-info-circle', 'Info'),
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
      content: faIcon('fa-pen', 'Edit'),
      select: (ele) => {
        const edgeId = ele.id();
        log.info(`[ContextMenu] Edit link: ${edgeId}`);
        options.onEditLink?.(edgeId);
      }
    },
    {
      content: faIcon('fa-trash-alt', 'Delete'),
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
      content: faIcon('fa-info-circle', 'Info'),
      select: (ele) => {
        const edgeId = ele.id();
        log.info(`[ContextMenu] Show link properties: ${edgeId}`);
        options.onShowLinkProperties?.(edgeId);
      }
    }
  ];
}

/** Cxtmenu instance type */
type CxtmenuInstance = { destroy: () => void };

/** Cytoscape with cxtmenu extension */
/* eslint-disable-next-line no-unused-vars */
type CyWithCxtmenu = Core & { cxtmenu: (cfg: unknown) => CxtmenuInstance };

/**
 * Register node context menu
 */
function registerNodeMenu(cy: CyWithCxtmenu, items: MenuItem[]): CxtmenuInstance | null {
  if (items.length === 0) return null;

  const nodeSelector = 'node[topoViewerRole != "group"][topoViewerRole != "freeText"][topoViewerRole != "freeShape"]';

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

  useEffect(() => {
    if (!cy) return;

    log.info(`[ContextMenu] Setting up context menus (mode: ${mode}, locked: ${isLocked})`);

    const menus: CxtmenuInstance[] = [];
    const cyExt = cy as CyWithCxtmenu;

    const nodeMenu = registerNodeMenu(cyExt, getNodeMenuItems());
    if (nodeMenu) menus.push(nodeMenu);

    const edgeMenu = registerEdgeMenu(cyExt, getEdgeMenuItems());
    if (edgeMenu) menus.push(edgeMenu);

    return () => {
      menus.forEach(menu => {
        try {
          menu.destroy();
        } catch (err) {
          log.warn(`[ContextMenu] Error destroying menu: ${err}`);
        }
      });
      log.info('[ContextMenu] Menus cleaned up');
    };
  }, [cy, mode, isLocked, getNodeMenuItems, getEdgeMenuItems]);
}
