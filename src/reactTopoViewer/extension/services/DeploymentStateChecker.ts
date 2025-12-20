/**
 * Deployment state checker for React TopoViewer.
 * Queries containerlab inspect data to determine if a lab is deployed.
 */

import * as inspector from '../../../treeView/inspector';
import type { DeploymentState } from '../../shared/types/topology';

import { log } from './logger';

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
        return 'unknown';
      }

      if (this.labExistsByName(labName)) {
        return 'deployed';
      }

      if (topoFilePath) {
        const matchedLabName = this.findLabByTopoFile(topoFilePath);
        if (matchedLabName) {
          if (updateLabName && matchedLabName !== labName) {
            log.info(`Updating lab name from '${labName}' to '${matchedLabName}' based on topo-file match`);
            updateLabName(matchedLabName);
          }
          return 'deployed';
        }
      }

      return 'undeployed';
    } catch (err) {
      log.warn(`Failed to check deployment state: ${err}`);
      return 'unknown';
    }
  }

  /**
   * Check if a lab with the given name exists in inspect data.
   */
  private labExistsByName(labName: string): boolean {
    const inspectData = inspector.rawInspectData as Record<string, unknown> | undefined;
    return inspectData ? labName in inspectData : false;
  }

  /**
   * Find a lab by its topo-file path and return the lab name if found.
   */
  private findLabByTopoFile(topoFilePath: string): string | null {
    const inspectData = inspector.rawInspectData as Record<string, Record<string, unknown>> | undefined;
    if (!inspectData) {
      return null;
    }

    const normalizedYamlPath = topoFilePath.replace(/\\/g, '/');

    for (const [deployedLabName, labData] of Object.entries(inspectData)) {
      const topo = labData['topo-file'];
      if (!topo || typeof topo !== 'string') {
        continue;
      }
      const normalizedTopoFile = topo.replace(/\\/g, '/');
      if (normalizedTopoFile === normalizedYamlPath) {
        return deployedLabName;
      }
    }

    return null;
  }
}

// Export a singleton instance
export const deploymentStateChecker = new DeploymentStateChecker();
