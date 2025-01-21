import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Simple TreeItem wrapper for either a Lab node or a Container node.
 */
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
  private _onDidChangeTreeData = new vscode.EventEmitter<ContainerlabNode | undefined | void>();
  public readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  /**
   * Called when VS Code needs to render an item in the tree.
   */
  getTreeItem(element: ContainerlabNode): vscode.TreeItem {
    return element;
  }

  /**
   * Called when VS Code needs the children of a given element in the tree.
   */
  async getChildren(element?: ContainerlabNode): Promise<ContainerlabNode[]> {
    if (!element) {
      // Top-level => show labs
      return this.getLabs();
    } else {
      // Child-level => show containers of that lab
      const labName = element.details?.labName;
      return this.getContainersForLab(labName);
    }
  }

  /**
   * Manually trigger a refresh of the tree.
   */
  public refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  /**
   * Get all labs from `containerlab inspect`, grouped by `lab_name`.
   * If no labs, return a single item "No labs found".
   */
  private async getLabs(): Promise<ContainerlabNode[]> {
    let stdout: string;

    try {
      const result = await execAsync('sudo containerlab inspect --all --format json');
      stdout = result.stdout;
    } catch (error: any) {
      if (error.stdout?.includes('no containers found') || error.message.includes('no containers found')) {
        return [
          new ContainerlabNode('No labs found', vscode.TreeItemCollapsibleState.None)
        ];
      }
      vscode.window.showErrorMessage(`Failed to run containerlab inspect: ${error.message}`);
      return [];
    }

    // Parse the JSON
    let parsed: any;
    try {
      parsed = JSON.parse(stdout);
    } catch {
      // Could not parse => maybe "no containers found"
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

    // Group containers by lab_name
    const labsMap: Record<string, any[]> = {};
    for (const c of containersArray) {
      const labName = c.lab_name || 'UnknownLab';
      if (!labsMap[labName]) {
        labsMap[labName] = [];
      }
      labsMap[labName].push(c);
    }

    // Create a node for each distinct lab
    return Object.keys(labsMap).map(labName => {
      // We'll pick the first container from that lab to get a "labPath"
      const first = labsMap[labName][0];
      const labPath = first.labPath || '';

      const labNode = new ContainerlabNode(
        labName,
        vscode.TreeItemCollapsibleState.Collapsed,
        { labName, labPath }
      );

      // Make the lab node clickable => open the .clab.yml file
      labNode.command = {
        command: 'containerlab.openLabFile',
        title: 'Open Lab File',
        arguments: [labPath]    // pass the path to our command
      };

      return labNode;
    });
  }

  /**
   * Returns child nodes for the given lab name (the containers).
   * Displays a green or red icon depending on whether the container is running or not.
   */
  private async getContainersForLab(labName: string): Promise<ContainerlabNode[]> {
    try {
      const { stdout } = await execAsync('sudo containerlab inspect --all --format json');
      const parsed = JSON.parse(stdout);
      const containersArray = parsed.containers || [];

      // Filter only containers for this lab
      const matching = containersArray.filter((c: any) => c.lab_name === labName);

      // Convert each container to a leaf node
      return matching.map((ctr: any) => {
        const containerNode = new ContainerlabNode(
          ctr.name,
          vscode.TreeItemCollapsibleState.None,
          {
            containerId: ctr.container_id,
            labName: ctr.lab_name,
            state: ctr.state
          }
        );

        // Tooltip
        containerNode.tooltip = `Container: ${ctr.name}\nID: ${ctr.container_id}\nState: ${ctr.state}`;

        // If container is running => green icon, else red
        if (ctr.state === 'running') {
          containerNode.iconPath = new vscode.ThemeIcon(
            'circle-filled',
            new vscode.ThemeColor('testing.iconPassed')  // green
          );
        } else {
          containerNode.iconPath = new vscode.ThemeIcon(
            'circle-filled',
            new vscode.ThemeColor('testing.iconFailed')  // red
          );
        }

        return containerNode;
      });
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to get containers for lab ${labName}: ${error.message}`);
      return [];
    }
  }
}
