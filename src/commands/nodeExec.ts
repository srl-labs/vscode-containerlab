import * as vscode from "vscode";
import * as utils from "../helpers/utils";
import { execCommandInTerminal } from "./command";
import { execCmdMapping } from "../extension";
import { ClabContainerTreeNode } from "../treeView/common";

interface NodeContext {
  containerId: string;
  containerKind: string;
  container: string;
}

function getNodeContext(node: ClabContainerTreeNode | undefined): NodeContext | undefined {
  if (!node) {
    vscode.window.showErrorMessage("No container node selected.");
    return undefined;
  }
  const containerId = node.cID;
  const containerKind = node.kind;
  if (!containerId) {
    vscode.window.showErrorMessage("No containerId for shell attach.");
    return undefined;
  }
  if (!containerKind) {
    vscode.window.showErrorMessage("No container kind for shell attach.");
    return undefined;
  }
  const container = node.name || containerId;
  return { containerId, containerKind, container };
}

export function attachShell(node: ClabContainerTreeNode | undefined): void {
  const ctx = getNodeContext(node);
  if (!ctx) return;

  let execCmd = (execCmdMapping as any)[ctx.containerKind] || "sh";
  const config = vscode.workspace.getConfiguration("containerlab");
  const userExecMapping = config.get("node.execCommandMapping") as { [key: string]: string };
  const runtime = config.get<string>("runtime", "docker");

  execCmd = userExecMapping[ctx.containerKind] || execCmd;

  execCommandInTerminal(
    `${utils.getSudo()}${runtime} exec -it ${ctx.containerId} ${execCmd}`,
    `Shell - ${ctx.container}`
  );
}

export function telnetToNode(node: ClabContainerTreeNode | undefined): void {
  const ctx = getNodeContext(node);
  if (!ctx) return;
  const config = vscode.workspace.getConfiguration("containerlab");
  const port = (config.get("node.telnetPort") as number) || 5000;
  const runtime = config.get<string>("runtime", "docker");
  execCommandInTerminal(
    `${utils.getSudo()}${runtime} exec -it ${ctx.containerId} telnet 127.0.0.1 ${port}`,
    `Telnet - ${ctx.container}`
  );
}
