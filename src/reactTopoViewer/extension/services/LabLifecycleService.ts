/**
 * Lab lifecycle service for React TopoViewer.
 * Handles deploy, destroy, and redeploy operations via VS Code commands.
 */

import * as vscode from "vscode";

import type { EndpointResult } from "../../shared/types/endpoint";

import { log } from "./logger";

/**
 * Action configuration for lab lifecycle commands.
 */
interface LabAction {
  command: string;
  resultMsg: string;
  errorMsg: string;
  noLabPath: string;
}

/**
 * Map of available lab lifecycle actions.
 */
const LAB_ACTIONS: Record<string, LabAction> = {
  deployLab: {
    command: "containerlab.lab.deploy",
    resultMsg: "Lab deployment initiated",
    errorMsg: "Error deploying lab",
    noLabPath: "No lab path provided for deployment"
  },
  destroyLab: {
    command: "containerlab.lab.destroy",
    resultMsg: "Lab destruction initiated",
    errorMsg: "Error destroying lab",
    noLabPath: "No lab path provided for destruction"
  },
  deployLabCleanup: {
    command: "containerlab.lab.deploy.cleanup",
    resultMsg: "Lab deployment with cleanup initiated",
    errorMsg: "Error deploying lab with cleanup",
    noLabPath: "No lab path provided for deployment with cleanup"
  },
  destroyLabCleanup: {
    command: "containerlab.lab.destroy.cleanup",
    resultMsg: "Lab destruction with cleanup initiated",
    errorMsg: "Error destroying lab with cleanup",
    noLabPath: "No lab path provided for destruction with cleanup"
  },
  redeployLab: {
    command: "containerlab.lab.redeploy",
    resultMsg: "Lab redeploy initiated",
    errorMsg: "Error redeploying lab",
    noLabPath: "No lab path provided for redeploy"
  },
  redeployLabCleanup: {
    command: "containerlab.lab.redeploy.cleanup",
    resultMsg: "Lab redeploy with cleanup initiated",
    errorMsg: "Error redeploying lab with cleanup",
    noLabPath: "No lab path provided for redeploy with cleanup"
  }
};

/**
 * Service for handling lab lifecycle operations (deploy, destroy, redeploy).
 * Executes containerlab commands via VS Code command palette.
 */
export class LabLifecycleService {
  /**
   * Handles lab lifecycle endpoint requests.
   * @param endpointName The action to perform (deployLab, destroyLab, etc.)
   * @param labPath The path to the lab topology file
   */
  async handleLabLifecycleEndpoint(endpointName: string, labPath: string): Promise<EndpointResult> {
    const action = LAB_ACTIONS[endpointName];
    if (!action) {
      const error = `Unknown endpoint "${endpointName}".`;
      log.error(error);
      return { result: null, error };
    }

    if (!labPath) {
      return { result: null, error: action.noLabPath };
    }

    try {
      const { ClabLabTreeNode } = await import("../../../treeView/common");
      const tempNode = new ClabLabTreeNode("", vscode.TreeItemCollapsibleState.None, {
        absolute: labPath,
        relative: ""
      });
      vscode.commands.executeCommand(action.command, tempNode);
      return { result: `${action.resultMsg} for ${labPath}`, error: null };
    } catch (innerError) {
      const error = `${action.errorMsg}: ${innerError}`;
      log.error(`${action.errorMsg}: ${JSON.stringify(innerError, null, 2)}`);
      return { result: null, error };
    }
  }
}

// Export a singleton instance
export const labLifecycleService = new LabLifecycleService();
