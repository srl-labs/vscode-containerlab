// ./src/commands/impairments.ts
import * as vscode from "vscode";

import { ClabInterfaceTreeNode } from "../treeView/common";
import { containerlabBinaryPath } from "../globals";

import { execCommandInOutput } from "./command";

// Common validation messages and patterns
const ERR_EMPTY = 'Input should not be empty';
const TIME_UNIT_RE = /^\d+(ms|s)$/;
const ERR_TIME_UNIT = 'Input should be a number and a time unit. Either ms (milliseconds) or s (seconds)';

function impairmentsAvailable(): boolean {
  if (vscode.env.remoteName === "wsl") {
    vscode.window.showWarningMessage("Link impairment options are not available for WSL connections.");
    return false;
  }
  return true;
}

async function setImpairment(node: ClabInterfaceTreeNode, impairment?: string, value?: string): Promise<void> {
  if (!impairmentsAvailable()) {
    return;
  }
  const impairmentFlag = impairment ? `--${impairment}` : undefined;
  if (impairment && !value) { return; }
  const cmd = `${containerlabBinaryPath} tools netem set --node ${node.parentName} --interface ${node.name} ${impairmentFlag} ${value}`;
  const msg = `set ${impairment} to ${value} for ${node.name} on ${node.parentName}.`;
  vscode.window.showInformationMessage(`Attempting to ${msg}`);
  execCommandInOutput(cmd, false,
    () => { vscode.window.showInformationMessage(`Successfully ${msg}`); },
    (_proc: unknown, stderr: string): void => {
      vscode.window.showErrorMessage(`Failed to ${msg}\n\n${stderr}.`);
    }
  );
}

async function promptImpairment(
  node: ClabInterfaceTreeNode,
  impairment: string,
  title: string,
  placeHolder: string,
  validator: (_input: string) => string | undefined): Promise<void> {
  if (!node || !(node instanceof ClabInterfaceTreeNode)) {
    vscode.window.showErrorMessage(`No interface selected to set ${impairment} for.`);
    return;
  }
  if (!impairmentsAvailable()) {
    return;
  }
  const val = await vscode.window.showInputBox({ title, placeHolder, validateInput: validator });
  setImpairment(node, impairment, val);
}

export async function setLinkDelay(node: ClabInterfaceTreeNode): Promise<void> {
  await promptImpairment(
    node,
    "delay",
    `Set link delay for ${node.name} on ${node.parentName}`,
    `Link delay with time unit. ie: 50ms, 1s, 30s`,
    (input) => {
      if (input.length === 0) { return ERR_EMPTY; }
      if (!TIME_UNIT_RE.test(input)) { return ERR_TIME_UNIT; }
      return undefined;
    }
  );
}

export async function setLinkJitter(node: ClabInterfaceTreeNode): Promise<void> {
  await promptImpairment(
    node,
    "jitter",
    `Set link jitter for ${node.name} on ${node.parentName}`,
    `Jitter with time unit. ie: 50ms, 1s, 30s`,
    (input) => {
      if (input.length === 0) { return ERR_EMPTY; }
      if (!TIME_UNIT_RE.test(input)) { return ERR_TIME_UNIT; }
      return undefined;
    }
  );
}

export async function setLinkLoss(node: ClabInterfaceTreeNode): Promise<void> {
  await promptImpairment(
    node,
    "loss",
    `Set packet loss for ${node.name} on ${node.parentName}`,
    `Packet loss as a percentage. ie 50 means 50% packet loss`,
    (input) => {
      if (input.length === 0) { return ERR_EMPTY; }
      const re = /^(?:[1-9]\d?|100)$/;
      if (!re.test(input)) { return "Input should be a number between 0 and 100."; }
      return undefined;
    }
  );
}

export async function setLinkRate(node: ClabInterfaceTreeNode): Promise<void> {
  await promptImpairment(
    node,
    "rate",
    `Set egress rate-limit for ${node.name} on ${node.parentName}`,
    `Rate-limit in kbps. ie 100 means 100kbit/s`,
    (input) => {
      if (input.length === 0) { return ERR_EMPTY; }
      const re = /^\d+$/;
      if (!re.test(input)) { return "Input should be a number"; }
      return undefined;
    }
  );
}

export async function setLinkCorruption(node: ClabInterfaceTreeNode): Promise<void> {
  await promptImpairment(
    node,
    "corruption",
    `Set packet corruption for ${node.name} on ${node.parentName}`,
    `Packet corruption as a percentage. ie 50 means 50% probability of packet corruption.`,
    (input) => {
      if (input.length === 0) { return ERR_EMPTY; }
      const re = /^(?:[1-9]\d?|100)$/;
      if (!re.test(input)) { return "Input should be a number between 0 and 100."; }
      return undefined;
    }
  );
}
