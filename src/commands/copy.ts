import * as vscode from "vscode";
import * as utils from "../helpers/utils";
import { ClabContainerTreeNode, ClabInterfaceTreeNode, ClabLabTreeNode } from "../treeView/common";

const ERR_NO_LAB_NODE = 'No lab node selected.';
const ERR_NO_IFACE_NODE = 'No interface node selected.';

export function copyLabPath(node: ClabLabTreeNode) {
  if (!node) {
    vscode.window.showErrorMessage(ERR_NO_LAB_NODE);
    return;
  }

  const labPath = node.labPath.absolute;
  if (!labPath) {
    vscode.window.showErrorMessage('No labPath found.');
    return;
  }

  const labName = node.labPath.absolute || utils.getRelativeFolderPath(labPath);

  vscode.env.clipboard.writeText(labPath).then(() => {
    vscode.window.showInformationMessage(`Copied file path of ${labName} to clipboard.`);
  });
}

export function copyContainerIPv4Address(node: ClabContainerTreeNode) {
  if (!node) {
    vscode.window.showErrorMessage(ERR_NO_LAB_NODE);
    return;
  }

  const containerName = node.name || "";

  const data = node.IPv4Address;
  if (!data) {
    vscode.window.showErrorMessage(`${containerName}: Could not fetch IPv4 address.`);
    return;
  }


  vscode.env.clipboard.writeText(data).then(() => {
    vscode.window.showInformationMessage(`${containerName}: Copied IPv4 address to clipboard succesfully.`);
  });
}

export function copyContainerIPv6Address(node: ClabContainerTreeNode) {
  if (!node) {
    vscode.window.showErrorMessage(ERR_NO_LAB_NODE);
    return;
  }

  const containerName = node.name || "";

  const data = node.IPv6Address;
  if (!data) {
    vscode.window.showErrorMessage(`${containerName}: Could not fetch IPv6 address.`);
    return;
  }


  vscode.env.clipboard.writeText(data).then(() => {
    vscode.window.showInformationMessage(`${containerName}: Copied IPv6 address to clipboard succesfully.`);
  });
}

export function copyContainerName(node: ClabContainerTreeNode) {
  if (!node) {
    vscode.window.showErrorMessage(ERR_NO_LAB_NODE);
    return;
  }

  const containerName = node.name || "";

  if (!containerName) {
    vscode.window.showErrorMessage(`${containerName}: Could not fetch container hostname.`);
    return;
  }


  vscode.env.clipboard.writeText(containerName).then(() => {
    vscode.window.showInformationMessage(`${containerName}: Copied hostname to clipboard succesfully.`);
  });
}

export function copyContainerID(node: ClabContainerTreeNode) {
  if (!node) {
    vscode.window.showErrorMessage(ERR_NO_LAB_NODE);
    return;
  }

  const containerName = node.name || "";

  const data = node.cID;
  if (!data) {
    vscode.window.showErrorMessage(`${containerName}: Could not fetch container ID.`);
    return;
  }


  vscode.env.clipboard.writeText(data).then(() => {
    vscode.window.showInformationMessage(`${containerName}: Copied ID to clipboard succesfully.`);
  });
}

export function copyContainerKind(node: ClabContainerTreeNode) {
  if (!node) {
    vscode.window.showErrorMessage(ERR_NO_LAB_NODE);
    return;
  }

  const containerName = node.name || "";

  const data = node.kind;
  if (!data) {
    vscode.window.showErrorMessage(`${containerName}: Could not fetch kind.`);
    return;
  }


  vscode.env.clipboard.writeText(data).then(() => {
    vscode.window.showInformationMessage(`${containerName}: Copied kind to clipboard succesfully.`);
  });
}

export function copyContainerImage(node: ClabContainerTreeNode) {
  if (!node) {
    vscode.window.showErrorMessage(ERR_NO_LAB_NODE);
    return;
  }

  const containerName = node.name || "";

  const data = node.image;
  if (!data) {
    vscode.window.showErrorMessage(`${containerName}: Could not fetch image.`);
    return;
  }


  vscode.env.clipboard.writeText(data).then(() => {
    vscode.window.showInformationMessage(`${containerName}: Copied image to clipboard succesfully.`);
  });
}

export function copyMACAddress(node: ClabInterfaceTreeNode) {
  if (!node) {
    vscode.window.showErrorMessage(ERR_NO_IFACE_NODE);
    return;
  }

  const intfName = node.name || "";

  const data = node.mac;
  if (!data) {
    vscode.window.showErrorMessage(`${intfName}: Could not fetch interface MAC address.`);
    return;
  }


  vscode.env.clipboard.writeText(data).then(() => {
    vscode.window.showInformationMessage(`${intfName}: Copied MAC address to clipboard succesfully.`);
  });


}
