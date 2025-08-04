// ./src/commands/impairments.ts
import * as vscode from "vscode";
import * as utils from "../helpers/utils";
import { ClabInterfaceTreeNode } from "../treeView/common";
import { execCommandInOutput } from "./command";

/**
 * Helper function to check if impairment options are available.
 * If the connection is WSL, a warning is displayed and returns false.
 */
function impairmentsAvailable(): boolean {
  if (vscode.env.remoteName === "wsl") {
    vscode.window.showWarningMessage("Link impairment options are not available for WSL connections.");
    return false;
  }
  return true;
}

/**
 * Base function to apply the impairment to an interface.
 *
 * @param node Interface to set the link impairment on
 * @param impairment The impairment flag (ie. 'jitter', 'loss' etc.)
 * @param value The value of the impairment (ie. If impairment is jitter, this could be '50ms').
 */
async function setImpairment(node: ClabInterfaceTreeNode, impairment?: string, value?: string): Promise<any> {
  if (!impairmentsAvailable()) {
    return;
  }

  const impairmentFlag = impairment ? `--${impairment}` : undefined;
  if (impairment && !value) { return; }

  const cmd = `${utils.getSudo()}containerlab tools netem set --node ${node.parentName} --interface ${node.name} ${impairmentFlag} ${value}`;

  const msg = `set ${impairment} to ${value} for ${node.name} on ${node.parentName}.`;

  vscode.window.showInformationMessage(`Attempting to ${msg}`);

  // Begin executing the command.
  execCommandInOutput(cmd, false,
    () => {
      vscode.window.showInformationMessage(`Successfully ${msg}`);
    },
    (proc: unknown, stderr: string) => {
      vscode.window.showErrorMessage(`Failed to ${msg}\n\n${stderr}.`);
    }
  );
}

/**
 * Set delay on a link
 * https://containerlab.dev/cmd/tools/netem/set/#delay
 *
 * @param node Interface that delay is to be set on.
 */
export async function setLinkDelay(node: ClabInterfaceTreeNode): Promise<any> {
  if (!node || !(node instanceof ClabInterfaceTreeNode)) {
    vscode.window.showErrorMessage("No interface selected to set delay for.");
    return;
  }

  if (!impairmentsAvailable()) {
    return;
  }

  const opts: vscode.InputBoxOptions = {
    title: `Set link delay for ${node.name} on ${node.parentName}`,
    placeHolder: `Link delay with time unit. ie: 50ms, 1s, 30s`,
    validateInput: (input: string) => {
      if (input.length === 0) { return "Input should not be empty"; }
      if (!(input.match("[0-9]+(ms|s)$"))) { return "Input should be a number and a time unit. Either ms (milliseconds) or s (seconds)"; }
    }
  };

  const val = await vscode.window.showInputBox(opts);
  setImpairment(node, "delay", val);
}

/**
 * Set jitter on a link
 * https://containerlab.dev/cmd/tools/netem/set/#jitter
 *
 * @param node Interface that jitter is to be set on.
 */
export async function setLinkJitter(node: ClabInterfaceTreeNode): Promise<any> {
  if (!node || !(node instanceof ClabInterfaceTreeNode)) {
    vscode.window.showErrorMessage("No interface selected to set jitter for.");
    return;
  }

  if (!impairmentsAvailable()) {
    return;
  }

  const opts: vscode.InputBoxOptions = {
    title: `Set link jitter for ${node.name} on ${node.parentName}`,
    placeHolder: `Jitter with time unit. ie: 50ms, 1s, 30s`,
    validateInput: (input: string) => {
      if (input.length === 0) { return "Input should not be empty"; }
      if (!(input.match("[0-9]+(ms|s)$"))) { return "Input should be a number and a time unit. Either ms (milliseconds) or s (seconds)"; }
    }
  };

  const val = await vscode.window.showInputBox(opts);
  setImpairment(node, "jitter", val);
}

/**
 * Set packet loss on a link
 * https://containerlab.dev/cmd/tools/netem/set/#loss
 *
 * @param node Interface that packet loss is to be set on.
 */
export async function setLinkLoss(node: ClabInterfaceTreeNode): Promise<any> {
  if (!node || !(node instanceof ClabInterfaceTreeNode)) {
    vscode.window.showErrorMessage("No interface selected to set loss for.");
    return;
  }

  if (!impairmentsAvailable()) {
    return;
  }

  const opts: vscode.InputBoxOptions = {
    title: `Set packet loss for ${node.name} on ${node.parentName}`,
    placeHolder: `Packet loss as a percentage. ie 50 means 50% packet loss`,
    validateInput: (input: string) => {
      if (input.length === 0) { return "Input should not be empty"; }
      if (!(input.match("[1-9][0-9]?$|^100$"))) { return "Input should be a number between 0 and 100."; }
    }
  };

  const val = await vscode.window.showInputBox(opts);
  setImpairment(node, "loss", val);
}

/**
 * Set egress rate-limit on a link
 * https://containerlab.dev/cmd/tools/netem/set/#rate
 *
 * @param node Interface that rate-limiting is to be set on.
 */
export async function setLinkRate(node: ClabInterfaceTreeNode): Promise<any> {
  if (!node || !(node instanceof ClabInterfaceTreeNode)) {
    vscode.window.showErrorMessage("No interface selected to set a rate-limit for.");
    return;
  }

  if (!impairmentsAvailable()) {
    return;
  }

  const opts: vscode.InputBoxOptions = {
    title: `Set egress rate-limit for ${node.name} on ${node.parentName}`,
    placeHolder: `Rate-limit in kbps. ie 100 means 100kbit/s`,
    validateInput: (input: string) => {
      if (input.length === 0) { return "Input should not be empty"; }
      if (!(input.match("[0-9]+"))) { return "Input should be a number"; }
    }
  };

  const val = await vscode.window.showInputBox(opts);
  setImpairment(node, "rate", val);
}

/**
 * Set corruption on a link
 * https://containerlab.dev/cmd/tools/netem/set/#corruption
 *
 * @param node Interface that link corruption is to be set on.
 */
export async function setLinkCorruption(node: ClabInterfaceTreeNode): Promise<any> {
  if (!node || !(node instanceof ClabInterfaceTreeNode)) {
    vscode.window.showErrorMessage("No interface selected to set packet corruption for.");
    return;
  }

  if (!impairmentsAvailable()) {
    return;
  }

  const opts: vscode.InputBoxOptions = {
    title: `Set packet corruption for ${node.name} on ${node.parentName}`,
    placeHolder: `Packet corruption as a percentage. ie 50 means 50% probability of packet corruption.`,
    validateInput: (input: string) => {
      if (input.length === 0) { return "Input should not be empty"; }
      if (!(input.match("[1-9][0-9]?$|^100$"))) { return "Input should be a number between 0 and 100."; }
    }
  };

  const val = await vscode.window.showInputBox(opts);
  setImpairment(node, "corruption", val);
}
