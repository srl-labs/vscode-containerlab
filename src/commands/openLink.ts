import * as vscode from "vscode";

export function openLink(url: string): void {
  vscode.env.openExternal(vscode.Uri.parse(url));
}
