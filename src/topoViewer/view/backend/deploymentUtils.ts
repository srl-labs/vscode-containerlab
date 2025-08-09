import * as YAML from 'yaml';
import { log } from '../../common/backend/logger';
import { ClabLabTreeNode } from '../../../treeView/common';

export type DeploymentState = 'deployed' | 'undeployed' | 'unknown';
export type ViewerMode = 'viewer' | 'editor' | 'unified';

export async function detectDeploymentState(
  yamlContent: string,
  clabTreeData?: Record<string, ClabLabTreeNode>
): Promise<DeploymentState> {
  try {
    const yamlData = YAML.parse(yamlContent);
    const labName = yamlData?.name;

    if (!labName) {
      log.info('Unable to determine lab name from YAML file');
      return 'unknown';
    }

    const runningLabs = clabTreeData;
    if (!runningLabs) {
      log.info('No running labs data available yet');
      return 'unknown';
    }

    const isDeployed = Object.keys(runningLabs).some(
      key => runningLabs[key].name === labName
    );

    const state: DeploymentState = isDeployed ? 'deployed' : 'undeployed';
    log.info(`Lab "${labName}" deployment state: ${state}`);
    return state;
  } catch (error) {
    log.error(`Failed to detect deployment state: ${error}`);
    return 'unknown';
  }
}

export function getViewerMode(state: DeploymentState): ViewerMode {
  switch (state) {
    case 'deployed':
      log.info('Switching to viewer mode - lab is deployed');
      return 'viewer';
    case 'undeployed':
      log.info('Switching to editor mode - lab is undeployed');
      return 'editor';
    default:
      log.info('Using unified mode - deployment state unknown');
      return 'unified';
  }
}
