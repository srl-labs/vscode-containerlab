import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class ContainerlabNode extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly details?: any
  ) {
    super(label, collapsibleState);
  }
}

export class ContainerlabTreeDataProvider implements vscode.TreeDataProvider<ContainerlabNode> {
  private _onDidChangeTreeData: vscode.EventEmitter<ContainerlabNode | undefined | void> =
    new vscode.EventEmitter<ContainerlabNode | undefined | void>();
  public readonly onDidChangeTreeData: vscode.Event<ContainerlabNode | undefined | void> =
    this._onDidChangeTreeData.event;

  public refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: ContainerlabNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: ContainerlabNode): Promise<ContainerlabNode[]> {
    if (!element) {
      // Top-level: Show labs
      return this.getLabs();
    } else {
      // Child-level: Show containers for a given lab
      return this.getContainersForLab(element.details.labName);
    }
  }

  private async getLabs(): Promise<ContainerlabNode[]> {
    try {
      const { stdout } = await execAsync('sudo containerlab inspect --all -f json');

      // Parse the JSON, then grab the 'containers' array
      const parsed = JSON.parse(stdout);
      const containersArray = parsed.containers || []; // fallback to empty array

      // Group containers by lab_name
      const labsMap: Record<string, any[]> = {};
      for (const c of containersArray) {
        const labName = c.lab_name || 'UnknownLab';
        if (!labsMap[labName]) {
          labsMap[labName] = [];
        }
        labsMap[labName].push(c);
      }

      // Convert each lab_name into a TreeItem
      return Object.keys(labsMap).map((labName) => {
        return new ContainerlabNode(
          labName,
          vscode.TreeItemCollapsibleState.Collapsed,
          { labName } // Store the name so we can filter containers next
        );
      });

    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to run sudo containerlab inspect: ${error.message}`);
      return [];
    }
  }

  private async getContainersForLab(labName: string): Promise<ContainerlabNode[]> {
    try {
      const { stdout } = await execAsync('sudo containerlab inspect --all -f json');

      // Again, parse the top-level object, then .containers
      const parsed = JSON.parse(stdout);
      const containersArray = parsed.containers || [];

      // Filter containers belonging to our lab
      const matching = containersArray.filter((c: any) => c.lab_name === labName);

      // Return each container as a leaf TreeItem
      return matching.map((ctr: { name: string; container_id: any; lab_name: any; state: any; }) => {
        const item = new ContainerlabNode(
          ctr.name,
          vscode.TreeItemCollapsibleState.None,
          { containerId: ctr.container_id, labName: ctr.lab_name }
        );

        // Example of tooltip
        item.tooltip = `Container: ${ctr.name}\nID: ${ctr.container_id}\nState: ${ctr.state}`;
        return item;
      });

    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to get containers for lab: ${error.message}`);
      return [];
    }
  }
}
