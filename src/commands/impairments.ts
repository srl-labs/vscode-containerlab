// ./src/commands/impairments.ts
import * as vscode from "vscode";

import { ClabInterfaceTreeNode } from "../treeView/common";
import { containerlabBinaryPath } from "../globals";

import { execCommandInOutput } from "./command";

// Common validation messages and patterns
const ERR_EMPTY = "Input should not be empty";
const TIME_UNIT_RE = /^\d+(ms|s)$/;
const ERR_TIME_UNIT =
  "Input should be a number and a time unit. Either ms (milliseconds) or s (seconds)";
const NETEM_FIELDS = ["delay", "jitter", "loss", "rate", "corruption"];

function impairmentsAvailable(): boolean {
  return true;
}

/**
 * Set impairment on an interface. Assumes impairment values are validated.
 * @param node interface to set impairment on
 * @param impairment object with impairment values to set
 */
export async function setImpairment(
  node: ClabInterfaceTreeNode,
  impairment?: Record<string, unknown>
): Promise<void> {
  if (!impairmentsAvailable() || !impairment) {
    return;
  }

  const impairmentFlag = Object.entries(impairment)
    .filter(([key, value]) => NETEM_FIELDS.includes(key) && typeof value === "string")
    .map(([key, value]) => `--${key} ${value}`)
    .join(" ");

  if (impairmentFlag === "") {
    return;
  }
  const cmd = `${containerlabBinaryPath} tools netem set --node ${node.parentName} --interface ${node.name} ${impairmentFlag}`;
  const msg = `set link impairment to ${JSON.stringify(impairment)} for ${node.name} on ${node.parentName}.`;
  vscode.window.showInformationMessage(`Attempting to ${msg}`);

  void execCommandInOutput(
    cmd,
    false,
    () => {
      vscode.window.showInformationMessage(`Successfully ${msg}`);
    },
    (_proc: unknown, stderr: string): void => {
      vscode.window.showErrorMessage(`Failed to ${msg}\n\n${stderr}.`);
    }
  );
}

async function promptImpairment(
  node: ClabInterfaceTreeNode | undefined,
  impairment: string,
  title: string,
  placeHolder: string,
  validator: (_input: string) => string | undefined
): Promise<void> {
  if (!(node instanceof ClabInterfaceTreeNode)) {
    vscode.window.showErrorMessage(`No interface selected to set ${impairment} for.`);
    return;
  }
  if (!impairmentsAvailable()) {
    return;
  }
  const val = await vscode.window.showInputBox({ title, placeHolder, validateInput: validator });
  const netemData: Record<string, string | undefined> = {};
  netemData[impairment] = val;
  void setImpairment(node, netemData);
}

export async function setLinkDelay(node?: ClabInterfaceTreeNode): Promise<void> {
  if (node === undefined) {
    vscode.window.showErrorMessage("No interface selected to set delay for.");
    return;
  }
  await promptImpairment(
    node,
    "delay",
    `Set link delay for ${node.name} on ${node.parentName}`,
    `Link delay with time unit. ie: 50ms, 1s, 30s`,
    (input) => {
      if (input.length === 0) {
        return ERR_EMPTY;
      }
      if (!TIME_UNIT_RE.test(input)) {
        return ERR_TIME_UNIT;
      }
      return undefined;
    }
  );
}

export async function setLinkJitter(node?: ClabInterfaceTreeNode): Promise<void> {
  if (node === undefined) {
    vscode.window.showErrorMessage("No interface selected to set jitter for.");
    return;
  }
  await promptImpairment(
    node,
    "jitter",
    `Set link jitter for ${node.name} on ${node.parentName}`,
    `Jitter with time unit. ie: 50ms, 1s, 30s`,
    (input) => {
      if (input.length === 0) {
        return ERR_EMPTY;
      }
      if (!TIME_UNIT_RE.test(input)) {
        return ERR_TIME_UNIT;
      }
      return undefined;
    }
  );
}

export async function setLinkLoss(node?: ClabInterfaceTreeNode): Promise<void> {
  if (node === undefined) {
    vscode.window.showErrorMessage("No interface selected to set loss for.");
    return;
  }
  await promptImpairment(
    node,
    "loss",
    `Set packet loss for ${node.name} on ${node.parentName}`,
    `Packet loss as a percentage. ie 50 means 50% packet loss`,
    (input) => {
      if (input.length === 0) {
        return ERR_EMPTY;
      }
      const re = /^(?:[1-9]\d?|100|0)$/;
      if (!re.test(input)) {
        return "Input should be a number between 0 and 100.";
      }
      return undefined;
    }
  );
}

export async function setLinkRate(node?: ClabInterfaceTreeNode): Promise<void> {
  if (node === undefined) {
    vscode.window.showErrorMessage("No interface selected to set rate for.");
    return;
  }
  await promptImpairment(
    node,
    "rate",
    `Set egress rate-limit for ${node.name} on ${node.parentName}`,
    `Rate-limit in kbps. ie 100 means 100kbit/s`,
    (input) => {
      if (input.length === 0) {
        return ERR_EMPTY;
      }
      const re = /^\d+$/;
      if (!re.test(input)) {
        return "Input should be a number";
      }
      return undefined;
    }
  );
}

export async function setLinkCorruption(node?: ClabInterfaceTreeNode): Promise<void> {
  if (node === undefined) {
    vscode.window.showErrorMessage("No interface selected to set corruption for.");
    return;
  }
  await promptImpairment(
    node,
    "corruption",
    `Set packet corruption for ${node.name} on ${node.parentName}`,
    `Packet corruption as a percentage. ie 50 means 50% probability of packet corruption.`,
    (input) => {
      if (input.length === 0) {
        return ERR_EMPTY;
      }
      const re = /^(?:[1-9]\d?|100|0)$/;
      if (!re.test(input)) {
        return "Input should be a number between 0 and 100.";
      }
      return undefined;
    }
  );
}
