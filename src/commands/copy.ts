import * as vscode from "vscode";
import * as utils from "../utils";
import { ContainerlabNode } from "../containerlabTreeDataProvider";

export function copyLabPath(node: ContainerlabNode) {
  if (!node) {
    vscode.window.showErrorMessage('No lab node selected.');
    return;
  }

  const labPath = node.details?.labPath;
  if (!labPath) {
    vscode.window.showErrorMessage('No labPath found.');
    return;
  }

  const labName = node.details?.labName || utils.getRelativeFolderPath(labPath);

  vscode.env.clipboard.writeText(labPath).then(() => {
    vscode.window.showInformationMessage(`Copied file path of ${labName} to clipboard.`);
  });
}

export function copyContainerIPv4Address(node: ContainerlabNode) {
  if (!node) {
    vscode.window.showErrorMessage('No lab node selected.');
    return;
  }

  const containerName = node.details?.hostname || "";

  const data = node.details?.v4Addr;
  if (!data) {
    vscode.window.showErrorMessage(`${containerName}: Could not fetch IPv4 address.`);
    return;
  }


  vscode.env.clipboard.writeText(data).then(() => {
    vscode.window.showInformationMessage(`${containerName}: Copied IPv4 address to clipboard succesfully.`);
  });
}

export function copyContainerIPv6Address(node: ContainerlabNode) {
  if (!node) {
    vscode.window.showErrorMessage('No lab node selected.');
    return;
  }

  const containerName = node.details?.hostname || "";

  const data = node.details?.v6Addr;
  if (!data) {
    vscode.window.showErrorMessage(`${containerName}: Could not fetch IPv6 address.`);
    return;
  }


  vscode.env.clipboard.writeText(data).then(() => {
    vscode.window.showInformationMessage(`${containerName}: Copied IPv6 address to clipboard succesfully.`);
  });
}

export function copyContainerName(node: ContainerlabNode) {
  if (!node) {
    vscode.window.showErrorMessage('No lab node selected.');
    return;
  }

  const containerName = node.details?.hostname;

  if (!containerName) {
    vscode.window.showErrorMessage(`${containerName}: Could not fetch container hostname.`);
    return;
  }


  vscode.env.clipboard.writeText(containerName).then(() => {
    vscode.window.showInformationMessage(`${containerName}: Copied hostname to clipboard succesfully.`);
  });
}

export function copyContainerID(node: ContainerlabNode) {
  if (!node) {
    vscode.window.showErrorMessage('No lab node selected.');
    return;
  }

  const containerName = node.details?.hostname || "";

  const data = node.details?.containerId;
  if (!data) {
    vscode.window.showErrorMessage(`${containerName}: Could not fetch container ID.`);
    return;
  }


  vscode.env.clipboard.writeText(data).then(() => {
    vscode.window.showInformationMessage(`${containerName}: Copied ID to clipboard succesfully.`);
  });
}

export function copyContainerKind(node: ContainerlabNode) {
  if (!node) {
    vscode.window.showErrorMessage('No lab node selected.');
    return;
  }

  const containerName = node.details?.hostname || "";

  const data = node.details?.kind;
  if (!data) {
    vscode.window.showErrorMessage(`${containerName}: Could not fetch kind.`);
    return;
  }


  vscode.env.clipboard.writeText(data).then(() => {
    vscode.window.showInformationMessage(`${containerName}: Copied kind to clipboard succesfully.`);
  });
}

export function copyContainerImage(node: ContainerlabNode) {
  if (!node) {
    vscode.window.showErrorMessage('No lab node selected.');
    return;
  }

  const containerName = node.details?.hostname || "";

  const data = node.details?.image;
  if (!data) {
    vscode.window.showErrorMessage(`${containerName}: Could not fetch image.`);
    return;
  }


  vscode.env.clipboard.writeText(data).then(() => {
    vscode.window.showInformationMessage(`${containerName}: Copied image to clipboard succesfully.`);
  });
}
