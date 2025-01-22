import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

const execAsync = promisify(exec);

export class ContainerlabNode extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly details?: any,
    contextValue?: string
  ) {
    super(label, collapsibleState);
    this.contextValue = contextValue;
  }
}

interface LabInfo {
  labPath: string;
  localExists: boolean;
  containers: any[];
  labName?: string;      // from containerlab if found
}

export class ContainerlabTreeDataProvider implements vscode.TreeDataProvider<ContainerlabNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ContainerlabNode | undefined | void>();
  public readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  getTreeItem(element: ContainerlabNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: ContainerlabNode): Promise<ContainerlabNode[]> {
    if (!element) {
      return this.getAllLabs();
    } else {
      const info = element.details as LabInfo;
      if (info && info.containers.length > 0) {
        return this.getContainerNodes(info.containers);
      }
      return [];
    }
  }

  public refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  private async getAllLabs(): Promise<ContainerlabNode[]> {
    const localFiles = await this.findLocalClabFiles();
    const labData = await this.inspectContainerlab();

    const allPaths = new Set<string>([...Object.keys(labData), ...localFiles]);
    if (allPaths.size === 0) {
      return [ new ContainerlabNode('No local .clab files or labs found', vscode.TreeItemCollapsibleState.None) ];
    }

    const nodes: ContainerlabNode[] = [];
    for (const labPath of allPaths) {
      const info = labData[labPath] || { labPath, containers: [], labName: undefined };
      const localExists = localFiles.includes(labPath);
      info.localExists = localExists;

      // 1) Build label
      let labLabel: string | undefined = info.labName;
      if (!labLabel) {
        if (localExists) {
          labLabel = path.basename(labPath);
        } else {
          labLabel = labPath;
        }
      }

      // 2) Icon logic: 
      // - no containers => grey
      // - all running => green
      // - none running => red
      // - else => partial => yellow
      let contextVal: string;
      let color: vscode.ThemeColor;
      if (info.containers.length === 0) {
        contextVal = "containerlabLabUndeployed";
        color = new vscode.ThemeColor('disabledForeground'); // grey 
      } else {
        // deployed
        contextVal = "containerlabLabDeployed";
        const states = info.containers.map(c => c.state);
        const allRunning = states.every(s => s === 'running');
        const noneRunning = states.every(s => s !== 'running');
        if (allRunning) {
          color = new vscode.ThemeColor('testing.iconPassed'); // green
        } else if (noneRunning) {
          color = new vscode.ThemeColor('testing.iconFailed'); // red
        } else {
          // partial
          color = new vscode.ThemeColor('problemsWarningIcon.foreground'); // yellow
        }
      }

      // collapsible if containers exist
      const collapsible = info.containers.length > 0
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None;

      const node = new ContainerlabNode(
        labLabel,
        collapsible,
        {
          labPath,
          localExists,
          containers: info.containers,
          labName: info.labName
        },
        contextVal
      );

      node.iconPath = new vscode.ThemeIcon('circle-filled', color);
      nodes.push(node);
    }
    return nodes;
  }

  private getContainerNodes(containers: any[]): ContainerlabNode[] {
    return containers.map((ctr: any) => {
      let ipWithoutSlash: string | undefined;
      if (ctr.ipv4_address) {
        const split = ctr.ipv4_address.split('/');
        ipWithoutSlash = split[0];
      }
      const label = `${ctr.name} (${ctr.state})`;
      const node = new ContainerlabNode(
        label,
        vscode.TreeItemCollapsibleState.None,
        {
          containerId: ctr.container_id,
          state: ctr.state,
          sshIp: ipWithoutSlash
        },
        "containerlabContainer"
      );

      node.tooltip = `Container: ${ctr.name}\nID: ${ctr.container_id}\nState: ${ctr.state}`;
      if (ctr.state === 'running') {
        node.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('testing.iconPassed'));
      } else {
        node.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('testing.iconFailed'));
      }
      return node;
    });
  }

  private async findLocalClabFiles(): Promise<string[]> {
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
      return [];
    }

    const patterns = ['**/*.clab.yml', '**/*.clab.yaml'];
    const exclude = '**/node_modules/**';

    let uris: vscode.Uri[] = [];
    for (const p of patterns) {
      const found = await vscode.workspace.findFiles(p, exclude);
      uris.push(...found);
    }

    const set = new Set<string>();
    for (const uri of uris) {
      set.add(uri.fsPath);
    }
    return [...set];
  }

  private async inspectContainerlab(): Promise<Record<string, LabInfo>> {
    let stdout: string;
    try {
      const { stdout: out } = await execAsync('sudo containerlab inspect --all --format json');
      stdout = out;
    } catch {
      return {};
    }

    let parsed: any;
    try {
      parsed = JSON.parse(stdout);
    } catch {
      parsed = { containers: [] };
    }

    const arr = parsed.containers || [];
    const map: Record<string, LabInfo> = {};

    for (const c of arr) {
      const p = c.labPath || '';
      if (!map[p]) {
        map[p] = { labPath: p, localExists: false, containers: [], labName: c.lab_name };
      }
      map[p].containers.push(c);
    }
    return map;
  }
}
