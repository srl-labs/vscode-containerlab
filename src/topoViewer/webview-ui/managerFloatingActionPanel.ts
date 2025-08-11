// file: managerFloatingActionPanel.ts

import cytoscape from 'cytoscape';
import { ManagerAddContainerlabNode } from './managerAddContainerlabNode';
import { getGroupManager } from '../core/managerRegistry';
import { log } from '../logging/webviewLogger';

/**
 * ManagerFloatingActionPanel handles the floating action button (FAB) and radial menu
 * for quickly adding nodes, groups, and other elements to the topology.
 */
export class ManagerFloatingActionPanel {
  private cy: cytoscape.Core;
  private addNodeManager: ManagerAddContainerlabNode;
  private isMenuOpen: boolean = false;
  private fabMain: HTMLElement | null = null;
  private radialMenu: HTMLElement | null = null;

  constructor(cy: cytoscape.Core, addNodeManager: ManagerAddContainerlabNode) {
    this.cy = cy;
    this.addNodeManager = addNodeManager;
    this.initializePanel();
  }

  /**
   * Initializes the floating action panel and sets up event listeners
   */
  private initializePanel(): void {
    // Get DOM elements
    this.fabMain = document.getElementById('fab-main');
    this.radialMenu = document.getElementById('radial-menu');

    if (!this.fabMain || !this.radialMenu) {
      log.error('Floating action panel elements not found');
      return;
    }

    // Main FAB click handler
    this.fabMain.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleMenu();
    });

    // Radial menu item handlers
    const addNodeBtn = document.getElementById('radial-add-node');
    const addGroupBtn = document.getElementById('radial-add-group');
    const addTextBtn = document.getElementById('radial-add-text');

    if (addNodeBtn) {
      addNodeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.handleAddNode();
      });
    }

    if (addGroupBtn) {
      addGroupBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.handleAddGroup();
      });
    }

    if (addTextBtn) {
      addTextBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.handleAddText();
      });
    }

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
      if (this.isMenuOpen && !this.fabMain?.contains(e.target as Node) &&
          !this.radialMenu?.contains(e.target as Node)) {
        this.closeMenu();
      }
    });

    // Close menu on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isMenuOpen) {
        this.closeMenu();
      }
    });
  }

  /**
   * Toggles the radial menu open/closed state
   */
  private toggleMenu(): void {
    if (this.isMenuOpen) {
      this.closeMenu();
    } else {
      this.openMenu();
    }
  }

  /**
   * Opens the radial menu
   */
  private openMenu(): void {
    if (!this.fabMain || !this.radialMenu) return;

    this.isMenuOpen = true;
    this.fabMain.classList.add('active');
    this.radialMenu.classList.add('active');

    // Rotate the plus icon to X
    const icon = this.fabMain.querySelector('i');
    if (icon) {
      icon.style.transform = 'rotate(45deg)';
    }

    log.debug('Floating action menu opened');
  }

  /**
   * Closes the radial menu
   */
  private closeMenu(): void {
    if (!this.fabMain || !this.radialMenu) return;

    this.isMenuOpen = false;
    this.fabMain.classList.remove('active');
    this.radialMenu.classList.remove('active');

    // Rotate icon back to plus
    const icon = this.fabMain.querySelector('i');
    if (icon) {
      icon.style.transform = 'rotate(0deg)';
    }

    log.debug('Floating action menu closed');
  }

  /**
   * Handles adding a new node to the topology
   */
  private handleAddNode(): void {
    log.debug('Adding new node via floating action panel');

    // Get viewport center for positioning
    const extent = this.cy.extent();
    const viewportCenterX = (extent.x1 + extent.x2) / 2;
    const viewportCenterY = (extent.y1 + extent.y2) / 2;

    // Create a synthetic event object for the add node manager
    const syntheticEvent: cytoscape.EventObject = {
      type: 'click',
      target: this.cy,
      cy: this.cy,
      namespace: '',
      timeStamp: Date.now(),
      position: {
        x: viewportCenterX,
        y: viewportCenterY
      },
      renderedPosition: {
        x: viewportCenterX,
        y: viewportCenterY
      },
      originalEvent: new MouseEvent('click')
    } as cytoscape.EventObject;

    // Add the node
    this.addNodeManager.viewportButtonsAddContainerlabNode(this.cy, syntheticEvent);

    // Close the menu after adding
    this.closeMenu();

    // Optionally, open the node editor for the newly added node
    const newNode = this.cy.nodes().last();
    // Access viewportPanels through topoViewerState
    const state = (window as any).topoViewerState;
    if (newNode && state?.editorEngine?.viewportPanels) {
      setTimeout(() => {
        state.editorEngine.viewportPanels.panelNodeEditor(newNode);
      }, 100);
    }
  }

  /**
   * Handles adding a new group to the topology
   */
  private handleAddGroup(): void {
    log.debug('Adding new group via floating action panel');

    const groupManager = getGroupManager(this.cy, 'edit');
    if (!groupManager) {
      log.error('Group manager not available');
      return;
    }

    // Use the same method as the navbar button
    groupManager.viewportButtonsAddGroup();

    // Close the menu after adding
    this.closeMenu();

    log.info('Added new group via floating action panel');
  }

  /**
   * Handles adding free text to the topology
   */
  private handleAddText(): void {
    log.debug('Adding free text via floating action panel');

    // Access the free text manager from the global topology controller
    const topoController = (window as any).topologyWebviewController;
    if (topoController && topoController.freeTextManager) {
      topoController.freeTextManager.enableAddTextMode();
      this.closeMenu();
      log.info('Free text mode enabled via floating action panel');
    } else {
      log.error('Free text manager not available');
    }
  }

  /**
   * Shows or hides the floating action panel
   */
  public setVisibility(visible: boolean): void {
    const panel = document.getElementById('floating-action-panel');
    if (panel) {
      panel.style.display = visible ? 'block' : 'none';
    }
  }

  /**
   * Updates the panel position if needed (e.g., to avoid overlapping with other UI elements)
   */
  public updatePosition(bottom: number = 4, left: number = 4): void {
    const panel = document.getElementById('floating-action-panel');
    if (panel) {
      panel.style.bottom = `${bottom}rem`;
      panel.style.left = `${left}rem`;
    }
  }
}