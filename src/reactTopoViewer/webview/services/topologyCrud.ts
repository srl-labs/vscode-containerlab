/**
 * Topology CRUD Helpers
 *
 * Helper functions for node/link CRUD operations via TopologyIO.
 */

import type { NodeSaveData } from '../../shared/io/NodePersistenceIO';
import type { LinkSaveData } from '../../shared/io/LinkPersistenceIO';

import { getTopologyIO, isServicesInitialized } from './serviceInitialization';

// Re-export types for convenience
export type { NodeSaveData, LinkSaveData };

// Warning message
const WARN_SERVICES_NOT_INIT = '[Services] Cannot perform operation: services not initialized';

/**
 * Create a new node via TopologyIO.
 * Saves to YAML and annotations file.
 */
export async function createNode(nodeData: NodeSaveData): Promise<void> {
  if (!isServicesInitialized()) {
    console.warn(WARN_SERVICES_NOT_INIT);
    return;
  }

  try {
    const topologyIO = getTopologyIO();
    const result = await topologyIO.addNode(nodeData);
    if (!result.success) {
      console.error(`[Services] Failed to create node: ${result.error}`);
    }
  } catch (err) {
    console.error(`[Services] Failed to create node: ${err}`);
  }
}

/**
 * Edit an existing node via TopologyIO.
 * Handles renames and updates annotations.
 */
export async function editNode(nodeData: NodeSaveData): Promise<void> {
  if (!isServicesInitialized()) {
    console.warn(WARN_SERVICES_NOT_INIT);
    return;
  }

  try {
    const topologyIO = getTopologyIO();
    const result = await topologyIO.editNode(nodeData);
    if (!result.success) {
      console.error(`[Services] Failed to edit node: ${result.error}`);
    }
  } catch (err) {
    console.error(`[Services] Failed to edit node: ${err}`);
  }
}

/**
 * Delete a node via TopologyIO.
 * Removes from YAML and annotations file.
 */
export async function deleteNode(nodeId: string): Promise<void> {
  if (!isServicesInitialized()) {
    console.warn(WARN_SERVICES_NOT_INIT);
    return;
  }

  try {
    const topologyIO = getTopologyIO();
    const result = await topologyIO.deleteNode(nodeId);
    if (!result.success) {
      console.error(`[Services] Failed to delete node: ${result.error}`);
    }
  } catch (err) {
    console.error(`[Services] Failed to delete node: ${err}`);
  }
}

/**
 * Create a new link via TopologyIO.
 * Saves to YAML file.
 */
export async function createLink(linkData: LinkSaveData): Promise<void> {
  if (!isServicesInitialized()) {
    console.warn(WARN_SERVICES_NOT_INIT);
    return;
  }

  try {
    const topologyIO = getTopologyIO();
    const result = await topologyIO.addLink(linkData);
    if (!result.success) {
      console.error(`[Services] Failed to create link: ${result.error}`);
    }
  } catch (err) {
    console.error(`[Services] Failed to create link: ${err}`);
  }
}

/**
 * Edit an existing link via TopologyIO.
 */
export async function editLink(linkData: LinkSaveData): Promise<void> {
  if (!isServicesInitialized()) {
    console.warn(WARN_SERVICES_NOT_INIT);
    return;
  }

  try {
    const topologyIO = getTopologyIO();
    const result = await topologyIO.editLink(linkData);
    if (!result.success) {
      console.error(`[Services] Failed to edit link: ${result.error}`);
    }
  } catch (err) {
    console.error(`[Services] Failed to edit link: ${err}`);
  }
}

/**
 * Delete a link via TopologyIO.
 */
export async function deleteLink(linkData: LinkSaveData): Promise<void> {
  if (!isServicesInitialized()) {
    console.warn(WARN_SERVICES_NOT_INIT);
    return;
  }

  try {
    const topologyIO = getTopologyIO();
    const result = await topologyIO.deleteLink(linkData);
    if (!result.success) {
      console.error(`[Services] Failed to delete link: ${result.error}`);
    }
  } catch (err) {
    console.error(`[Services] Failed to delete link: ${err}`);
  }
}

/** Data for network node creation (for non-bridge types) */
export interface NetworkNodeData {
  id: string;
  label: string;
  type: 'host' | 'mgmt-net' | 'macvlan' | 'vxlan' | 'vxlan-stitch' | 'dummy';
  position: { x: number; y: number };
}

/**
 * Create a network node (non-bridge type) via AnnotationsIO.
 * Network nodes like host, vxlan, dummy etc. are stored in networkNodeAnnotations,
 * not in the YAML nodes section.
 */
export async function createNetworkNode(data: NetworkNodeData): Promise<void> {
  if (!isServicesInitialized()) {
    console.warn(WARN_SERVICES_NOT_INIT);
    return;
  }

  try {
    const topologyIO = getTopologyIO();
    const yamlPath = topologyIO.getYamlFilePath();
    if (!yamlPath) {
      console.warn('[Services] No YAML path available for network node creation');
      return;
    }

    const { getAnnotationsIO } = await import('./serviceInitialization');
    const annotationsIO = getAnnotationsIO();
    await annotationsIO.modifyAnnotations(yamlPath, ann => {
      if (!ann.networkNodeAnnotations) ann.networkNodeAnnotations = [];
      ann.networkNodeAnnotations.push({
        id: data.id,
        label: data.label,
        type: data.type,
        position: data.position
      });
      return ann;
    });
  } catch (err) {
    console.error(`[Services] Failed to create network node: ${err}`);
  }
}

/**
 * Save node positions via TopologyIO.
 */
export async function saveNodePositions(positions: Array<{ id: string; position: { x: number; y: number } }>): Promise<void> {
  if (!isServicesInitialized()) {
    console.warn(WARN_SERVICES_NOT_INIT);
    return;
  }

  try {
    const topologyIO = getTopologyIO();
    const result = await topologyIO.savePositions(positions);
    if (!result.success) {
      console.error(`[Services] Failed to save positions: ${result.error}`);
    }
  } catch (err) {
    console.error(`[Services] Failed to save positions: ${err}`);
  }
}

/**
 * Begin a batch operation (defers saves until endBatch).
 */
export function beginBatch(): void {
  if (!isServicesInitialized()) {
    console.warn(WARN_SERVICES_NOT_INIT);
    return;
  }
  const topologyIO = getTopologyIO();
  topologyIO.beginBatch();
}

/**
 * End a batch operation and flush pending saves.
 */
export async function endBatch(): Promise<void> {
  if (!isServicesInitialized()) {
    console.warn(WARN_SERVICES_NOT_INIT);
    return;
  }
  const topologyIO = getTopologyIO();
  await topologyIO.endBatch();
}
