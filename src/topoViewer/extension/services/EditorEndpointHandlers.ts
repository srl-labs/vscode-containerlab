import * as vscode from 'vscode';
import { promises as fsPromises } from 'fs';
import * as YAML from 'yaml';

import { log } from '../../webview/platform/logging/logger';
import { saveViewport } from './SaveViewport';
import { yamlSettingsManager } from './YamlSettingsManager';
import { annotationsManager } from './AnnotationsFile';
import { iconManager } from './IconManager';
import { customNodeConfigManager } from './CustomNodeConfigManager';
import { simpleEndpointHandlers } from './SimpleEndpointHandlers';
import { splitViewManager } from './SplitViewManager';
import { resolveNodeConfig } from '../../webview/core/nodeConfig';
import { sleep } from '../../shared/utilities/AsyncUtils';
import { TopoViewerAdaptorClab } from './TopologyAdapter';
import * as utils from '../../../utils/index';

/**
 * Context interface for endpoint handlers that need access to EditorProvider state
 */
/* eslint-disable no-unused-vars */
export interface EndpointHandlerContext {
  lastYamlFilePath: string;
  currentLabName: string;
  adaptor: TopoViewerAdaptorClab;
  context: vscode.ExtensionContext;
  currentPanel: vscode.WebviewPanel | undefined;
  isInternalUpdate: boolean;
  setInternalUpdate: (_v: boolean) => void;
  updateCachedYaml: () => Promise<void>;
  postMessage: (_msg: unknown) => void;
}
/* eslint-enable no-unused-vars */

type EndpointResult = { result: unknown; error: string | null };

/**
 * Consolidated endpoint handlers for the TopoViewer Editor.
 * Groups viewport, settings, annotations, icons, and other endpoint handlers.
 */
class EditorEndpointHandlers {
  // ============================================================================
  // Viewport Handlers
  // ============================================================================

  async handleViewportSaveEndpoint(
    payload: string | undefined,
    ctx: EndpointHandlerContext
  ): Promise<EndpointResult> {
    try {
      await saveViewport({
        yamlFilePath: ctx.lastYamlFilePath,
        payload: payload as string,
        mode: 'view'
      });
      const result = 'Saved viewport positions successfully.';
      log.info(result);
      return { result, error: null };
    } catch (err) {
      log.error(`Error executing endpoint "topo-viewport-save": ${JSON.stringify(err, null, 2)}`);
      return { result: null, error: null };
    }
  }

  async handleViewportSaveEditEndpoint(
    payload: string | undefined,
    ctx: EndpointHandlerContext
  ): Promise<EndpointResult> {
    try {
      await saveViewport({
        adaptor: ctx.adaptor,
        yamlFilePath: ctx.lastYamlFilePath,
        payload: payload as string,
        mode: 'edit',
        setInternalUpdate: ctx.setInternalUpdate
      });
      await ctx.updateCachedYaml();
      const result = 'Saved topology with preserved comments!';
      log.info(result);
      return { result, error: null };
    } catch (err) {
      log.error(`Error executing endpoint "topo-editor-viewport-save": ${JSON.stringify(err, null, 2)}`);
      ctx.setInternalUpdate(false);
      return { result: null, error: null };
    }
  }

  async handleViewportSaveSuppressNotificationEndpoint(
    payload: string | undefined,
    ctx: EndpointHandlerContext
  ): Promise<EndpointResult> {
    try {
      await saveViewport({
        adaptor: ctx.adaptor,
        yamlFilePath: ctx.lastYamlFilePath,
        payload: payload as string,
        mode: 'edit',
        setInternalUpdate: ctx.setInternalUpdate
      });
      await ctx.updateCachedYaml();
      return { result: null, error: null };
    } catch (err) {
      const result = 'Error executing endpoint "topo-editor-viewport-save-suppress-notification".';
      log.error(
        `Error executing endpoint "topo-editor-viewport-save-suppress-notification": ${JSON.stringify(err, null, 2)}`
      );
      ctx.setInternalUpdate(false);
      return { result, error: null };
    }
  }

  // ============================================================================
  // Lab Settings Handlers
  // ============================================================================

  async updateLabSettings(
    settings: any,
    ctx: EndpointHandlerContext
  ): Promise<{ success: boolean; yamlContent?: string; error?: string }> {
    try {
      const yamlContent = await fsPromises.readFile(ctx.lastYamlFilePath, 'utf8');
      const doc = YAML.parseDocument(yamlContent, { keepCstNodes: true } as any);
      const { hadPrefix, hadMgmt } = yamlSettingsManager.applyExistingSettings(doc, settings);
      let updatedYaml = doc.toString();
      updatedYaml = yamlSettingsManager.insertMissingSettings(updatedYaml, settings, hadPrefix, hadMgmt);
      ctx.setInternalUpdate(true);
      await fsPromises.writeFile(ctx.lastYamlFilePath, updatedYaml, 'utf8');
      ctx.postMessage({
        type: 'yaml-content-updated',
        yamlContent: updatedYaml,
      });
      ctx.setInternalUpdate(false);
      return { success: true, yamlContent: updatedYaml };
    } catch (err) {
      ctx.setInternalUpdate(false);
      log.error(`Error updating lab settings: ${err}`);
      vscode.window.showErrorMessage(`Failed to update lab settings: ${err}`);
      return { success: false, error: String(err) };
    }
  }

  async handleLabSettingsGetEndpoint(
    ctx: EndpointHandlerContext
  ): Promise<EndpointResult> {
    try {
      const yamlContent = await fsPromises.readFile(ctx.lastYamlFilePath, 'utf8');
      const parsed = YAML.parse(yamlContent) as any;
      const settings = { name: parsed.name, prefix: parsed.prefix, mgmt: parsed.mgmt };
      log.info('Lab settings retrieved successfully');
      return { result: { success: true, settings }, error: null };
    } catch (err) {
      log.error(`Error getting lab settings: ${err}`);
      return { result: { success: false, error: String(err) }, error: null };
    }
  }

  async handleLabSettingsUpdateEndpoint(
    payload: string | undefined,
    payloadObj: any,
    ctx: EndpointHandlerContext
  ): Promise<EndpointResult> {
    const settings = typeof payload === 'string' ? JSON.parse(payload) : payloadObj;
    const res = await this.updateLabSettings(settings, ctx);
    return {
      result: res.success ? { success: true, yamlContent: res.yamlContent } : { success: false, error: res.error },
      error: null
    };
  }

  // ============================================================================
  // Viewer Settings Handlers
  // ============================================================================

  async handleLoadViewerSettingsEndpoint(
    ctx: EndpointHandlerContext
  ): Promise<EndpointResult> {
    try {
      const annotations = await annotationsManager.loadAnnotations(ctx.lastYamlFilePath);
      const viewerSettings = (annotations as any).viewerSettings || {};
      return { result: { viewerSettings }, error: null };
    } catch (err) {
      log.error(`Error loading viewer settings: ${JSON.stringify(err, null, 2)}`);
      return { result: { viewerSettings: {} }, error: null };
    }
  }

  async handleSaveViewerSettingsEndpoint(
    payloadObj: any,
    ctx: EndpointHandlerContext
  ): Promise<EndpointResult> {
    try {
      const data = payloadObj;
      const existing = await annotationsManager.loadAnnotations(ctx.lastYamlFilePath);
      const merged = {
        ...existing,
        viewerSettings: {
          ...(existing as any).viewerSettings,
          ...(data?.viewerSettings || {})
        }
      } as any;
      await annotationsManager.saveAnnotations(ctx.lastYamlFilePath, merged);
      log.info('Saved viewer settings');
      return { result: { success: true }, error: null };
    } catch (err) {
      const error = `Error saving viewer settings: ${err}`;
      log.error(`Error saving viewer settings: ${JSON.stringify(err, null, 2)}`);
      return { result: null, error };
    }
  }

  // ============================================================================
  // Annotation Handlers
  // ============================================================================

  async handleLoadAnnotationsEndpoint(
    ctx: EndpointHandlerContext
  ): Promise<EndpointResult> {
    try {
      const annotations = await annotationsManager.loadAnnotations(ctx.lastYamlFilePath);
      const result = {
        annotations: annotations.freeTextAnnotations || [],
        freeShapeAnnotations: annotations.freeShapeAnnotations || [],
        groupStyles: annotations.groupStyleAnnotations || []
      };
      log.info(
        `Loaded ${annotations.freeTextAnnotations?.length || 0} text annotations, ` +
        `${annotations.freeShapeAnnotations?.length || 0} shape annotations, and ` +
        `${annotations.groupStyleAnnotations?.length || 0} group styles`
      );
      return { result, error: null };
    } catch (err) {
      log.error(`Error loading annotations: ${JSON.stringify(err, null, 2)}`);
      return { result: { annotations: [], freeShapeAnnotations: [], groupStyles: [] }, error: null };
    }
  }

  async handleSaveAnnotationsEndpoint(
    payloadObj: any,
    ctx: EndpointHandlerContext
  ): Promise<EndpointResult> {
    try {
      const data = payloadObj;
      const existing = await annotationsManager.loadAnnotations(ctx.lastYamlFilePath);
      await annotationsManager.saveAnnotations(ctx.lastYamlFilePath, {
        freeTextAnnotations: data.annotations !== undefined ? data.annotations : existing.freeTextAnnotations,
        freeShapeAnnotations: data.freeShapeAnnotations !== undefined ? data.freeShapeAnnotations : existing.freeShapeAnnotations,
        groupStyleAnnotations: data.groupStyles !== undefined ? data.groupStyles : existing.groupStyleAnnotations,
        cloudNodeAnnotations: existing.cloudNodeAnnotations,
        nodeAnnotations: existing.nodeAnnotations,
        viewerSettings: (existing as any).viewerSettings
      });
      log.info(
        `Saved ${data.annotations?.length || 0} text annotations, ` +
        `${data.freeShapeAnnotations?.length || 0} shape annotations, and ` +
        `${data.groupStyles?.length || 0} group styles`
      );
      return { result: { success: true }, error: null };
    } catch (err) {
      const error = `Error saving annotations: ${err}`;
      log.error(`Error saving annotations: ${JSON.stringify(err, null, 2)}`);
      return { result: null, error };
    }
  }

  // ============================================================================
  // Icon Handlers
  // ============================================================================

  async handleUploadIconEndpoint(): Promise<EndpointResult> {
    try {
      const uploadSource = await iconManager.promptIconUploadSource();
      if (!uploadSource) {
        return { result: { cancelled: true }, error: null };
      }

      const selection = await vscode.window.showOpenDialog(
        iconManager.getIconPickerOptions(uploadSource)
      );
      if (!selection || selection.length === 0) {
        return { result: { cancelled: true }, error: null };
      }

      const { name } = await iconManager.importCustomIcon(selection[0]);
      const customIcons = await iconManager.loadCustomIcons();
      void vscode.window.showInformationMessage(`Added custom icon "${name}".`);
      return { result: { success: true, customIcons, lastAddedIcon: name }, error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error(`Failed to import custom icon: ${message}`);
      void vscode.window.showErrorMessage(`Failed to add custom icon: ${message}`);
      return { result: null, error: message };
    }
  }

  async handleDeleteIconEndpoint(payloadObj: any): Promise<EndpointResult> {
    try {
      const iconName = typeof payloadObj?.iconName === 'string' ? payloadObj.iconName.trim() : '';
      if (!iconName) {
        throw new Error('Icon name is required.');
      }
      const removed = await iconManager.deleteCustomIcon(iconName);
      if (!removed) {
        throw new Error(`Custom icon "${iconName}" was not found.`);
      }
      const customIcons = await iconManager.loadCustomIcons();
      void vscode.window.showInformationMessage(`Deleted custom icon "${iconName}".`);
      return { result: { success: true, customIcons, deletedIcon: iconName }, error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error(`Failed to delete custom icon: ${message}`);
      void vscode.window.showErrorMessage(`Failed to delete custom icon: ${message}`);
      return { result: null, error: message };
    }
  }

  // ============================================================================
  // Node Config Handler
  // ============================================================================

  async handleGetNodeConfigEndpoint(
    payloadObj: any,
    ctx: EndpointHandlerContext
  ): Promise<EndpointResult> {
    try {
      const nodeName = typeof payloadObj === 'string' ? payloadObj : payloadObj?.node || payloadObj?.nodeName;
      if (!nodeName) {
        throw new Error('Node name is required');
      }
      if (!ctx.lastYamlFilePath) {
        throw new Error('No lab YAML file loaded');
      }
      const yamlContent = await fsPromises.readFile(ctx.lastYamlFilePath, 'utf8');
      const topo = YAML.parse(yamlContent) as any;
      ctx.adaptor.currentClabTopo = topo;
      const nodeObj = topo.topology?.nodes?.[nodeName] || {};
      const mergedNode = resolveNodeConfig(topo as any, nodeObj || {});
      const nodePropKeys = new Set(Object.keys(nodeObj || {}));
      const inheritedProps = Object.keys(mergedNode).filter(k => !nodePropKeys.has(k));
      log.info(`Node config retrieved for ${nodeName}`);
      return { result: { ...mergedNode, inherited: inheritedProps }, error: null };
    } catch (err) {
      const error = `Failed to get node config: ${err instanceof Error ? err.message : String(err)}`;
      log.error(error);
      return { result: null, error };
    }
  }

  // ============================================================================
  // Undo Handler
  // ============================================================================

  async handleUndoEndpoint(ctx: EndpointHandlerContext): Promise<EndpointResult> {
    try {
      const document = await vscode.workspace.openTextDocument(ctx.lastYamlFilePath);
      const currentActiveEditor = vscode.window.activeTextEditor;
      const existingEditor = vscode.window.visibleTextEditors.find(
        editor => editor.document.uri.fsPath === document.uri.fsPath
      );
      if (existingEditor) {
        await vscode.window.showTextDocument(document, {
          viewColumn: existingEditor.viewColumn,
          preview: false,
          preserveFocus: false
        });
      } else {
        const targetColumn = vscode.ViewColumn.Beside;
        await vscode.window.showTextDocument(document, {
          viewColumn: targetColumn,
          preview: false,
          preserveFocus: false
        });
      }
      await sleep(50);
      await vscode.commands.executeCommand('undo');
      await document.save();
      if (currentActiveEditor && !existingEditor) {
        await vscode.window.showTextDocument(currentActiveEditor.document, {
          viewColumn: currentActiveEditor.viewColumn,
          preview: false,
          preserveFocus: false
        });
      }
      const result = 'Undo operation completed successfully';
      log.info('Undo operation executed on YAML file');
      return { result, error: null };
    } catch (err) {
      const result = 'Error executing undo operation';
      log.error(`Error executing undo operation: ${JSON.stringify(err, null, 2)}`);
      return { result, error: null };
    }
  }

  // ============================================================================
  // Docker Images Handler
  // ============================================================================

  async handleRefreshDockerImagesEndpoint(): Promise<EndpointResult> {
    try {
      await utils.refreshDockerImages();
      const dockerImages = utils.getDockerImages();
      log.info(`Docker images refreshed, found ${dockerImages.length} images`);
      return { result: { success: true, dockerImages }, error: null };
    } catch (err) {
      const error = `Error refreshing docker images: ${err}`;
      log.error(`Error refreshing docker images: ${JSON.stringify(err, null, 2)}`);
      return { result: null, error };
    }
  }

  // ============================================================================
  // Split View Handler
  // ============================================================================

  async handleToggleSplitViewEndpoint(ctx: EndpointHandlerContext): Promise<EndpointResult> {
    const isOpen = await splitViewManager.toggleSplitView(ctx.lastYamlFilePath, ctx.currentPanel);
    log.info(`Split view toggled: ${isOpen ? 'opened' : 'closed'}`);
    return { result: { splitViewOpen: isOpen }, error: null };
  }

  // ============================================================================
  // Custom Node Handlers (delegating to customNodeConfigManager)
  // ============================================================================

  async handleSaveCustomNodeEndpoint(payloadObj: any): Promise<EndpointResult> {
    return customNodeConfigManager.saveCustomNode(payloadObj);
  }

  async handleSetDefaultCustomNodeEndpoint(payloadObj: any): Promise<EndpointResult> {
    const data = payloadObj as { name?: string };
    return customNodeConfigManager.setDefaultCustomNode(data?.name || '');
  }

  async handleDeleteCustomNodeEndpoint(payloadObj: any): Promise<EndpointResult> {
    return customNodeConfigManager.deleteCustomNode(payloadObj?.name || '');
  }

  // ============================================================================
  // Simple Handlers (delegating to simpleEndpointHandlers)
  // ============================================================================

  async handleShowErrorMessageEndpoint(payload: string | undefined): Promise<EndpointResult> {
    return simpleEndpointHandlers.handleShowErrorMessageEndpoint(payload);
  }

  async handlePerformanceMetricsEndpoint(
    payload: string | undefined,
    payloadObj: any
  ): Promise<EndpointResult> {
    return simpleEndpointHandlers.handlePerformanceMetricsEndpoint(payload, payloadObj);
  }

  async handleShowVscodeMessageEndpoint(payload: string | undefined): Promise<EndpointResult> {
    return simpleEndpointHandlers.handleShowVscodeMessageEndpoint(payload);
  }

  async handleOpenExternalEndpoint(payload: string | undefined): Promise<EndpointResult> {
    return simpleEndpointHandlers.handleOpenExternalEndpoint(payload);
  }

  async handleOpenExternalLinkEndpoint(payload: string | undefined): Promise<EndpointResult> {
    return simpleEndpointHandlers.handleOpenExternalLinkEndpoint(payload);
  }

  async handleShowErrorEndpoint(payloadObj: any): Promise<EndpointResult> {
    return simpleEndpointHandlers.handleShowErrorEndpoint(payloadObj);
  }

  async handleCopyElementsEndpoint(
    ctx: vscode.ExtensionContext,
    payloadObj: any
  ): Promise<EndpointResult> {
    return simpleEndpointHandlers.handleCopyElementsEndpoint(ctx, payloadObj);
  }

  async handleGetCopiedElementsEndpoint(
    ctx: vscode.ExtensionContext,
    panel: vscode.WebviewPanel
  ): Promise<EndpointResult> {
    return simpleEndpointHandlers.handleGetCopiedElementsEndpoint(ctx, panel);
  }

  async handleDebugLogEndpoint(payloadObj: any): Promise<EndpointResult> {
    return simpleEndpointHandlers.handleDebugLogEndpoint(payloadObj);
  }
}

export const editorEndpointHandlers = new EditorEndpointHandlers();
