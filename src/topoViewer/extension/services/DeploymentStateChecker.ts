import { log } from '../../webview/platform/logging/logger';
import * as inspector from "../../../treeView/inspector";

export type DeploymentState = 'deployed' | 'undeployed' | 'unknown';

/**
 * Checks deployment state of containerlab labs by querying inspect data.
 */
export class DeploymentStateChecker {
  /**
   * Check if a lab is deployed by querying containerlab
   */
  async checkDeploymentState(
    labName: string,
    topoFilePath: string | undefined,
    updateLabName?: (newLabName: string) => void
  ): Promise<DeploymentState> {
    try {
      await inspector.update();
      if (!inspector.rawInspectData) return 'unknown';
      if (this.labExistsByName(labName)) return 'deployed';
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
   * Check if a lab with the given name exists in inspect data
   */
  private labExistsByName(labName: string): boolean {
    return labName in (inspector.rawInspectData as any);
  }

  /**
   * Find a lab by its topo-file path and return the lab name if found
   */
  private findLabByTopoFile(topoFilePath: string): string | null {
    const normalizedYamlPath = topoFilePath.replace(/\\/g, '/');
    for (const [deployedLabName, labData] of Object.entries(inspector.rawInspectData as any)) {
      const topo = (labData as any)['topo-file'];
      if (!topo) continue;
      const normalizedTopoFile = (topo as string).replace(/\\/g, '/');
      if (normalizedTopoFile === normalizedYamlPath) {
        return deployedLabName;
      }
    }
    return null;
  }
}

// Export a singleton instance
export const deploymentStateChecker = new DeploymentStateChecker();
