/**
 * SplitViewPanel - YAML and annotations display panel for dev mode
 *
 * Shows the current topology YAML and annotations JSON by fetching from server.
 */

import type { DevStateManager } from './DevState';

// ============================================================================
// Types
// ============================================================================

export interface SplitViewPanelConfig {
  panelId?: string;
  contentId?: string;
  yamlContentId?: string;
  annotationsContentId?: string;
}

// ============================================================================
// SplitViewPanel Class
// ============================================================================

export class SplitViewPanel {
  private stateManager: DevStateManager;
  private isOpen = false;
  private config: Required<SplitViewPanelConfig>;

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
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  getIsOpen(): boolean {
    return this.isOpen;
  }

  toggle(): void {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  open(): void {
    if (this.isOpen) return;

    this.isOpen = true;

    const panel = document.getElementById(this.config.panelId);
    const mainContent = document.getElementById(this.config.contentId);

    if (panel) panel.classList.add('open');
    if (mainContent) mainContent.classList.add('split-view-active');

    this.updateContent();
    this.updateButton();
    console.log('%c[Dev] Split view opened', 'color: #2196F3;');
  }

  close(): void {
    if (!this.isOpen) return;

    this.isOpen = false;

    const panel = document.getElementById(this.config.panelId);
    const mainContent = document.getElementById(this.config.contentId);

    if (panel) panel.classList.remove('open');
    if (mainContent) mainContent.classList.remove('split-view-active');

    this.updateButton();
    console.log('%c[Dev] Split view closed', 'color: #2196F3;');
  }

  /** Update content by fetching from server */
  updateContent(): void {
    if (!this.isOpen) return;

    const filename = this.stateManager.getCurrentFilePath();
    this.updateFilePathHeader(filename);

    if (filename) {
      this.fetchContentFromServer(filename);
    } else {
      this.showNoFileMessage();
    }
  }

  dispose(): void {
    // No cleanup needed
  }

  // --------------------------------------------------------------------------
  // Private
  // --------------------------------------------------------------------------

  private async fetchContentFromServer(filename: string): Promise<void> {
    const yamlContent = document.getElementById(this.config.yamlContentId);
    const annotationsContent = document.getElementById(this.config.annotationsContentId);

    try {
      // Fetch YAML
      const yamlRes = await fetch(`/api/topology/${encodeURIComponent(filename)}`);
      const yamlResult = await yamlRes.json();

      if (yamlContent) {
        yamlContent.textContent = yamlResult.success && yamlResult.data
          ? yamlResult.data.content
          : `# Error: ${yamlResult.error || 'Unknown error'}`;
      }

      // Fetch annotations
      const annotRes = await fetch(`/api/annotations/${encodeURIComponent(filename)}`);
      const annotResult = await annotRes.json();

      if (annotationsContent) {
        annotationsContent.textContent = annotResult.success && annotResult.data
          ? JSON.stringify(annotResult.data, null, 2)
          : '{}';
      }
    } catch (err) {
      console.error('[SplitView] Failed to fetch from server:', err);
      if (yamlContent) yamlContent.textContent = `# Error fetching content`;
      if (annotationsContent) annotationsContent.textContent = '{}';
    }
  }

  private showNoFileMessage(): void {
    const yamlContent = document.getElementById(this.config.yamlContentId);
    const annotationsContent = document.getElementById(this.config.annotationsContentId);

    if (yamlContent) yamlContent.textContent = '# No file loaded';
    if (annotationsContent) annotationsContent.textContent = '{}';
  }

  private updateFilePathHeader(filename: string | null): void {
    const filePathEl = document.getElementById('splitViewFilePath');
    if (filePathEl) {
      filePathEl.textContent = filename ? `File: ${filename}` : 'No file loaded';
    }
  }

  private updateButton(): void {
    const btn = document.getElementById('splitViewBtn');
    if (btn) btn.classList.toggle('active', this.isOpen);
  }
}
