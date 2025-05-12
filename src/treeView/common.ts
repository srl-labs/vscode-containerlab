import * as vscode from "vscode"

// Enum to store types of container state icons.
export enum CtrStateIcons {
    RUNNING = "icons/running.svg",
    STOPPED = "icons/stopped.svg",
    PARTIAL = "icons/partial.svg",
    UNDEPLOYED = "icons/undeployed.svg"
}

// Tree node for a lab
export class ClabLabTreeNode extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly labPath: LabPath,
    public readonly name?: string,
    public readonly owner?: string,
    contextValue?: string,
  ) {
    super(label, collapsibleState);
    this.contextValue = contextValue;
  }
}

// LabPath interface
export interface LabPath {
  absolute: string,
  relative: string
}