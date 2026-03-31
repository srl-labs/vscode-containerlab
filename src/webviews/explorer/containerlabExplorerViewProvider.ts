import * as vscode from "vscode";
import {
  type ExplorerOutgoingMessage,
  type ExplorerSnapshotOptions,
  type ExplorerSnapshotProviders,
  type ExplorerUiState
} from "@srl-labs/clab-ui/explorer/snapshot";
import { createExplorerController } from "@srl-labs/clab-ui/host";

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
  private readonly explorerController: ReturnType<typeof createExplorerController>;

  private webviewView?: vscode.WebviewView;
  private filterText = "";

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
    this.explorerController = createExplorerController({
      initialFilterText: this.filterText,
      initialUiState: context.workspaceState.get<ExplorerUiState>(UI_STATE_KEY, {}),
      debounceMs: REFRESH_DEBOUNCE_MS,
      buildProviders: async () => this.providers as ExplorerSnapshotProviders,
      getSnapshotOptions: async () => {
        this.options.hideNonOwnedLabs = hideNonOwnedLabsState;
        this.options.commandMetadata = await getExplorerCommandMetadata();
        return this.options;
      },
      executeAction: async (binding) => {
        await vscode.commands.executeCommand(binding.commandId, ...binding.args);
      },
      onFilterTextChanged: async (filterText) => {
        this.filterText = filterText;
        for (const provider of this.filterableProviders) {
          if (filterText.length > 0) {
            provider.setTreeFilter(filterText);
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
      },
      onUiStateChanged: async (state) => {
        await this.context.workspaceState.update(UI_STATE_KEY, state);
      },
      publish: async (message) => {
        if (!this.webviewView) {
          return;
        }
        await this.webviewView.webview.postMessage(message);
      }
    });

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
        void this.explorerController.handleMessage(message);
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
        this.explorerController.dispose();
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
    await this.explorerController.setFilter(filterText);
  }

  public async clearFilter(): Promise<void> {
    await this.explorerController.clearFilter();
  }

  public isFilterActive(): boolean {
    return this.explorerController.isFilterActive();
  }

  private scheduleSnapshot(delay: number = REFRESH_DEBOUNCE_MS): void {
    this.explorerController.scheduleSnapshot(delay);
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
    this.explorerController.dispose();
    this.visibilityEmitter.dispose();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }
}
