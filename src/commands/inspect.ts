import * as vscode from "vscode";
import { promisify } from "util";
import { exec } from "child_process";
import { getInspectHtml } from "../webview/inspectHtml";
import { ClabLabTreeNode } from "../clabTreeDataProvider";

const execAsync = promisify(exec);

export async function inspectAllLabs(context: vscode.ExtensionContext) {
  try {
    const config = vscode.workspace.getConfiguration("containerlab");
    const runtime = config.get<string>("runtime", "docker");

    const { stdout } = await execAsync(`sudo containerlab inspect -r ${runtime} --all --format json`);
    const parsed = JSON.parse(stdout);

    showInspectWebview(parsed.containers || [], "Inspect - All Labs", context.extensionUri);
  } catch (err: any) {
    vscode.window.showErrorMessage(`Failed to run containerlab inspect --all: ${err.message}`);
  }
}

export async function inspectOneLab(node: ClabLabTreeNode, context: vscode.ExtensionContext) {
  if (!node.labPath.absolute) {
    vscode.window.showErrorMessage("No lab path found for this lab.");
    return;
  }

  try {
    const config = vscode.workspace.getConfiguration("containerlab");
    const runtime = config.get<string>("runtime", "docker");

    const { stdout } = await execAsync(`sudo containerlab inspect -r ${runtime} -t "${node.labPath.absolute}" --format json`);
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
