import * as vscode from "vscode";
import * as path from 'path';

export function stripAnsi(input: string): string {
    return input
      // First, remove all ESC [ <stuff> m sequences
      .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "")
      // Remove any leftover single ESC or other escape codes
      .replace(/\x1B[@-Z\\-_]/g, "");
  }

export function stripFileName(path: string): string {
    // remove stuff after the final '/' in the path
    return path.substring(0, path.lastIndexOf("/"));
}

export function getRelativeFolderPath(targetPath: string): string {
    const workspacePath = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.path : ""
    return path.relative(workspacePath, targetPath);
}

export function getRelLabFolderPath(labPath: string): string {
    return stripFileName(getRelativeFolderPath(labPath));
}