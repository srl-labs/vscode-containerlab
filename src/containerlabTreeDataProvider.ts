import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as os from 'os';

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
  labName?: string;
  owner?: string;
}

export class ContainerlabTreeDataProvider implements vscode.TreeDataProvider<ContainerlabNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ContainerlabNode | undefined | void>();
  public readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  getTreeItem(element: ContainerlabNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: ContainerlabNode): Promise<ContainerlabNode[]> {
    if (!element) {
      // top-level labs
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

  /**
   * Merge containerlab-inspect data with local .clab files, then sort.
   */
  private async getAllLabs(): Promise<ContainerlabNode[]> {
    const localFiles = await this.findLocalClabFiles();
    const labData = await this.inspectContainerlab();

    const allPaths = new Set<string>([...Object.keys(labData), ...localFiles]);
    if (allPaths.size === 0) {
      return [ new ContainerlabNode('No local .clab files or labs found', vscode.TreeItemCollapsibleState.None) ];
    }

    const nodes: ContainerlabNode[] = [];
    for (const labPath of allPaths) {
      const info = labData[labPath] || { labPath, containers: [], labName: undefined, owner: undefined };
      const localExists = localFiles.includes(labPath);
      info.localExists = localExists;

      // Build label
      let finalLabel = info.labName;
      if (!finalLabel) {
        if (localExists) {
          finalLabel = path.basename(labPath);
        } else {
          finalLabel = labPath;
        }
      }

      // If there's an owner => "vlan (clab)"
      if (info.owner) {
        finalLabel += ` (${info.owner})`;
      }

      // Decide color & context based on container states
      let contextVal: string;
      let color: vscode.ThemeColor;
      if (info.containers.length === 0) {
        contextVal = "containerlabLabUndeployed";
        color = new vscode.ThemeColor('disabledForeground'); // grey
      } else {
        contextVal = "containerlabLabDeployed";
        const states = info.containers.map(c => c.state);
        const allRunning = states.every(s => s === 'running');
        const noneRunning = states.every(s => s !== 'running');
        if (allRunning) {
          color = new vscode.ThemeColor('testing.iconPassed'); // green
        } else if (noneRunning) {
          color = new vscode.ThemeColor('testing.iconFailed'); // red
        } else {
          color = new vscode.ThemeColor('problemsWarningIcon.foreground'); // partial => yellow
        }
      }

      const collapsible = (info.containers.length > 0)
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None;

      const node = new ContainerlabNode(
        finalLabel,
        collapsible,
        {
          labPath,
          localExists,
          containers: info.containers,
          labName: info.labName,
          owner: info.owner
        },
        contextVal
      );

      node.iconPath = new vscode.ThemeIcon('circle-filled', color);
      nodes.push(node);
    }

    // Sort labs by label
    nodes.sort((a, b) => a.label.localeCompare(b.label));
    return nodes;
  }

  /**
   * Create ContainerlabNode items for each container, then sort
   */
  private getContainerNodes(containers: any[]): ContainerlabNode[] {
    const containerNodes = containers.map((ctr: any) => {
      let ipWithoutSlash: string | undefined;
      if (ctr.ipv4_address) {
        const [ip] = ctr.ipv4_address.split('/');
        ipWithoutSlash = ip;
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

    // Sort containers by label
    containerNodes.sort((a, b) => a.label.localeCompare(b.label));
    return containerNodes;
  }

  /**
   * Find local *.clab.(yml|yaml) files. Returns absolute paths
   */
  private async findLocalClabFiles(): Promise<string[]> {
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
      return [];
    }

    const patterns = ['**/*.clab.yml', '**/*.clab.yaml'];
    const exclude = '**/node_modules/**';

    let uris: vscode.Uri[] = [];
    for (const pat of patterns) {
      const found = await vscode.workspace.findFiles(pat, exclude);
      uris.push(...found);
    }

    const set = new Set<string>();
    for (const uri of uris) {
      set.add(uri.fsPath);
    }
    return [...set];
  }

  /**
   * Inspect containerlab, expand tilde or relative paths => absolute
   */
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

    // Single workspace folder base
    let singleFolderBase: string | undefined;
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length === 1) {
      singleFolderBase = vscode.workspace.workspaceFolders[0].uri.fsPath;
    }

    for (const c of arr) {
      let p = c.labPath || '';
      p = this.normalizeLabPath(p, singleFolderBase);

      if (!map[p]) {
        map[p] = {
          labPath: p,
          localExists: false,
          containers: [],
          labName: c.lab_name,
          owner: c.owner
        };
      }
      map[p].containers.push(c);
    }

    return map;
  }

  /**
   * Expand tilde (~) or handle relative paths to unify them as absolute
   */
  private normalizeLabPath(labPath: string, singleFolderBase?: string): string {
    if (!labPath) {
      return labPath;
    }
  
    // Normalize path separators for current OS
    labPath = path.normalize(labPath);
  
    // If already absolute, just return it
    if (path.isAbsolute(labPath)) {
      return path.normalize(labPath);
    }
  
    // Handle tilde expansion, e.g. "~/..."
    if (labPath.startsWith('~')) {
      const homedir = os.homedir();
      const sub = labPath.replace(/^~\/?/, '');
      return path.normalize(path.join(homedir, sub));
    }
  
    // If it's relative, we need a base. If none, throw an error
    if (!singleFolderBase && !vscode.workspace.workspaceFolders?.length) {
      throw new Error('No workspace folder available for relative path resolution');
    }
  
    const baseFolder = singleFolderBase 
      || vscode.workspace.workspaceFolders![0].uri.fsPath;
  
    return path.normalize(path.resolve(baseFolder, labPath));
  }

}
