/**
 * Watchers - Handles file system and docker image watching for ReactTopoViewer
 */

import * as vscode from "vscode";

import { log } from "../services/logger";
import { nodeFsAdapter } from "../../shared/io";
import { onDockerImagesUpdated } from "../../../utils/docker/images";

/**
 * Callback for loading topology data
 */
export type TopologyDataLoader = () => Promise<unknown>;

/**
 * Callback for posting topology data to webview
 */
export type TopologyDataPoster = (data: unknown) => void;

/**
 * Callback for notifying webview of external file change
 */
export type ExternalChangeNotifier = () => void;

/**
 * Callback for getting/setting internal update flag
 */
export interface InternalUpdateController {
  isInternalUpdate: () => boolean;
}

/**
 * Manages file system watchers and subscriptions for ReactTopoViewer
 */
export class WatcherManager {
  private fileWatcher: vscode.FileSystemWatcher | undefined;
  private saveListener: vscode.Disposable | undefined;
  private dockerImagesSubscription: vscode.Disposable | undefined;
  private lastYamlContent: string | undefined;
  private isRefreshingFromFile = false;
  private queuedRefresh = false;

  /**
   * Dispose all watchers and listeners
   */
  dispose(): void {
    if (this.fileWatcher) {
      this.fileWatcher.dispose();
      this.fileWatcher = undefined;
    }
    if (this.saveListener) {
      this.saveListener.dispose();
      this.saveListener = undefined;
    }
    if (this.dockerImagesSubscription) {
      this.dockerImagesSubscription.dispose();
      this.dockerImagesSubscription = undefined;
    }
  }

  /**
   * Set up filesystem watcher for YAML changes outside the webview
   */
  setupFileWatcher(
    yamlFilePath: string,
    updateController: InternalUpdateController,
    loadTopologyData: TopologyDataLoader,
    postTopologyData: TopologyDataPoster,
    notifyExternalChange?: ExternalChangeNotifier
  ): void {
    if (!yamlFilePath) return;

    this.fileWatcher?.dispose();
    const fileUri = vscode.Uri.file(yamlFilePath);
    this.fileWatcher = vscode.workspace.createFileSystemWatcher(fileUri.fsPath);

    this.fileWatcher.onDidChange(() => {
      void this.handleExternalYamlChange(
        "change",
        yamlFilePath,
        updateController,
        loadTopologyData,
        postTopologyData,
        notifyExternalChange
      );
    });
  }

  /**
   * Set up save listener for in-editor YAML edits
   */
  setupSaveListener(
    yamlFilePath: string,
    updateController: InternalUpdateController,
    loadTopologyData: TopologyDataLoader,
    postTopologyData: TopologyDataPoster,
    notifyExternalChange?: ExternalChangeNotifier
  ): void {
    if (!yamlFilePath) return;

    this.saveListener?.dispose();
    this.saveListener = vscode.workspace.onDidSaveTextDocument((doc) => {
      if (doc.uri.fsPath !== yamlFilePath) return;
      void this.handleExternalYamlChange(
        "save",
        yamlFilePath,
        updateController,
        loadTopologyData,
        postTopologyData,
        notifyExternalChange
      );
    });
  }

  /**
   * Set up docker images subscription for real-time updates
   */
  setupDockerImagesSubscription(panel: vscode.WebviewPanel): void {
    this.dockerImagesSubscription?.dispose();
    this.dockerImagesSubscription = onDockerImagesUpdated((images) => {
      panel.webview.postMessage({
        type: "docker-images-updated",
        dockerImages: images
      });
      log.info(`[ReactTopoViewer] Docker images updated, found ${images.length} images`);
    });
  }

  /**
   * Update the last known YAML content (for change detection)
   */
  setLastYamlContent(content: string): void {
    this.lastYamlContent = content;
  }

  /**
   * Reload topology data after external YAML edits and push to webview
   */
  private async handleExternalYamlChange(
    trigger: "change" | "save",
    yamlFilePath: string,
    updateController: InternalUpdateController,
    loadTopologyData: TopologyDataLoader,
    postTopologyData: TopologyDataPoster,
    notifyExternalChange?: ExternalChangeNotifier
  ): Promise<void> {
    if (!yamlFilePath) return;
    if (updateController.isInternalUpdate()) {
      log.debug(`[ReactTopoViewer] Ignoring ${trigger} event during internal update`);
      return;
    }

    if (this.isRefreshingFromFile) {
      this.queuedRefresh = true;
      return;
    }

    this.isRefreshingFromFile = true;
    try {
      const currentContent = await nodeFsAdapter.readFile(yamlFilePath);
      if (this.lastYamlContent === currentContent) {
        log.debug(
          `[ReactTopoViewer] YAML ${trigger} detected but content unchanged, skipping refresh`
        );
        return;
      }

      log.info(`[ReactTopoViewer] YAML ${trigger} detected, refreshing topology`);

      // Notify webview of external change (to clear undo history)
      notifyExternalChange?.();

      const topologyData = await loadTopologyData();
      if (topologyData) {
        postTopologyData(topologyData);
      }
    } catch (err) {
      log.error(`[ReactTopoViewer] Failed to refresh after YAML ${trigger}: ${err}`);
    } finally {
      this.isRefreshingFromFile = false;
      if (this.queuedRefresh) {
        this.queuedRefresh = false;
        void this.handleExternalYamlChange(
          trigger,
          yamlFilePath,
          updateController,
          loadTopologyData,
          postTopologyData,
          notifyExternalChange
        );
      }
    }
  }
}
