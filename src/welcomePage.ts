import * as fs from "fs";
import * as path from "path";

import * as vscode from "vscode";

import { extensionVersion } from "./globals";
import { fallbackRepos, fetchPopularRepos, type PopularRepo } from "./helpers/popularLabs";
import { getWelcomeWebviewHtml } from "./webviews/welcome/welcomeWebviewHtml";

interface WebviewMessage {
  command: "createExample" | "dontShowAgain" | "getRepos";
  value?: boolean;
}

export class WelcomePage {
  private panel: vscode.WebviewPanel | undefined;
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  public async show(): Promise<void> {
    const config = vscode.workspace.getConfiguration("containerlab");
    const showWelcomePage = config.get<boolean>("showWelcomePage", true);

    if (!showWelcomePage) {
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      "containerlabWelcome",
      "Welcome to Containerlab",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.context.extensionUri, "dist"),
          vscode.Uri.joinPath(this.context.extensionUri, "resources")
        ]
      }
    );

    const iconUri = vscode.Uri.file(
      path.join(this.context.extensionPath, "resources", "containerlab.svg")
    );
    this.panel.iconPath = iconUri;

    this.panel.webview.html = this.getWebviewContent();

    this.panel.webview.onDidReceiveMessage(async (message: WebviewMessage) => {
      switch (message.command) {
        case "createExample":
          this.createExampleTopology();
          break;
        case "dontShowAgain":
          this.saveWelcomePageSetting(!message.value);
          break;
        case "getRepos":
          void this.fetchGitHubRepos();
          break;
      }
    });
  }

  private async fetchGitHubRepos(): Promise<void> {
    const postRepos = (repos: PopularRepo[], usingFallback: boolean) => {
      if (this.panel) {
        void this.panel.webview.postMessage({
          command: "reposLoaded",
          repos,
          usingFallback
        });
      }
    };

    fetchPopularRepos()
      .then((repos) => postRepos(repos, false))
      .catch((error) => {
        console.error("Error fetching GitHub repositories:", error);
        postRepos(fallbackRepos, true);
      });
  }

  private createExampleTopology(): void {
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders) {
      void vscode.window.showErrorMessage("No workspace folder is open. Please open a folder first.");
      return;
    }

    const rootPath = workspaceFolders[0].uri.fsPath;
    const filePath = path.join(rootPath, "example.clab.yml");

    if (fs.existsSync(filePath)) {
      void vscode.window.showWarningMessage("example.clab.yml already exists in the workspace.");
      void vscode.workspace.openTextDocument(filePath).then((doc) => {
        void vscode.window.showTextDocument(doc);
      });
      return;
    }

    const content = `# topology documentation: http://containerlab.dev/lab-examples/single-srl/
name: srl01
topology:
  kinds:
    nokia_srlinux:
      type: ixrd3
      image: ghcr.io/nokia/srlinux

  nodes:
    srl1:
      kind: nokia_srlinux
    srl2:
      kind: nokia_srlinux

  links:
    - endpoints: ["srl1:e1-1","srl2:e1-1"]
`;

    fs.writeFileSync(filePath, content);

    void vscode.workspace.openTextDocument(filePath).then((doc) => {
      void vscode.window.showTextDocument(doc);
      void vscode.window.showInformationMessage("Created example.clab.yml in your workspace.");
    });
  }

  private saveWelcomePageSetting(show: boolean): void {
    const config = vscode.workspace.getConfiguration("containerlab");
    void config.update("showWelcomePage", show, vscode.ConfigurationTarget.Global);
  }

  private getWebviewContent(): string {
    if (!this.panel) {
      return "";
    }

    return getWelcomeWebviewHtml(this.panel.webview, this.context.extensionUri, {
      extensionVersion: extensionVersion ?? "unknown"
    });
  }
}
