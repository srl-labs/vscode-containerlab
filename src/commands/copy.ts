import * as vscode from "vscode";
import * as utils from "../utils/utils";
import { ClabContainerTreeNode, ClabInterfaceTreeNode, ClabLabTreeNode } from "../treeView/common";

const ERR_NO_LAB_NODE = 'No lab node selected.';
const ERR_NO_IFACE_NODE = 'No interface node selected.';

// =============================================================================
// Dependency Injection Interface
// =============================================================================

/**
 * Dependencies required by copy commands.
 * Use `createCopyCommands` to create command implementations with custom deps for testing.
 */
export interface CopyDependencies {
  showInfo: typeof vscode.window.showInformationMessage;
  showError: typeof vscode.window.showErrorMessage;
  writeClipboard: typeof vscode.env.clipboard.writeText;
}

/**
 * Default dependencies using real VS Code APIs.
 */
const defaultDeps: CopyDependencies = {
  showInfo: vscode.window.showInformationMessage,
  showError: vscode.window.showErrorMessage,
  writeClipboard: vscode.env.clipboard.writeText,
};

// =============================================================================
// Factory Function for Creating Commands with Injected Dependencies
// =============================================================================

/**
 * Creates copy command implementations with the provided dependencies.
 * This allows tests to inject mock dependencies without module hijacking.
 */
// eslint-disable-next-line aggregate-complexity/aggregate-complexity
export function createCopyCommands(deps: CopyDependencies) {
  function copyLabPath(node: ClabLabTreeNode) {
    if (!node) {
      deps.showError(ERR_NO_LAB_NODE);
      return;
    }

    const labPath = node.labPath.absolute;
    if (!labPath) {
      deps.showError('No labPath found.');
      return;
    }

    const labName = node.labPath.absolute || utils.getRelativeFolderPath(labPath);

    deps.writeClipboard(labPath).then(() => {
      deps.showInfo(`Copied file path of ${labName} to clipboard.`);
    });
  }

  function copyContainerIPv4Address(node: ClabContainerTreeNode) {
    if (!node) {
      deps.showError(ERR_NO_LAB_NODE);
      return;
    }

    const containerName = node.name || "";

    const data = node.IPv4Address;
    if (!data) {
      deps.showError(`${containerName}: Could not fetch IPv4 address.`);
      return;
    }

    deps.writeClipboard(data).then(() => {
      deps.showInfo(`${containerName}: Copied IPv4 address to clipboard succesfully.`);
    });
  }

  function copyContainerIPv6Address(node: ClabContainerTreeNode) {
    if (!node) {
      deps.showError(ERR_NO_LAB_NODE);
      return;
    }

    const containerName = node.name || "";

    const data = node.IPv6Address;
    if (!data) {
      deps.showError(`${containerName}: Could not fetch IPv6 address.`);
      return;
    }

    deps.writeClipboard(data).then(() => {
      deps.showInfo(`${containerName}: Copied IPv6 address to clipboard succesfully.`);
    });
  }

  function copyContainerName(node: ClabContainerTreeNode) {
    if (!node) {
      deps.showError(ERR_NO_LAB_NODE);
      return;
    }

    const containerName = node.name || "";

    if (!containerName) {
      deps.showError(`${containerName}: Could not fetch container hostname.`);
      return;
    }

    deps.writeClipboard(containerName).then(() => {
      deps.showInfo(`${containerName}: Copied hostname to clipboard succesfully.`);
    });
  }

  function copyContainerID(node: ClabContainerTreeNode) {
    if (!node) {
      deps.showError(ERR_NO_LAB_NODE);
      return;
    }

    const containerName = node.name || "";

    const data = node.cID;
    if (!data) {
      deps.showError(`${containerName}: Could not fetch container ID.`);
      return;
    }

    deps.writeClipboard(data).then(() => {
      deps.showInfo(`${containerName}: Copied ID to clipboard succesfully.`);
    });
  }

  function copyContainerKind(node: ClabContainerTreeNode) {
    if (!node) {
      deps.showError(ERR_NO_LAB_NODE);
      return;
    }

    const containerName = node.name || "";

    const data = node.kind;
    if (!data) {
      deps.showError(`${containerName}: Could not fetch kind.`);
      return;
    }

    deps.writeClipboard(data).then(() => {
      deps.showInfo(`${containerName}: Copied kind to clipboard succesfully.`);
    });
  }

  function copyContainerImage(node: ClabContainerTreeNode) {
    if (!node) {
      deps.showError(ERR_NO_LAB_NODE);
      return;
    }

    const containerName = node.name || "";

    const data = node.image;
    if (!data) {
      deps.showError(`${containerName}: Could not fetch image.`);
      return;
    }

    deps.writeClipboard(data).then(() => {
      deps.showInfo(`${containerName}: Copied image to clipboard succesfully.`);
    });
  }

  function copyMACAddress(node: ClabInterfaceTreeNode) {
    if (!node) {
      deps.showError(ERR_NO_IFACE_NODE);
      return;
    }

    const intfName = node.name || "";

    const data = node.mac;
    if (!data) {
      deps.showError(`${intfName}: Could not fetch interface MAC address.`);
      return;
    }

    deps.writeClipboard(data).then(() => {
      deps.showInfo(`${intfName}: Copied MAC address to clipboard succesfully.`);
    });
  }

  return {
    copyLabPath,
    copyContainerIPv4Address,
    copyContainerIPv6Address,
    copyContainerName,
    copyContainerID,
    copyContainerKind,
    copyContainerImage,
    copyMACAddress,
  };
}

// =============================================================================
// Default Exports (using real VS Code APIs)
// =============================================================================

// Create commands with default (real) dependencies
const commands = createCopyCommands(defaultDeps);

// Re-export the commands using default dependencies for production use
export const copyLabPath = commands.copyLabPath;
export const copyContainerIPv4Address = commands.copyContainerIPv4Address;
export const copyContainerIPv6Address = commands.copyContainerIPv6Address;
export const copyContainerName = commands.copyContainerName;
export const copyContainerID = commands.copyContainerID;
export const copyContainerKind = commands.copyContainerKind;
export const copyContainerImage = commands.copyContainerImage;
export const copyMACAddress = commands.copyMACAddress;
