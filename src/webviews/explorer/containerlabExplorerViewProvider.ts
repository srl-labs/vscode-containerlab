import * as vscode from "vscode";
import {
  buildExplorerSnapshot,
  type ExplorerActionInvocation,
  type ExplorerSnapshotOptions,
  type ExplorerSnapshotProviders
} from "@srl-labs/clab-ui/explorer/snapshot";
import {
  EXPLORER_SECTION_LABELS,
  EXPLORER_SECTION_ORDER,
  type ExplorerIncomingMessage,
  type ExplorerInvokeActionMessage,
  type ExplorerOutgoingMessage,
  type ExplorerPersistUiStateMessage,
  type ExplorerSetFilterMessage,
  type ExplorerSnapshotMessage,
  type ExplorerUiState
} from "../shared/explorer/types";

import { hideNonOwnedLabsState } from "../../globals";
import type {
  HelpFeedbackProvider,
  LocalLabTreeDataProvider,
  RunningLabTreeDataProvider
} from "../../treeView";

import {
  type ExplorerCommandMetadata,
  getExplorerCommandMetadata,
  invalidateExplorerContributionCache
} from "./explorerSnapshotAdapter";
import { createReactWebviewHtml } from "../shared/reactWebviewHtml";

const REFRESH_DEBOUNCE_MS = 120;
const UI_STATE_KEY = "containerlabExplorer.uiState";
const FILTER_STATE_KEY = "containerlabExplorer.filterText";

interface FilterableTreeProvider {
  setTreeFilter(filterText: string): void;
  clearTreeFilter(): void;
  onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void>;
}

function isSetFilterMessage(message: ExplorerOutgoingMessage): message is ExplorerSetFilterMessage {
  return message.command === "setFilter";
}

function isInvokeActionMessage(
  message: ExplorerOutgoingMessage
): message is ExplorerInvokeActionMessage {
  return message.command === "invokeAction";
}

function isPersistUiStateMessage(
  message: ExplorerOutgoingMessage
): message is ExplorerPersistUiStateMessage {
  return message.command === "persistUiState";
}

export interface ContainerlabExplorerProviderArgs {
  runningProvider: RunningLabTreeDataProvider;
  localProvider: LocalLabTreeDataProvider;
  helpProvider: HelpFeedbackProvider;
  isLocalCaptureAllowed: boolean;
}

export class ContainerlabExplorerViewProvider
  implements vscode.WebviewViewProvider, vscode.Disposable
{
  public static readonly viewType = "containerlabExplorerWebview";

  private readonly context: vscode.ExtensionContext;
  private readonly providers: ContainerlabExplorerProviderArgs;
  private readonly filterableProviders: FilterableTreeProvider[];
  private readonly options: ExplorerSnapshotOptions & {
    commandMetadata?: ExplorerCommandMetadata;
  };
  private readonly disposables: vscode.Disposable[] = [];
  private readonly visibilityEmitter = new vscode.EventEmitter<boolean>();

  private webviewView?: vscode.WebviewView;
  private isReady = false;
  private filterText = "";
  private refreshTimer?: ReturnType<typeof setTimeout>;
  private snapshotInFlight = false;
  private snapshotPending = false;
  private actionBindings: Map<string, ExplorerActionInvocation> = new Map();

  public readonly onDidChangeVisibility = this.visibilityEmitter.event;

  constructor(context: vscode.ExtensionContext, args: ContainerlabExplorerProviderArgs) {
    this.context = context;
    this.providers = args;
    this.options = {
      hideNonOwnedLabs: hideNonOwnedLabsState,
      isLocalCaptureAllowed: args.isLocalCaptureAllowed
    };
    this.filterableProviders = [args.runningProvider, args.localProvider];
    const savedFilter = context.workspaceState.get<string>(FILTER_STATE_KEY, "");
    this.filterText = savedFilter.trim();
    if (this.filterText.length > 0) {
      for (const provider of this.filterableProviders) {
        provider.setTreeFilter(this.filterText);
      }
    }

    this.registerDataListeners();
    this.disposables.push(
      vscode.extensions.onDidChange(() => {
        invalidateExplorerContributionCache();
        this.scheduleSnapshot(0);
      })
    );
  }

  private registerDataListeners(): void {
    const allProviders: Array<{ onDidChangeTreeData: vscode.Event<unknown> }> = [
      this.providers.runningProvider,
      this.providers.localProvider,
      this.providers.helpProvider
    ];
    for (const provider of allProviders) {
      const disposable = provider.onDidChangeTreeData(() => {
        this.scheduleSnapshot();
      });
      this.disposables.push(disposable);
    }
  }

  public resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.webviewView = webviewView;
    this.isReady = false;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, "dist"),
        vscode.Uri.joinPath(this.context.extensionUri, "resources")
      ]
    };
    webviewView.webview.html = this.getWebviewHtml(webviewView.webview);

    this.disposables.push(
      webviewView.webview.onDidReceiveMessage((message: ExplorerOutgoingMessage) => {
        void this.handleMessage(message);
      })
    );
    this.disposables.push(
      webviewView.onDidChangeVisibility(() => {
        this.visibilityEmitter.fire(webviewView.visible);
        void vscode.commands.executeCommand(
          "setContext",
          "containerlabExplorerVisible",
          webviewView.visible
        );
        if (webviewView.visible) {
          this.scheduleSnapshot(0);
        }
      })
    );
    this.disposables.push(
      webviewView.onDidDispose(() => {
        this.isReady = false;
        this.webviewView = undefined;
        this.visibilityEmitter.fire(false);
      })
    );

    this.visibilityEmitter.fire(webviewView.visible);
    void vscode.commands.executeCommand(
      "setContext",
      "containerlabExplorerVisible",
      webviewView.visible
    );
  }

  public async setFilter(filterText: string): Promise<void> {
    const normalized = filterText.trim();
    this.filterText = normalized;

    for (const provider of this.filterableProviders) {
      if (normalized.length > 0) {
        provider.setTreeFilter(normalized);
      } else {
        provider.clearTreeFilter();
      }
    }

    await this.context.workspaceState.update(FILTER_STATE_KEY, this.filterText);
    await vscode.commands.executeCommand(
      "setContext",
      "containerlabExplorerFilterActive",
      this.filterText.length > 0
    );
    this.postFilterState();
    this.scheduleSnapshot(0);
  }

  public async clearFilter(): Promise<void> {
    await this.setFilter("");
  }

  public isFilterActive(): boolean {
    return this.filterText.length > 0;
  }

  private async handleMessage(message: ExplorerOutgoingMessage): Promise<void> {
    if (message.command === "ready") {
      this.isReady = true;
      this.postFilterState();
      this.postUiState();
      this.scheduleSnapshot(0);
      return;
    }

    if (isSetFilterMessage(message)) {
      await this.setFilter(message.value);
      return;
    }

    if (isInvokeActionMessage(message)) {
      await this.executeAction(message);
      return;
    }

    if (isPersistUiStateMessage(message)) {
      await this.persistUiState(message.state);
    }
  }

  private async executeAction(message: ExplorerInvokeActionMessage): Promise<void> {
    const binding = this.actionBindings.get(message.actionRef);
    if (!binding) {
      const msg = "Action is no longer available. Reopen the explorer and try again.";
      this.postError(msg);
      return;
    }

    try {
      await vscode.commands.executeCommand(binding.commandId, ...binding.args);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.postError(`Failed to execute command: ${errorMessage}`);
    }
  }

  private async persistUiState(state: ExplorerUiState): Promise<void> {
    await this.context.workspaceState.update(UI_STATE_KEY, state);
  }

  private postUiState(): void {
    if (!this.webviewView || !this.isReady) {
      return;
    }

    const state = this.context.workspaceState.get<ExplorerUiState>(UI_STATE_KEY, {});
    const message: ExplorerIncomingMessage = {
      command: "uiState",
      state
    };
    void this.webviewView.webview.postMessage(message);
  }

  private postFilterState(): void {
    if (!this.webviewView || !this.isReady) {
      return;
    }

    const message: ExplorerIncomingMessage = {
      command: "filterState",
      filterText: this.filterText
    };
    void this.webviewView.webview.postMessage(message);
  }

  private postError(message: string): void {
    if (!this.webviewView || !this.isReady) {
      return;
    }

    const payload: ExplorerIncomingMessage = { command: "error", message };
    void this.webviewView.webview.postMessage(payload);
  }

  private scheduleSnapshot(delay: number = REFRESH_DEBOUNCE_MS): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = undefined;
      void this.postSnapshot();
    }, delay);
  }

  private async postSnapshot(): Promise<void> {
    if (!this.webviewView || !this.isReady) {
      return;
    }

    if (this.snapshotInFlight) {
      this.snapshotPending = true;
      return;
    }

    this.snapshotInFlight = true;
    try {
      this.options.hideNonOwnedLabs = hideNonOwnedLabsState;
      this.options.commandMetadata = await getExplorerCommandMetadata();
      const { snapshot, actionBindings } = await buildExplorerSnapshot(
        this.providers as ExplorerSnapshotProviders,
        this.filterText,
        this.options
      );
      this.actionBindings = actionBindings;
      void this.webviewView.webview.postMessage(snapshot);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[containerlab explorer] failed to build snapshot", error);
      this.actionBindings = new Map();
      this.postError(`Explorer refresh failed: ${message}`);
      this.postFallbackSnapshot();
    } finally {
      this.snapshotInFlight = false;
      if (this.snapshotPending) {
        this.snapshotPending = false;
        this.scheduleSnapshot(0);
      }
    }
  }

  private postFallbackSnapshot(): void {
    if (!this.webviewView || !this.isReady) {
      return;
    }

    const snapshot: ExplorerSnapshotMessage = {
      command: "snapshot",
      filterText: this.filterText,
      sections: EXPLORER_SECTION_ORDER.map((sectionId) => ({
        id: sectionId,
        label: EXPLORER_SECTION_LABELS[sectionId],
        count: 0,
        nodes: [],
        toolbarActions: []
      }))
    };
    void this.webviewView.webview.postMessage(snapshot);
  }

  private getWebviewHtml(webview: vscode.Webview): string {
    return createReactWebviewHtml({
      webview,
      extensionUri: this.context.extensionUri,
      scriptFile: "containerlabExplorerView.js",
      title: "Containerlab Explorer",
      webviewKind: "containerlab-explorer"
    });
  }

  public dispose(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = undefined;
    }

    this.visibilityEmitter.dispose();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }
}
