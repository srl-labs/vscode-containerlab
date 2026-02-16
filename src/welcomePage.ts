import * as path from "path";
import * as fs from "fs";

import * as vscode from "vscode";

import { extensionVersion } from "./globals";
import { fallbackRepos, fetchPopularRepos, type PopularRepo } from "./helpers/popularLabs";

/**
 * Message types sent from the webview to the extension
 */
interface WebviewMessage {
  command: "createExample" | "dontShowAgain" | "getRepos";
  value?: boolean;
}

/**
 * Manages the welcome page webview for the Containerlab extension.
 */
export class WelcomePage {
  private panel: vscode.WebviewPanel | undefined;
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  /**
   * Shows the welcome page if it should be shown based on user preferences.
   */
  public async show(): Promise<void> {
    // Check if welcome page should be shown
    const config = vscode.workspace.getConfiguration("containerlab");
    const showWelcomePage = config.get<boolean>("showWelcomePage", true);

    if (!showWelcomePage) {
      return;
    }

    // Create and show the webview panel
    this.panel = vscode.window.createWebviewPanel(
      "containerlabWelcome",
      "Welcome to Containerlab",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.file(path.join(this.context.extensionPath, "resources"))]
      }
    );

    const iconUri = vscode.Uri.file(
      path.join(this.context.extensionPath, "resources", "containerlab.svg")
    );
    this.panel.iconPath = iconUri;

    // Set webview content
    this.panel.webview.html = await this.getWebviewContent();

    // Handle webview messages
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

  /**
   * Fetches repositories from GitHub with the clab-topo topic.
   */
  private async fetchGitHubRepos(): Promise<void> {
    const postRepos = (repos: PopularRepo[], usingFallback: boolean) => {
      if (this.panel) {
        this.panel.webview.postMessage({
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

  /**
   * Creates an example topology file in the workspace.
   */
  private createExampleTopology(): void {
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders) {
      vscode.window.showErrorMessage("No workspace folder is open. Please open a folder first.");
      return;
    }

    const rootPath = workspaceFolders[0].uri.fsPath;
    const filePath = path.join(rootPath, "example.clab.yml");

    // Check if file already exists
    if (fs.existsSync(filePath)) {
      vscode.window.showWarningMessage("example.clab.yml already exists in the workspace.");
      vscode.workspace.openTextDocument(filePath).then((doc) => {
        vscode.window.showTextDocument(doc);
      });
      return;
    }

    // File content
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

    // Create the file
    fs.writeFileSync(filePath, content);

    // Open the file in editor
    vscode.workspace.openTextDocument(filePath).then((doc) => {
      vscode.window.showTextDocument(doc);
      vscode.window.showInformationMessage("Created example.clab.yml in your workspace.");
    });
  }

  /**
   * Save the welcome page setting
   */
  private saveWelcomePageSetting(show: boolean): void {
    const config = vscode.workspace.getConfiguration("containerlab");
    config.update("showWelcomePage", show, vscode.ConfigurationTarget.Global);
  }

  /**
   * Get the webview HTML content
   */
  private async getWebviewContent(): Promise<string> {
    const cssURI = this.panel?.webview
      .asWebviewUri(
        vscode.Uri.file(path.join(this.context.extensionPath, "resources", "tailwind.js"))
      )
      .toString();

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <script src="${cssURI}"></script>
    <title>Welcome to Containerlab</title>
    <style>
      .repoListItem {
        outline-color: var(--vscode-foreground);
      }
    </style>
</head>
<body class="w-full h-screen flex items-center justify-center">
    <div class="mx-4 max-w-7xl max-h-[600px]">
        <div>
          <div class="flex items-center gap-x-5">
              <svg viewBox="240.742 -24.784 81.8 87.413" xmlns="http://www.w3.org/2000/svg" height="64px">
                <style>
                  .cls-5 {
                    fill: var(--vscode-editor-foreground);
                  }
                </style>
                <path id="containerlab_export_white_ink-liquid" data-name="containerlab export white ink-liquid" class="cls-3" d="M 273.942 26.829 C 273.542 27.029 272.642 27.529 271.942 28.029 C 270.742 28.929 269.242 29.229 267.342 28.729 C 266.042 28.429 265.942 28.729 266.842 30.829 C 272.542 43.229 289.942 43.729 296.042 31.629 C 297.442 28.929 297.242 28.429 295.342 28.929 C 293.742 29.329 292.642 29.129 291.042 27.929 C 288.942 26.329 286.142 26.329 284.642 27.929 C 283.142 29.529 280.042 29.429 278.242 27.729 C 277.242 26.729 275.142 26.329 273.942 26.829" style="fill: rgb(60, 190, 239); stroke-width: 0px;" transform="matrix(1, 0, 0, 1, 0, -7.105427357601002e-15)"/>
                <path class="cls-5" d="M 317.642 -9.571 L 309.842 -13.971 L 292.442 -24.071 C 290.742 -25.071 288.842 -24.971 287.142 -24.071 C 285.542 -23.071 284.542 -21.371 284.542 -19.471 L 284.842 -3.071 L 284.842 1.529 C 284.842 1.529 284.842 3.529 284.842 3.529 C 284.842 4.229 285.342 4.929 286.042 5.129 C 294.542 7.329 300.742 15.229 300.742 23.729 C 300.742 32.229 292.142 42.929 281.542 42.929 C 270.942 42.929 262.342 34.329 262.342 23.729 C 262.342 13.129 267.742 7.929 275.742 5.429 L 277.342 5.029 C 278.142 4.929 278.742 4.229 278.742 3.429 L 278.742 0.629 C 278.742 0.629 278.742 -1.571 278.742 -1.571 L 278.742 -19.571 C 278.742 -21.471 277.742 -23.171 276.142 -24.071 C 274.542 -24.971 272.542 -24.971 270.942 -24.071 L 263.342 -19.671 L 245.642 -9.471 C 242.642 -7.671 240.742 -4.471 240.742 -0.971 L 240.742 34.929 C 240.742 38.429 242.642 41.729 245.642 43.429 L 276.742 61.329 C 278.242 62.229 279.942 62.629 281.642 62.629 C 283.342 62.629 285.042 62.229 286.542 61.329 L 317.642 43.429 C 320.642 41.629 322.542 38.429 322.542 34.929 L 322.542 -0.971 C 322.542 -4.471 320.642 -7.771 317.642 -9.471 L 317.642 -9.571 Z M 319.342 34.929 C 319.342 37.229 318.042 39.429 316.042 40.629 L 284.942 58.529 C 282.942 59.729 280.342 59.729 278.342 58.529 L 247.242 40.629 C 245.242 39.429 243.942 37.229 243.942 34.929 L 243.942 -0.971 C 243.942 -3.271 245.242 -5.471 247.242 -6.671 L 260.242 -14.171 L 272.442 -21.271 C 273.342 -21.771 274.142 -21.471 274.442 -21.271 C 274.742 -21.071 275.442 -20.571 275.442 -19.571 L 275.442 2.029 C 275.442 2.029 274.942 2.129 274.942 2.229 C 265.542 5.129 259.142 13.829 259.142 23.729 C 259.142 33.629 269.242 46.229 281.642 46.229 C 294.042 46.229 304.142 36.129 304.142 23.729 C 304.142 11.329 297.642 5.329 288.242 2.329 L 288.242 -3.071 C 288.242 -3.071 287.942 -19.471 287.942 -19.471 C 287.942 -20.471 288.642 -20.971 288.942 -21.171 C 289.242 -21.371 290.042 -21.671 290.942 -21.171 L 308.342 -11.071 L 316.142 -6.671 C 318.142 -5.471 319.442 -3.271 319.442 -0.971 L 319.442 34.929 L 319.342 34.929 Z" style="stroke-width: 1px;" id="outline" transform="matrix(1, 0, 0, 1, 0, -7.105427357601002e-15)"/>
                <circle class="cls-1" cx="283.442" cy="23.429" r="1.7" style="fill: none; stroke: rgb(60, 190, 239); stroke-miterlimit: 10; stroke-width: 0.8px;" transform="matrix(1, 0, 0, 1, 0, -7.105427357601002e-15)"/>
                <circle class="cls-1" cx="275.842" cy="19.529" r="2.4" style="fill: none; stroke: rgb(60, 190, 239); stroke-miterlimit: 10; stroke-width: 0.8px;" transform="matrix(1, 0, 0, 1, 0, -7.105427357601002e-15)"/>
                <circle class="cls-1" cx="280.642" cy="11.229" r="3.4" style="fill: none; stroke: rgb(60, 190, 239); stroke-miterlimit: 10; stroke-width: 0.8px;" transform="matrix(1, 0, 0, 1, 0, -7.105427357601002e-15)"/>
              </svg>
              <div>
                <h1 class="text-3xl">Welcome to Containerlab</h1>
                <div class="inline-flex gap-x-2 mt-2">
                  <a href="https://github.com/srl-labs/vscode-containerlab/releases/">
                      <img src="https://img.shields.io/badge/version-${extensionVersion}-blue?style=flat-square&color=00c9ff&labelColor=bec8d2" alt="Installed Extension Version" />
                  </a>
                  <a href="https://github.com/srl-labs/containerlab/releases/latest">
                      <img src="https://img.shields.io/github/release/srl-labs/containerlab.svg?style=flat-square&color=00c9ff&labelColor=bec8d2" alt="Latest containerlab version" />
                  </a>
                  <a href="https://github.com/srl-labs/containerlab/releases/">
                      <img src="https://img.shields.io/github/downloads/srl-labs/containerlab/total.svg?style=flat-square&color=00c9ff&labelColor=bec8d2" alt="Containerlab downloads" />
                  </a>
                  <a href="https://discord.gg/vAyddtaEV9">
                      <img src="https://img.shields.io/discord/860500297297821756?style=flat-square&label=discord&logo=discord&color=00c9ff&labelColor=bec8d2" alt="Discord server" />
                  </a>
                </div>
              </div>
          </div>

        <div class="grid grid-cols-2 mt-10 gap-x-2">
          <div class="flex flex-col justify-between">
            <div class="">
              <h2 class="text-xl mb-4">Getting Started</h2>
              <p>The Containerlab extension integrates <a href="https://containerlab.dev/">containerlab</a> directly into Visual Studio Code, providing an explorer for managing labs and their containers.</p>
              <br><p>You can create, deploy, and manage network topologies with just a few clicks.</p>
              <button class="mt-4 rounded-sm p-2 transition cursor-pointer hover:opacity-50" style="background-color: var(--vscode-button-background); color: var(--vscode-button-foreground)"id="createExampleBtn">Create Example Topology</button>
              <p><small>This will create an example.clab.yml file in your current workspace</small></p>
            </div>
            <div class="">
              <h2 class="text-xl mb-4">Documentation and Resources</h2>
              <ul>
                  <li class="text-blue underline"><a href="https://containerlab.dev/">Containerlab Documentation</a></li>
                  <li class="text-blue underline"><a href="https://containerlab.dev/manual/vsc-extension/">VS Code Extension Documentation</a></li>
                  <li class="text-blue underline"><a href="https://github.com/srl-labs/">Browse Labs on GitHub (srl-labs)</a></li>
                  <li class="text-blue underline"><a href="https://github.com/search?q=topic%3Aclab-topo++fork%3Atrue&type=repositories">Find more labs tagged with "clab-topo"</a></li>
                  <li class="text-blue underline"><a href="https://discord.gg/vAyddtaEV9">Join our Discord server</a></li>
                  <li class="text-blue underline"><a href="https://github.com/siemens/cshargextcap/releases/latest">Download cshargextcap Wireshark plugin</a></li>
              </ul>
              <div class="checkbox-container mt-10">
                <input type="checkbox" id="dontShowAgain">
                <label for="dontShowAgain">Don't show this page again</label>
              </div>
            </div>
          </div>

          <div class="">
            <h2 class="text-xl mb-4 ml-2">Popular Topologies</h2>
            <div id="repoLoading">Loading popular repositories...</div>
            <ul class="max-h-[400px] overflow-y-auto flex flex-col gap-y-2 p-2 h-96" id="reposList"></ul>
          </div>
        </div>
    </div>

    <script>
        (function() {
            const vscode = acquireVsCodeApi();

            // Create example topology
            document.getElementById('createExampleBtn').addEventListener('click', () => {
                vscode.postMessage({
                    command: 'createExample'
                });
            });

            // Don't show again checkbox
            document.getElementById('dontShowAgain').addEventListener('change', (e) => {
                vscode.postMessage({
                    command: 'dontShowAgain',
                    value: e.target.checked
                });
            });

            // Get repository data
            vscode.postMessage({
                command: 'getRepos'
            });

            // Handle messages from the extension
            window.addEventListener('message', event => {
                const message = event.data;

                if (message.command === 'reposLoaded') {
                    const reposList = document.getElementById('reposList');
                    const repoLoading = document.getElementById('repoLoading');

                    repoLoading.style.display = 'none';

                    if (message.repos && message.repos.length) {
                        // Display notice if using fallback data
                        if (message.usingFallback) {
                            const notice = document.createElement('div');
                            notice.style.marginBottom = '10px';
                            notice.style.padding = '8px';
                            notice.style.backgroundColor = 'var(--vscode-inputValidation-infoBackground)';
                            notice.style.borderLeft = '3px solid var(--vscode-inputValidation-infoBorder)';
                            notice.innerHTML = 'Note: Using cached repository data due to GitHub API limitations.';
                            document.getElementById('topologyRepos').insertBefore(notice, reposList);
                        }

                        message.repos.forEach(repo => {
                            const li = document.createElement('li');
                            li.className = 'repoListItem rounded px-2 py-1 outline';
                            li.innerHTML = \`
                                <strong><a href="\${repo.html_url}">\${repo.name}</a></strong>
                                ⭐ \${repo.stargazers_count}
                                <p>\${repo.description || 'No description available'}</p>
                            \`;
                            reposList.appendChild(li);
                        });
                    } else {
                        reposList.innerHTML = '<li class="repo-item">No repositories found</li>';
                    }
                }
            });
        })();
    </script>
</body>
</html>`;
  }
}
