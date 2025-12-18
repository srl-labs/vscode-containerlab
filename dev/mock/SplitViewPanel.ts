/**
 * SplitViewPanel - YAML and annotations display panel for dev mode
 *
 * Shows the current topology as YAML and annotations as JSON
 * in a side panel, similar to the real extension's split view.
 */

import type { DevStateManager } from './DevState';
import type { CyElement } from '../../src/reactTopoViewer/shared/types/topology';

// ============================================================================
// Types
// ============================================================================

export interface SplitViewPanelConfig {
  /** ID of the panel container element */
  panelId?: string;
  /** ID of the main content element */
  contentId?: string;
  /** ID of the YAML content element */
  yamlContentId?: string;
  /** ID of the annotations content element */
  annotationsContentId?: string;
}

// ============================================================================
// YAML Generator
// ============================================================================

/**
 * Generate containerlab YAML from Cytoscape elements
 */
export function generateYamlFromElements(
  elements: CyElement[],
  labName = 'dev-topology'
): string {
  const nodes = elements.filter(el => el.group === 'nodes');
  const edges = elements.filter(el => el.group === 'edges');

  // Build nodes section
  const nodesYaml = nodes
    .map(node => {
      const data = node.data;
      const lines = [`    ${data.id}:`];
      if (data.kind) lines.push(`      kind: ${data.kind}`);
      if (data.type) lines.push(`      type: ${data.type}`);
      if (data.image) lines.push(`      image: ${data.image}`);
      return lines.join('\n');
    })
    .join('\n');

  // Build links section
  const linksYaml = edges
    .map(edge => {
      const data = edge.data;
      const srcEp = data.sourceEndpoint || 'eth1';
      const tgtEp = data.targetEndpoint || 'eth1';
      return `    - endpoints: ["${data.source}:${srcEp}", "${data.target}:${tgtEp}"]`;
    })
    .join('\n');

  return `# Containerlab Topology
# Generated from mock data for development
name: ${labName}

topology:
  nodes:
${nodesYaml || '    # No nodes defined'}

  links:
${linksYaml || '    # No links defined'}
`;
}

// ============================================================================
// SplitViewPanel Class
// ============================================================================

export class SplitViewPanel {
  private stateManager: DevStateManager;
  private isOpen = false;
  private config: Required<SplitViewPanelConfig>;
  private unsubscribe: (() => void) | null = null;

  constructor(
    stateManager: DevStateManager,
    config: SplitViewPanelConfig = {}
  ) {
    this.stateManager = stateManager;
    this.config = {
      panelId: config.panelId || 'splitViewPanel',
      contentId: config.contentId || 'root',
      yamlContentId: config.yamlContentId || 'yamlContent',
      annotationsContentId: config.annotationsContentId || 'annotationsContent'
    };

    // Subscribe to state changes
    this.unsubscribe = stateManager.subscribe(() => {
      if (this.isOpen) {
        this.updateContent();
      }
    });
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /** Check if panel is open */
  getIsOpen(): boolean {
    return this.isOpen;
  }

  /** Toggle the panel */
  toggle(): void {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  /** Open the panel */
  open(): void {
    if (this.isOpen) return;

    this.isOpen = true;
    this.stateManager.setSplitViewOpen(true);

    const panel = document.getElementById(this.config.panelId);
    const mainContent = document.getElementById(this.config.contentId);

    if (panel) {
      panel.classList.add('open');
    }
    if (mainContent) {
      mainContent.classList.add('split-view-active');
    }

    this.updateContent();
    this.updateButton();
    console.log('%c[Dev] Split view opened', 'color: #2196F3;');
  }

  /** Close the panel */
  close(): void {
    if (!this.isOpen) return;

    this.isOpen = false;
    this.stateManager.setSplitViewOpen(false);

    const panel = document.getElementById(this.config.panelId);
    const mainContent = document.getElementById(this.config.contentId);

    if (panel) {
      panel.classList.remove('open');
    }
    if (mainContent) {
      mainContent.classList.remove('split-view-active');
    }

    this.updateButton();
    console.log('%c[Dev] Split view closed', 'color: #2196F3;');
  }

  /** Update the content - fetches from disk if a file is loaded */
  updateContent(): void {
    if (!this.isOpen) return;

    const state = this.stateManager.getState();
    const filename = state.currentFilePath;

    // Update file path header
    this.updateFilePathHeader(filename);

    if (filename) {
      // Fetch from disk
      this.fetchContentFromDisk(filename);
    } else {
      // Generate from memory (legacy behavior)
      this.updateContentFromMemory(state);
    }
  }

  /** Update content by fetching from disk */
  private async fetchContentFromDisk(filename: string): Promise<void> {
    try {
      // Fetch YAML
      const yamlRes = await fetch(`/api/topology/${encodeURIComponent(filename)}`);
      const yamlResult = await yamlRes.json();

      const yamlContent = document.getElementById(this.config.yamlContentId);
      if (yamlContent) {
        if (yamlResult.success && yamlResult.data) {
          yamlContent.textContent = yamlResult.data.content;
        } else {
          yamlContent.textContent = `# Error loading YAML: ${yamlResult.error || 'Unknown error'}`;
        }
      }

      // Fetch annotations
      const annotRes = await fetch(`/api/annotations/${encodeURIComponent(filename)}`);
      const annotResult = await annotRes.json();

      const annotationsContent = document.getElementById(this.config.annotationsContentId);
      if (annotationsContent) {
        if (annotResult.success && annotResult.data) {
          annotationsContent.textContent = JSON.stringify(annotResult.data, null, 2);
        } else {
          annotationsContent.textContent = '{}';
        }
      }
    } catch (err) {
      console.error('[SplitView] Failed to fetch from disk:', err);
      // Fallback to memory
      this.updateContentFromMemory(this.stateManager.getState());
    }
  }

  /** Update content from memory (original behavior) */
  private updateContentFromMemory(state: ReturnType<typeof this.stateManager.getState>): void {
    // Update YAML content
    const yaml = generateYamlFromElements(state.currentElements, state.labName);
    const yamlContent = document.getElementById(this.config.yamlContentId);
    if (yamlContent) {
      yamlContent.textContent = yaml;
    }

    // Update annotations JSON
    const annotationsContent = document.getElementById(this.config.annotationsContentId);
    if (annotationsContent) {
      annotationsContent.textContent = JSON.stringify(state.currentAnnotations, null, 2);
    }
  }

  /** Update file path display in header */
  private updateFilePathHeader(filename: string | null): void {
    const filePathEl = document.getElementById('splitViewFilePath');
    if (filePathEl) {
      filePathEl.textContent = filename ? `File: ${filename}` : 'No file loaded';
    }
  }

  /** Cleanup */
  dispose(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  // --------------------------------------------------------------------------
  // Private
  // --------------------------------------------------------------------------

  private updateButton(): void {
    const btn = document.getElementById('splitViewBtn');
    if (btn) {
      btn.classList.toggle('active', this.isOpen);
    }
  }

  // --------------------------------------------------------------------------
  // Static Utilities
  // --------------------------------------------------------------------------

  /**
   * Get YAML string for current state
   */
  getYaml(): string {
    const state = this.stateManager.getState();
    return generateYamlFromElements(state.currentElements, state.labName);
  }

  /**
   * Get annotations JSON string
   */
  getAnnotationsJson(): string {
    const state = this.stateManager.getState();
    return JSON.stringify(state.currentAnnotations, null, 2);
  }

  /**
   * Copy YAML to clipboard
   */
  async copyYamlToClipboard(): Promise<void> {
    const yaml = this.getYaml();
    try {
      await navigator.clipboard.writeText(yaml);
      console.log('%c[Dev] YAML copied to clipboard', 'color: #4CAF50;');
    } catch (e) {
      console.error('Failed to copy YAML:', e);
    }
  }

  /**
   * Copy annotations to clipboard
   */
  async copyAnnotationsToClipboard(): Promise<void> {
    const json = this.getAnnotationsJson();
    try {
      await navigator.clipboard.writeText(json);
      console.log('%c[Dev] Annotations copied to clipboard', 'color: #4CAF50;');
    } catch (e) {
      console.error('Failed to copy annotations:', e);
    }
  }
}
