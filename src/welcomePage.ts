import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as https from 'https';

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
    const config = vscode.workspace.getConfiguration('containerlab');
    const showWelcomePage = config.get<boolean>('showWelcomePage', true);

    if (!showWelcomePage) {
      return;
    }

    // Create and show the webview panel
    this.panel = vscode.window.createWebviewPanel(
      'containerlabWelcome',
      'Welcome to Containerlab',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.file(path.join(this.context.extensionPath, 'resources'))
        ]
      }
    );

    // Set webview content
    this.panel.webview.html = await this.getWebviewContent();

    // Handle webview messages
    this.panel.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case 'createExample':
          this.createExampleTopology();
          break;
        case 'dontShowAgain':
          this.saveWelcomePageSetting(!message.value);
          break;
        case 'getRepos':
          this.fetchGitHubRepos();
          break;
      }
    });
  }

  // Fallback repository list in case GitHub API is rate-limited
  private readonly fallbackRepos = [
    {
      name: "srl-telemetry-lab",
      html_url: "https://github.com/srl-labs/srl-telemetry-lab",
      description: "A lab demonstrating the telemetry stack with SR Linux.",
      stargazers_count: 85
    },
    {
      name: "netbox-nrx-clab",
      html_url: "https://github.com/srl-labs/netbox-nrx-clab",
      description: "NetBox NRX Containerlab integration, enabling network automation use cases.",
      stargazers_count: 65
    },
    {
      name: "sros-anysec-macsec-lab",
      html_url: "https://github.com/srl-labs/sros-anysec-macsec-lab",
      description: "SR OS Anysec & MACsec lab with containerlab.",
      stargazers_count: 42
    },
    {
      name: "intent-based-ansible-lab",
      html_url: "https://github.com/srl-labs/intent-based-ansible-lab",
      description: "Intent-based networking lab with Ansible and SR Linux.",
      stargazers_count: 38
    },
    {
      name: "multivendor-evpn-lab",
      html_url: "https://github.com/srl-labs/multivendor-evpn-lab",
      description: "Multivendor EVPN lab with Nokia, Arista, and Cisco network operating systems.",
      stargazers_count: 78
    }
  ];

  /**
   * Fetches repositories from GitHub with the clab-topo topic.
   */
  private async fetchGitHubRepos(): Promise<void> {
    const url = 'https://api.github.com/search/repositories?q=topic:clab-topo+org:srl-labs+fork:true&sort=stars&order=desc';

    this.fetchJson(url)
      .then(data => {
        if (this.panel) {
          this.panel.webview.postMessage({
            command: 'reposLoaded',
            repos: data.items || [],
            usingFallback: false
          });
        }
      })
      .catch(error => {
        console.error('Error fetching GitHub repositories:', error);
        if (this.panel) {
          this.panel.webview.postMessage({
            command: 'reposLoaded',
            repos: this.fallbackRepos,
            usingFallback: true
          });
        }
      });
  }

  /**
   * Helper to fetch JSON data from a URL.
   */
  private fetchJson(url: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const req = https.get(url, {
        headers: {
          'User-Agent': 'VSCode-Containerlab-Extension',
          'Accept': 'application/vnd.github.v3+json'
        }
      }, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const parsedData = JSON.parse(data);
            resolve(parsedData);
          } catch (e) {
            reject(e);
          }
        });
      }).on('error', (err) => {
        reject(err);
      });

      req.end();
    });
  }

  /**
   * Creates an example topology file in the workspace.
   */
  private createExampleTopology(): void {
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders) {
      vscode.window.showErrorMessage('No workspace folder is open. Please open a folder first.');
      return;
    }

    const rootPath = workspaceFolders[0].uri.fsPath;
    const filePath = path.join(rootPath, 'example.clab.yml');

    // Check if file already exists
    if (fs.existsSync(filePath)) {
      vscode.window.showWarningMessage('example.clab.yml already exists in the workspace.');
      vscode.workspace.openTextDocument(filePath).then(doc => {
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
    srl:
      kind: nokia_srlinux
`;

    // Create the file
    fs.writeFileSync(filePath, content);

    // Open the file in editor
    vscode.workspace.openTextDocument(filePath).then(doc => {
      vscode.window.showTextDocument(doc);
      vscode.window.showInformationMessage('Created example.clab.yml in your workspace.');
    });
  }

  /**
   * Save the welcome page setting
   */
  private saveWelcomePageSetting(show: boolean): void {
    const config = vscode.workspace.getConfiguration('containerlab');
    config.update('showWelcomePage', show, vscode.ConfigurationTarget.Global);
  }

  /**
   * Get the webview HTML content
   */
  private async getWebviewContent(): Promise<string> {
    // Load the logo
    const logoPath = path.join(this.context.extensionPath, 'resources', 'containerlab.png');
    const logoUri = this.panel?.webview.asWebviewUri(vscode.Uri.file(logoPath)).toString();

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to Containerlab</title>
    <style>
        body {
            font-family: var(--vscode-editor-font-family);
            color: var(--vscode-editor-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
            margin: 0;
            line-height: 1.6;
        }
        h1, h2, h3 {
            color: var(--vscode-titleBar-activeForeground);
        }
        a {
            color: var(--vscode-textLink-foreground);
            text-decoration: none;
        }
        a:hover {
            text-decoration: underline;
        }
        .container {
            max-width: 900px;
            margin: 0 auto;
        }
        .card {
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 6px;
            padding: 20px;
            margin-bottom: 20px;
        }
        .button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
        }
        .button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        .footer {
            margin-top: 40px;
            font-size: 12px;
            opacity: 0.7;
        }
        .repo-list {
            list-style-type: none;
            padding: 0;
        }
        .repo-item {
            padding: 10px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .repo-item:last-child {
            border-bottom: none;
        }
        .header-logo {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .checkbox-container {
            display: flex;
            align-items: center;
            margin-top: 20px;
        }
        .checkbox-container input {
            margin-right: 10px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header-logo">
            <img src="${logoUri}" alt="Containerlab Logo" width="60" />
            <h1>Welcome to the Containerlab Extension</h1>
        </div>

        <div class="card">
            <h2>Getting Started</h2>
            <p>The Containerlab extension integrates <a href="https://containerlab.dev/">containerlab</a> directly into Visual Studio Code, providing a convenient tree view for managing labs and their containers.</p>
            <p>You can create, deploy, and manage network topologies with just a few clicks.</p>
            <button class="button" id="createExampleBtn">Create Example Topology</button>
            <p><small>This will create an example.clab.yml file in your current workspace</small></p>

            <div class="checkbox-container" style="margin-top: 20px;">
                <input type="checkbox" id="dontShowAgain">
                <label for="dontShowAgain">Don't show this page again</label>
            </div>
        </div>

        <div class="card">
            <h2>Documentation and Resources</h2>
            <p>Find detailed information about Containerlab:</p>
            <ul>
                <li><a href="https://containerlab.dev/">Containerlab Documentation</a></li>
                <li><a href="https://containerlab.dev/manual/vsc-extension/">VS Code Extension Documentation</a></li>
                <li><a href="https://github.com/srl-labs/">Browse Labs on GitHub (srl-labs)</a></li>
                <li><a href="https://github.com/search?q=topic%3Aclab-topo+org%3Asrl-labs+fork%3Atrue&type=repositories">Find more labs tagged with "clab-topo"</a></li>
            </ul>
        </div>

        <div class="card" id="topologyRepos">
            <h2>Popular Topologies</h2>
            <div id="repoLoading">Loading popular repositories...</div>
            <ul class="repo-list" id="reposList"></ul>
        </div>

        <div class="footer">
            <p>Containerlab - <a href="https://containerlab.dev/">https://containerlab.dev/</a></p>
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
                            li.className = 'repo-item';
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

    return html;
  }
}