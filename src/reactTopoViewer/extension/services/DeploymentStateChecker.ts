/**
 * Deployment state checker for React TopoViewer.
 * Queries containerlab inspect data to determine if a lab is deployed.
 */

import * as inspector from "../../../treeView/inspector";
import type { DeploymentState } from "../../shared/types/topology";

import { log } from "./logger";

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * Checks deployment state of containerlab labs by querying inspect data.
 */
export class DeploymentStateChecker {
  /**
   * Check if a lab is deployed by querying containerlab.
   */
  async checkDeploymentState(
    labName: string,
    topoFilePath: string | undefined,
    updateLabName?: (newLabName: string) => void
  ): Promise<DeploymentState> {
    try {
      await inspector.update();
      if (!inspector.rawInspectData) {
        return "unknown";
      }

      if (this.labExistsByName(labName)) {
        return "deployed";
      }

      if (topoFilePath !== undefined && topoFilePath.length > 0) {
        const matchedLabName = this.findLabByTopoFile(topoFilePath);
        if (matchedLabName !== null && matchedLabName.length > 0) {
          if (updateLabName !== undefined && matchedLabName !== labName) {
            log.info(
              `Updating lab name from '${labName}' to '${matchedLabName}' based on topo-file match`
            );
            updateLabName(matchedLabName);
          }
          return "deployed";
        }
      }

      return "undeployed";
    } catch (err) {
      log.warn(`Failed to check deployment state: ${err}`);
      return "unknown";
    }
  }

  /**
   * Check if a lab with the given name exists in inspect data.
   */
  private labExistsByName(labName: string): boolean {
    const inspectData = inspector.rawInspectData;
    if (inspectData === undefined) {
      return false;
    }
    return labName in inspectData;
  }

  /**
   * Find a lab by its topo-file path and return the lab name if found.
   */
  private findLabByTopoFile(topoFilePath: string): string | null {
    const inspectData = inspector.rawInspectData;
    if (inspectData === undefined) {
      return null;
    }

    const normalizedYamlPath = topoFilePath.replace(/\\/g, "/");

    for (const [deployedLabName, labData] of Object.entries(inspectData)) {
      const topo: unknown = Reflect.get(labData, "topo-file");
      if (!hasNonEmptyString(topo)) {
        continue;
      }
      const normalizedTopoFile = topo.replace(/\\/g, "/");
      if (normalizedTopoFile === normalizedYamlPath) {
        return deployedLabName;
      }
    }

    return null;
  }
}

// Export a singleton instance
export const deploymentStateChecker = new DeploymentStateChecker();
