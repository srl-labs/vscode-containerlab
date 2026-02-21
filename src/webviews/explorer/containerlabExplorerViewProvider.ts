import { randomBytes } from "crypto";

import * as vscode from "vscode";

import { hideNonOwnedLabsState } from "../../globals";
import {
  EXPLORER_SECTION_LABELS,
  EXPLORER_SECTION_ORDER
} from "../shared/explorer/types";
import type {
  ExplorerIncomingMessage,
  ExplorerInvokeActionMessage,
  ExplorerOutgoingMessage,
  ExplorerPersistUiStateMessage,
  ExplorerSetFilterMessage,
  ExplorerSnapshotMessage,
  ExplorerUiState
} from "../shared/explorer/types";
import type { HelpFeedbackProvider, LocalLabTreeDataProvider, RunningLabTreeDataProvider } from "../../treeView";

import { buildExplorerSnapshot } from "./explorerSnapshotAdapter";
import type {
  ExplorerActionInvocation,
  ExplorerSnapshotOptions,
  ExplorerSnapshotProviders
} from "./explorerSnapshotAdapter";

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
  private readonly providers: ExplorerSnapshotProviders;
  private readonly filterableProviders: FilterableTreeProvider[];
  private readonly options: ExplorerSnapshotOptions;
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
    this.providers = {
      runningProvider: args.runningProvider,
      localProvider: args.localProvider,
      helpProvider: args.helpProvider
    };
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
  }

  private registerDataListeners(): void {
    const allProviders = [this.providers.runningProvider, this.providers.localProvider, this.providers.helpProvider];
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
    void vscode.commands.executeCommand("setContext", "containerlabExplorerVisible", webviewView.visible);
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
      const { snapshot, actionBindings } = await buildExplorerSnapshot(
        this.providers,
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
    const nonce = randomBytes(16).toString("hex");
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "dist", "containerlabExplorerView.js")
    );
    const csp = webview.cspSource;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${csp} 'unsafe-inline'; img-src ${csp} https: data:; font-src ${csp}; script-src 'nonce-${nonce}' ${csp};">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    html, body, #root {
      width: 100%;
      height: 100%;
      margin: 0;
      padding: 0;
      overflow: hidden;
    }
    *, *::before, *::after {
      box-sizing: border-box;
    }
  </style>
</head>
<body data-webview-kind="containerlab-explorer">
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
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
