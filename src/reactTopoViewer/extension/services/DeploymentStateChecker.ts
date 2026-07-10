/**
 * Deployment state checker for React TopoViewer.
 * Queries containerlab inspect data to determine if a lab is deployed.
 */

import * as inspector from "../../../treeView/inspector";
import { getBackendById } from "../../../backends/manager";
import { labRefMatchesLocalSource } from "../../../backends/labIdentity";
import type { DeploymentState } from "@srl-labs/clab-ui/session";

import { formatErrorMessage, log } from "./logger";

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
      return this.resolveFromCache(labName, topoFilePath, updateLabName);
    } catch (err) {
      log.warn(`Failed to check deployment state: ${formatErrorMessage(err)}`);
      return "unknown";
    }
  }

  /**
   * Resolve deployment state from already-fetched inspect data without
   * triggering a refresh. Returns "unknown" when no inspect data is cached
   * yet (e.g. right after activation).
   */
  resolveFromCache(
    labName: string,
    topoFilePath: string | undefined,
    updateLabName?: (newLabName: string) => void
  ): DeploymentState {
    if (!inspector.rawInspectData) {
      return "unknown";
    }

    if (topoFilePath !== undefined && topoFilePath.length > 0) {
      const matchedLabName = this.findLabByLocalSource(labName, topoFilePath);
      if (matchedLabName !== null && matchedLabName.length > 0) {
        if (updateLabName !== undefined && matchedLabName !== labName) {
          log.info(
            `Updating lab name from '${labName}' to '${matchedLabName}' based on topo-file match`
          );
          updateLabName(matchedLabName);
        }
        return "deployed";
      }
      return "undeployed";
    }

    return this.labExistsByName(labName) ? "deployed" : "undeployed";
  }

  /**
   * Check if a lab with the given name exists in inspect data.
   */
  private labExistsByName(labName: string): boolean {
    const inspectData = inspector.rawInspectData;
    if (inspectData === undefined) {
      return false;
    }
    return Object.values(inspectData).some(
      (containers) => containers[0]?.Labels.containerlab === labName
    );
  }

  /**
   * Find a lab by its topo-file path and return the lab name if found.
   */
  private findLabByLocalSource(expectedLabName: string, topoFilePath: string): string | null {
    const inspectData = inspector.rawInspectData;
    if (inspectData === undefined) {
      return null;
    }

    for (const labData of Object.values(inspectData)) {
      const deployedLabName = labData[0]?.Labels.containerlab ?? "";
      const backendId = labData[0]?.Labels["clab-backend-id"] ?? "local";
      const backend = getBackendById(backendId);
      if (backend === undefined) continue;
      const arrayTopology = labData[0]?.Labels["clab-topo-file"];
      const legacyTopology: unknown = Reflect.get(labData, "topo-file");
      let runtimePath: string | undefined;
      if (hasNonEmptyString(arrayTopology)) {
        runtimePath = arrayTopology;
      } else if (hasNonEmptyString(legacyTopology)) {
        runtimePath = legacyTopology;
      }
      const ref = backend.resolveLabRef(deployedLabName, runtimePath);
      if (labRefMatchesLocalSource(ref, backendId, topoFilePath, expectedLabName)) {
        return deployedLabName;
      }
    }

    return null;
  }
}

// Export a singleton instance
export const deploymentStateChecker = new DeploymentStateChecker();
