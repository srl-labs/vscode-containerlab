import * as vscode from 'vscode';
import * as fs from 'fs';

import { log } from '../../webview/platform/logging/logger';
import { EditorTemplateParams, ViewerTemplateParams } from '../html/HtmlGenerator';
import { customNodeConfigManager } from './CustomNodeConfigManager';
import { iconManager } from './IconManager';
import { runningLabsProvider } from '../../../extension';
import { ClabLabTreeNode } from '../../../treeView/common';
import { ClabTopology } from '../../shared/types/topoViewerType';
import { sleep } from '../../shared/utilities/AsyncUtils';
import * as utils from '../../../utils/index';

const CONFIG_SECTION = 'containerlab.editor';

// ============================================================================
// Template Params Context
// ============================================================================

export interface TemplateParamsContext {
  deploymentState: 'deployed' | 'undeployed' | 'unknown';
  lastYamlFilePath: string;
  currentClabTopo: ClabTopology | undefined;
}

// ============================================================================
// Panel Initialization Context
// ============================================================================

/* eslint-disable no-unused-vars */
export interface PanelInitContext {
  isViewMode: boolean;
  lastYamlFilePath: string;
  skipInitialValidation: boolean;
  cacheClabTreeDataToTopoviewer: Record<string, ClabLabTreeNode> | undefined;
  setLastYamlFilePath: (_p: string) => void;
  setSkipInitialValidation: (_v: boolean) => void;
  setCacheClabTreeData: (_d: Record<string, ClabLabTreeNode> | undefined) => void;
  validateYaml: (_c: string) => Promise<boolean>;
  buildDefaultLabYaml: (_n: string) => string;
  setInternalUpdate: (_v: boolean) => void;
}
/* eslint-enable no-unused-vars */

/**
 * Manages VS Code webview tab creation, initialization, and template parameter generation
 * for the TopoViewer Editor.
 *
 * Note: This is NOT the same as webview/platform/windowing/PanelManager which manages
 * floating windows INSIDE the webview. This class manages the VS Code webview tab container.
 */
class WebviewTabManager {
  // ============================================================================
  // HTML Utilities
  // ============================================================================

  escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ============================================================================
  // Template Params Generation
  // ============================================================================

  getViewerTemplateParams(ctx: TemplateParamsContext): Partial<ViewerTemplateParams> {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    const lockLabByDefault = config.get<boolean>('lockLabByDefault', true);
    return {
      deploymentState: ctx.deploymentState,
      viewerMode: 'viewer',
      currentLabPath: ctx.lastYamlFilePath,
      lockLabByDefault
    };
  }

  async getEditorTemplateParams(ctx: TemplateParamsContext): Promise<Partial<EditorTemplateParams>> {
    await utils.refreshDockerImages();
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    const lockLabByDefault = config.get<boolean>('lockLabByDefault', true);
    const legacyIfacePatternMapping = customNodeConfigManager.getLegacyInterfacePatternMapping(config);
    const updateLinkEndpointsOnKindChange = config.get<boolean>(
      'updateLinkEndpointsOnKindChange',
      true
    );
    const rawCustomNodes = config.get<unknown>('customNodes', []);
    const normalizedCustomNodes = Array.isArray(rawCustomNodes) ? rawCustomNodes : [];
    const customNodes = await customNodeConfigManager.ensureCustomNodeInterfacePatterns(
      config,
      normalizedCustomNodes,
      legacyIfacePatternMapping
    );
    const ifacePatternMapping = customNodeConfigManager.buildInterfacePatternMapping(
      customNodes,
      legacyIfacePatternMapping
    );
    const { defaultNode, defaultKind, defaultType } = customNodeConfigManager.getDefaultCustomNode(customNodes);
    const imageMapping = customNodeConfigManager.buildImageMapping(customNodes);
    const dockerImages = utils.getDockerImages();
    const customIcons = await iconManager.loadCustomIcons();
    return {
      imageMapping,
      ifacePatternMapping,
      defaultKind,
      defaultType,
      updateLinkEndpointsOnKindChange,
      dockerImages,
      customNodes,
      defaultNode,
      currentLabPath: ctx.lastYamlFilePath,
      topologyDefaults: ctx.currentClabTopo?.topology?.defaults || {},
      topologyKinds: ctx.currentClabTopo?.topology?.kinds || {},
      topologyGroups: ctx.currentClabTopo?.topology?.groups || {},
      lockLabByDefault,
      customIcons
    };
  }

  // ============================================================================
  // Panel Creation
  // ============================================================================

  createPanel(
    context: vscode.ExtensionContext,
    viewType: string,
    labName: string,
    column: vscode.ViewColumn | undefined
  ): vscode.WebviewPanel {
    const panel = vscode.window.createWebviewPanel(
      viewType,
      labName,
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(context.extensionUri, 'topoViewerData', labName),
          vscode.Uri.joinPath(context.extensionUri, 'dist'),
          vscode.Uri.joinPath(context.extensionUri, 'schema'),
        ],
        retainContextWhenHidden: true,
      }
    );
    const iconUri = vscode.Uri.joinPath(
      context.extensionUri,
      'resources',
      'containerlab.png'
    );
    panel.iconPath = iconUri;
    return panel;
  }

  // ============================================================================
  // Loading HTML
  // ============================================================================

  buildInitialLoadingHtml(labName: string): string {
    const safeLabName = this.escapeHtml(labName || 'Topology');
    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${safeLabName} – Loading TopoViewer</title>
    <style>
      :root {
        color-scheme: light dark;
      }
      body {
        margin: 0;
        padding: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background-color: var(--vscode-editor-background, #1e1e1e);
        color: var(--vscode-editor-foreground, #cccccc);
        font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
      }
      .container {
        text-align: center;
        max-width: 420px;
        padding: 2rem;
      }
      .spinner {
        width: 48px;
        height: 48px;
        border: 4px solid rgba(128, 128, 128, 0.25);
        border-top-color: var(--vscode-progressBar-background, #007acc);
        border-radius: 50%;
        margin: 0 auto 1.5rem;
        animation: spin 0.8s linear infinite;
      }
      h1 {
        font-size: 1.2rem;
        margin: 0 0 0.75rem;
        font-weight: 600;
      }
      p {
        margin: 0;
        font-size: 0.95rem;
        line-height: 1.5;
        color: var(--vscode-descriptionForeground, inherit);
      }
      @keyframes spin {
        from {
          transform: rotate(0deg);
        }
        to {
          transform: rotate(360deg);
        }
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="spinner" role="presentation" aria-hidden="true"></div>
      <h1>Loading TopoViewer…</h1>
      <p>Preparing topology data for <strong>${safeLabName}</strong>. This may take a moment on busy systems.</p>
    </div>
  </body>
</html>`;
  }

  setInitialLoadingContent(panel: vscode.WebviewPanel, labName: string): void {
    panel.webview.html = this.buildInitialLoadingHtml(labName);
  }

  // ============================================================================
  // Panel Data Initialization
  // ============================================================================

  async loadRunningLabData(): Promise<Record<string, ClabLabTreeNode> | undefined> {
    try {
      return await runningLabsProvider.discoverInspectLabs();
    } catch (err) {
      log.warn(`Failed to load running lab data: ${err}`);
      return undefined;
    }
  }

  // ============================================================================
  // YAML Loading
  // ============================================================================

  async loadYamlViewMode(
    fileUri: vscode.Uri,
    labName: string,
    ctx: PanelInitContext
  ): Promise<void> {
    log.info(`Creating panel in view mode for lab: ${labName}`);
    if (fileUri?.fsPath) {
      try {
        await fs.promises.readFile(fileUri.fsPath, 'utf8');
        ctx.setLastYamlFilePath(fileUri.fsPath);
        log.info('Read YAML file for view mode');
      } catch (err) {
        log.warn(`Could not read YAML in view mode: ${err}`);
        ctx.setLastYamlFilePath('');
      }
    }
    if (!ctx.lastYamlFilePath) {
      log.info('Using minimal YAML for view mode');
    }
    ctx.setSkipInitialValidation(true);
  }

  async loadYamlEditMode(
    fileUri: vscode.Uri,
    ctx: PanelInitContext
  ): Promise<void> {
    if (!fileUri?.fsPath) {
      throw new Error('No file URI provided for edit mode');
    }
    try {
      await vscode.workspace.fs.stat(fileUri);
      ctx.setLastYamlFilePath(fileUri.fsPath);
    } catch {
      if (ctx.lastYamlFilePath) {
        log.info(`Using cached file path: ${ctx.lastYamlFilePath}`);
      } else {
        throw new Error(`File not found: ${fileUri.fsPath}`);
      }
    }
    let yaml = await fs.promises.readFile(ctx.lastYamlFilePath, 'utf8');
    if (!yaml.trim()) {
      const baseName = require('path').basename(ctx.lastYamlFilePath);
      const labNameFromFile = baseName.replace(/\.clab\.(yml|yaml)$/i, '').replace(/\.(yml|yaml)$/i, '');
      const defaultContent = ctx.buildDefaultLabYaml(labNameFromFile);
      ctx.setInternalUpdate(true);
      await fs.promises.writeFile(ctx.lastYamlFilePath, defaultContent, 'utf8');
      await sleep(50);
      ctx.setInternalUpdate(false);
      yaml = defaultContent;
      log.info(`Populated empty YAML file with default topology: ${ctx.lastYamlFilePath}`);
    }
    if (!ctx.skipInitialValidation) {
      const isValid = await ctx.validateYaml(yaml);
      if (!isValid) {
        throw new Error('YAML validation failed. Aborting createWebviewPanel.');
      }
    }
  }

  async loadInitialYaml(
    fileUri: vscode.Uri,
    labName: string,
    ctx: PanelInitContext
  ): Promise<void> {
    if (ctx.isViewMode) {
      await this.loadYamlViewMode(fileUri, labName, ctx);
      return;
    }
    await this.loadYamlEditMode(fileUri, ctx);
  }

  // ============================================================================
  // File URI Utilities
  // ============================================================================

  normalizeFileUri(fileUri: vscode.Uri, lastYamlFilePath: string): vscode.Uri {
    if (lastYamlFilePath && fileUri.fsPath !== lastYamlFilePath) {
      const corrected = vscode.Uri.file(lastYamlFilePath);
      log.info(`Using corrected file path: ${corrected.fsPath}`);
      return corrected;
    }
    return fileUri;
  }

  revealIfPanelExists(
    currentPanel: vscode.WebviewPanel | undefined,
    column: vscode.ViewColumn | undefined
  ): boolean {
    if (!currentPanel) return false;
    currentPanel.reveal(column);
    return true;
  }
}

export const webviewTabManager = new WebviewTabManager();
