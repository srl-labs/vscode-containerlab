import * as vscode from "vscode";

import { execCmdMapping } from "../globals";
import type { ClabContainerTreeNode } from "../treeView/common";
import { DEFAULT_ATTACH_SHELL_CMD, DEFAULT_ATTACH_TELNET_PORT } from "../utils";

import { execCommandInTerminal } from "./command";

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

  const defaultMapping = execCmdMapping as Record<string, string>;
  let execCmd = defaultMapping[ctx.containerKind] ?? DEFAULT_ATTACH_SHELL_CMD;
  const config = vscode.workspace.getConfiguration("containerlab");
  const userExecMapping = config.get<Record<string, string>>("node.execCommandMapping", {});
  const runtime = config.get<string>("runtime", "docker");

  execCmd = userExecMapping[ctx.containerKind] ?? execCmd;

  execCommandInTerminal(
    `${runtime} exec -it ${ctx.containerId} ${execCmd}`,
    `Shell - ${ctx.container}`,
    true // If terminal exists, just focus it
  );
}

export function telnetToNode(node: ClabContainerTreeNode | undefined): void {
  const ctx = getNodeContext(node);
  if (!ctx) return;
  const config = vscode.workspace.getConfiguration("containerlab");
  const port = config.get<number>("node.telnetPort", DEFAULT_ATTACH_TELNET_PORT);
  const runtime = config.get<string>("runtime", "docker");
  execCommandInTerminal(
    `${runtime} exec -it ${ctx.containerId} telnet 127.0.0.1 ${port}`,
    `Telnet - ${ctx.container}`,
    true // If terminal exists, just focus it
  );
}
