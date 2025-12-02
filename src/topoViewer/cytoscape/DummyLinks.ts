// file: DummyLinks.ts

import cytoscape from 'cytoscape';
import { log } from '../logging/logger';
import topoViewerState from '../state';
import { PREFIX_DUMMY } from '../shared/utilities/LinkTypes';

const DUMMY_LINK_HIDDEN_CLASS = 'dummy-link-hidden';
const DUMMY_TOGGLE_BUTTON_ID = 'viewport-dummy-links-toggle';

/**
 * Manages dummy link visibility in the topology viewer.
 * Dummy links connect nodes to synthetic "dummy" endpoints and can be hidden
 * without affecting the underlying YAML topology data.
 */
export class ManagerDummyLinks {
  private cy: cytoscape.Core | null = null;
  private visible: boolean = topoViewerState.dummyLinksVisible;

  /**
   * Bind the manager to a Cytoscape instance.
   */
  public initialize(cy: cytoscape.Core): void {
    if (this.cy === cy) {
      this.applyVisibility();
      this.syncButton();
      return;
    }

    this.cy = cy;
    this.visible = topoViewerState.dummyLinksVisible;
    this.applyVisibility();
    this.syncButton();
    log.debug(`Dummy links manager initialized, visible: ${this.visible}`);
  }

  /**
   * Toggle dummy link visibility.
   */
  public toggle(): void {
    this.setVisibility(!this.visible);
  }

  /**
   * Set dummy link visibility.
   */
  public setVisibility(visible: boolean): void {
    if (visible === this.visible && topoViewerState.dummyLinksVisible === visible) {
      return;
    }

    this.visible = visible;
    topoViewerState.dummyLinksVisible = visible;

    log.info(`Dummy links visibility set to: ${visible}`);
    if (this.cy) {
      this.applyVisibility();
    }
    this.syncButton();
  }

  /**
   * Get current visibility state.
   */
  public isVisible(): boolean {
    return this.visible;
  }

  /**
   * Re-apply visibility after Cytoscape elements are refreshed.
   */
  public refreshAfterUpdate(): void {
    if (!this.cy) {
      return;
    }
    this.applyVisibility();
    this.syncButton();
  }

  private applyVisibility(): void {
    const cy = this.cy;
    if (!cy) {
      return;
    }

    // Find all edges connected to dummy nodes
    const dummyEdges = cy.edges().filter(edge => {
      const sourceId = edge.source().id();
      const targetId = edge.target().id();
      return sourceId.startsWith(PREFIX_DUMMY) || targetId.startsWith(PREFIX_DUMMY);
    });

    // Find all dummy nodes
    const dummyNodes = cy.nodes().filter(node => {
      return node.id().startsWith(PREFIX_DUMMY);
    });

    if (this.visible) {
      // Show dummy links and nodes
      dummyEdges.removeClass(DUMMY_LINK_HIDDEN_CLASS);
      dummyNodes.removeClass(DUMMY_LINK_HIDDEN_CLASS);
    } else {
      // Hide dummy links and nodes
      dummyEdges.addClass(DUMMY_LINK_HIDDEN_CLASS);
      dummyNodes.addClass(DUMMY_LINK_HIDDEN_CLASS);
    }
  }

  private syncButton(): void {
    const button = document.getElementById(DUMMY_TOGGLE_BUTTON_ID) as HTMLButtonElement | null;
    if (button) {
      button.dataset.visible = this.visible ? 'true' : 'false';
      button.dataset.selected = this.visible ? 'true' : 'false';
      button.setAttribute('aria-checked', this.visible ? 'true' : 'false');
    }
  }
}
