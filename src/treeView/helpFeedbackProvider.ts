import * as vscode from "vscode";

interface HelpLink {
  label: string;
  url: string;
}

class HelpLinkTreeItem extends vscode.TreeItem {
  public readonly link: string;

  constructor(label: string, link: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.link = link;
    this.tooltip = link;
    this.contextValue = "containerlabHelpLink";
    this.iconPath = new vscode.ThemeIcon("link-external");
  }
}

export class HelpFeedbackProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private links: HelpLink[] = [
    { label: "Containerlab Documentation", url: "https://containerlab.dev/" },
    {
      label: "VS Code Extension Documentation",
      url: "https://containerlab.dev/manual/vsc-extension/",
    },
    { label: "Browse Labs on GitHub (srl-labs)", url: "https://github.com/srl-labs/" },
    {
      label: 'Find more labs tagged with "clab-topo"',
      url: "https://github.com/search?q=topic%3Aclab-topo++fork%3Atrue&type=repositories",
    },
    { label: "Join our Discord server", url: "https://discord.gg/vAyddtaEV9" },
    {
      label: "Download cshargextcap Wireshark plugin",
      url: "https://github.com/siemens/cshargextcap/releases/latest",
    },
  ];

  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): vscode.ProviderResult<vscode.TreeItem[]> {
    return this.links.map((link) => new HelpLinkTreeItem(link.label, link.url));
  }
}
