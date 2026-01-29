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
export type SnapshotLoader = () => Promise<unknown>;

/**
 * Callback for posting topology data to webview
 */
export type SnapshotPoster = (data: unknown) => void;

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
  private annotationsWatcher: vscode.FileSystemWatcher | undefined;
  private saveListener: vscode.Disposable | undefined;
  private dockerImagesSubscription: vscode.Disposable | undefined;
  private lastYamlContent: string | undefined;
  private lastAnnotationsContent: string | undefined;
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
    if (this.annotationsWatcher) {
      this.annotationsWatcher.dispose();
      this.annotationsWatcher = undefined;
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
    loadSnapshot: SnapshotLoader,
    postSnapshot: SnapshotPoster
  ): void {
    if (!yamlFilePath) return;

    this.fileWatcher?.dispose();
    this.annotationsWatcher?.dispose();
    const fileUri = vscode.Uri.file(yamlFilePath);
    this.fileWatcher = vscode.workspace.createFileSystemWatcher(fileUri.fsPath);

    // Initialize content caches to prevent false-positive external change detection
    void this.initializeContentCaches(yamlFilePath);

    this.fileWatcher.onDidChange(() => {
      void this.handleExternalYamlChange(
        "change",
        yamlFilePath,
        updateController,
        loadSnapshot,
        postSnapshot
      );
    });

    const annotationsPath = `${yamlFilePath}.annotations.json`;
    this.annotationsWatcher = vscode.workspace.createFileSystemWatcher(annotationsPath);
    const handleAnnotations = (trigger: "change" | "create" | "delete") => {
      void this.handleExternalAnnotationsChange(
        trigger,
        annotationsPath,
        updateController,
        loadSnapshot,
        postSnapshot
      );
    };
    this.annotationsWatcher.onDidChange(() => handleAnnotations("change"));
    this.annotationsWatcher.onDidCreate(() => handleAnnotations("create"));
    this.annotationsWatcher.onDidDelete(() => handleAnnotations("delete"));
  }

  /**
   * Initialize content caches with current file contents
   * This prevents the first internal save from being detected as an external change
   */
  private async initializeContentCaches(yamlFilePath: string): Promise<void> {
    try {
      this.lastYamlContent = await nodeFsAdapter.readFile(yamlFilePath);
    } catch {
      this.lastYamlContent = undefined;
    }

    const annotationsPath = `${yamlFilePath}.annotations.json`;
    try {
      this.lastAnnotationsContent = await nodeFsAdapter.readFile(annotationsPath);
    } catch {
      this.lastAnnotationsContent = undefined;
    }
  }

  /**
   * Set up save listener for in-editor YAML edits
   */
  setupSaveListener(
    yamlFilePath: string,
    updateController: InternalUpdateController,
    loadSnapshot: SnapshotLoader,
    postSnapshot: SnapshotPoster
  ): void {
    if (!yamlFilePath) return;

    this.saveListener?.dispose();
    this.saveListener = vscode.workspace.onDidSaveTextDocument((doc) => {
      if (doc.uri.fsPath !== yamlFilePath) return;
      void this.handleExternalYamlChange(
        "save",
        yamlFilePath,
        updateController,
        loadSnapshot,
        postSnapshot
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
   * Reload topology data after external YAML edits and push to webview
   */
  private async handleExternalYamlChange(
    trigger: "change" | "save",
    yamlFilePath: string,
    updateController: InternalUpdateController,
    loadSnapshot: SnapshotLoader,
    postSnapshot: SnapshotPoster
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

      const snapshot = await loadSnapshot();
      if (snapshot) {
        postSnapshot(snapshot);
      }
      this.lastYamlContent = currentContent;
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
          loadSnapshot,
          postSnapshot
        );
      }
    }
  }

  /**
   * Reload topology data after external annotations edits and push to webview
   */
  private async handleExternalAnnotationsChange(
    trigger: "change" | "create" | "delete",
    annotationsPath: string,
    updateController: InternalUpdateController,
    loadSnapshot: SnapshotLoader,
    postSnapshot: SnapshotPoster
  ): Promise<void> {
    if (!annotationsPath) return;
    if (updateController.isInternalUpdate()) {
      log.debug(`[ReactTopoViewer] Ignoring annotations ${trigger} during internal update`);
      return;
    }

    if (this.isRefreshingFromFile) {
      this.queuedRefresh = true;
      return;
    }

    this.isRefreshingFromFile = true;
    try {
      let currentContent = "";
      try {
        currentContent = await nodeFsAdapter.readFile(annotationsPath);
      } catch {
        currentContent = "";
      }

      if (this.lastAnnotationsContent === currentContent) {
        log.debug(
          `[ReactTopoViewer] Annotations ${trigger} detected but content unchanged, skipping refresh`
        );
        return;
      }

      log.info(`[ReactTopoViewer] Annotations ${trigger} detected, refreshing topology`);

      const snapshot = await loadSnapshot();
      if (snapshot) {
        postSnapshot(snapshot);
      }

      this.lastAnnotationsContent = currentContent;
    } catch (err) {
      log.error(`[ReactTopoViewer] Failed to refresh after annotations ${trigger}: ${err}`);
    } finally {
      this.isRefreshingFromFile = false;
      if (this.queuedRefresh) {
        this.queuedRefresh = false;
        void this.handleExternalAnnotationsChange(
          trigger,
          annotationsPath,
          updateController,
          loadSnapshot,
          postSnapshot
        );
      }
    }
  }
}
