import * as vscode from "vscode";
import { promisify } from "util";
import { exec } from "child_process";
import { ContainerlabNode } from "../containerlabTreeDataProvider";
import { getInspectHtml } from "../webview/inspectHtml";

const execAsync = promisify(exec);

export async function inspectAllLabs(context: vscode.ExtensionContext) {
  try {
    const { stdout } = await execAsync("sudo containerlab inspect --all --format json");
    const parsed = JSON.parse(stdout);

    showInspectWebview(parsed.containers || [], "Inspect - All Labs", context.extensionUri);
  } catch (err: any) {
    vscode.window.showErrorMessage(`Failed to run containerlab inspect --all: ${err.message}`);
  }
}

export async function inspectOneLab(node: ContainerlabNode, context: vscode.ExtensionContext) {
  if (!node?.details?.labPath) {
    vscode.window.showErrorMessage("No lab path found for this lab.");
    return;
  }

  try {
    const { stdout } = await execAsync(`sudo containerlab inspect -t "${node.details.labPath}" --format json`);
    const parsed = JSON.parse(stdout);

    showInspectWebview(parsed.containers || [], `Inspect - ${node.label}`, context.extensionUri);
  } catch (err: any) {
    vscode.window.showErrorMessage(`Failed to inspect lab: ${err.message}`);
  }
}

function showInspectWebview(containers: any[], title: string, extensionUri: vscode.Uri) {
  const panel = vscode.window.createWebviewPanel(
    "clabInspect",
    title,
    vscode.ViewColumn.One,
    { enableScripts: true }
  );

  // Pass `panel.webview` + `extensionUri` to your HTML builder
  panel.webview.html = getInspectHtml(panel.webview, containers, extensionUri);
}
