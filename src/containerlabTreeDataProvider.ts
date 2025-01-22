import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';

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

export class ContainerlabTreeDataProvider implements vscode.TreeDataProvider<ContainerlabNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ContainerlabNode | undefined | void>();
  public readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  getTreeItem(element: ContainerlabNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: ContainerlabNode): Promise<ContainerlabNode[]> {
    if (!element) {
      // Top-level: labs
      return this.getLabs();
    } else {
      // Child-level: containers
      const labName = element.details?.labName;
      return this.getContainersForLab(labName);
    }
  }

  public refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  private async getLabs(): Promise<ContainerlabNode[]> {
    let stdout: string;
    try {
      const result = await execAsync('sudo containerlab inspect --all --format json');
      stdout = result.stdout;
    } catch (error: any) {
      if (
        error.stdout?.includes('no containers found') ||
        error.message.includes('no containers found')
      ) {
        return [
          new ContainerlabNode('No labs found', vscode.TreeItemCollapsibleState.None)
        ];
      }
      vscode.window.showErrorMessage(`Failed to run containerlab inspect: ${error.message}`);
      return [];
    }

    let parsed: any;
    try {
      parsed = JSON.parse(stdout);
    } catch {
      if (stdout.includes('no containers found')) {
        return [
          new ContainerlabNode('No labs found', vscode.TreeItemCollapsibleState.None)
        ];
      }
      vscode.window.showErrorMessage('Cannot parse containerlab inspect JSON');
      return [];
    }

    const containersArray = parsed.containers || [];
    if (containersArray.length === 0) {
      return [
        new ContainerlabNode('No labs found', vscode.TreeItemCollapsibleState.None)
      ];
    }

    // Group by lab_name
    const labsMap: Record<string, any[]> = {};
    for (const c of containersArray) {
      const labName = c.lab_name || 'UnknownLab';
      if (!labsMap[labName]) {
        labsMap[labName] = [];
      }
      labsMap[labName].push(c);
    }

    // One node per lab
    return Object.keys(labsMap).map(labName => {
      const firstCtr = labsMap[labName][0];
      const labPath = firstCtr.labPath || '';

      return new ContainerlabNode(
        labName,
        vscode.TreeItemCollapsibleState.Collapsed,
        { labName, labPath },
        "containerlabLab"
      );
    });
  }

  private async getContainersForLab(labName: string): Promise<ContainerlabNode[]> {
    try {
      const { stdout } = await execAsync('sudo containerlab inspect --all --format json');
      const parsed = JSON.parse(stdout);
      const containersArray = parsed.containers || [];

      // Filter matching lab
      const matching = containersArray.filter((c: any) => c.lab_name === labName);

      // Convert each container to a leaf node
      return matching.map((ctr: any) => {
        let ipWithoutSlash: string | undefined;
        if (ctr.ipv4_address) {
          const split = ctr.ipv4_address.split('/');
          ipWithoutSlash = split[0];
        }

        const node = new ContainerlabNode(
          ctr.name,
          vscode.TreeItemCollapsibleState.None,
          {
            containerId: ctr.container_id,
            state: ctr.state,
            sshIp: ipWithoutSlash
          },
          "containerlabContainer"
        );

        node.tooltip = `Container: ${ctr.name}\nID: ${ctr.container_id}\nState: ${ctr.state}`;

        // Green icon if running, red if not
        if (ctr.state === 'running') {
          node.iconPath = new vscode.ThemeIcon(
            'circle-filled',
            new vscode.ThemeColor('testing.iconPassed')
          );
        } else {
          node.iconPath = new vscode.ThemeIcon(
            'circle-filled',
            new vscode.ThemeColor('testing.iconFailed')
          );
        }
        return node;
      });
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to get containers for lab ${labName}: ${error.message}`);
      return [];
    }
  }
}
